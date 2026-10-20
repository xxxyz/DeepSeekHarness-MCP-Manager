// dsh-mcp-manager — host half for DeepSeek Harness 0.2.x.
//
// Modern Cordis plugin shape (DSH 0.2 plugin documentation):
//   * named exports: `name`, `inject`, `Config`, `apply` — no object-form plugin
//   * `inject` declares the hard dependencies; optional services are picked up
//     through `ctx.inject([...], child => ...)` so the plugin stays active in
//     profiles that do not provide them and their registrations follow the
//     service lifecycle
//   * every registration lives in `ctx.effect` / `ctx.on`, so HMR, disable and
//     update dispose it
//
// The plugin owns two surfaces:
//   * model-facing `mcp_manager_*` tools (ctx.tools.register + defineTool)
//   * the same-origin HTTP API used by the Web client half
//
// MCP rows are ordinary `@deepseek-ai/dsh-mcp-client` loader entries. The host
// half writes only the current profile's `cordis.patch.yml`; rows from the
// home patch (`$DSH_HOME/cordis.patch.yml`) are listed read-only because that
// layer outranks the profile and is not an official management target. On a
// live profile it prefers `pluginManager` for toggles and `configEditor` for
// profile config edits, falling back to document-level YAML editing.
//
// Build: `tsc -p tsconfig.json` → lib/index.js.

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { isMap, isSeq, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

// ---------------------------------------------------------------------------
// Minimal structural types for the DSH services this plugin touches. They are
// deliberately local so the package has no compile-time dependency on the full
// internal contracts; every call is still guarded at runtime.
// ---------------------------------------------------------------------------

interface HttpReq {
  url?: string
  method?: string
  headers?: Record<string, string | string[] | undefined>
  on(event: string, callback: (chunk?: unknown) => void): void
}

interface HttpRes {
  writeHead(code: number, headers?: Record<string, string>): void
  end(body?: string): void
}

interface FsService {
  resolve(path: string): Promise<string>
  stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean } | undefined>
  readText(path: string): Promise<string>
  writeText(path: string, content: string, expected?: unknown, signal?: unknown, policy?: unknown): Promise<unknown>
  listDir(path: string): Promise<Array<{ name: string }>>
}

interface SettingsService {
  prepareDocument(): Promise<string>
}

interface SandboxPolicyService {
  resolve(options: { mode: string }): Promise<unknown>
}

interface WebServerService {
  getOrigin?(): string
  register(route: { kind: 'exact'; path: string; handler(req: HttpReq, res: HttpRes): void }): () => void
}

interface ToolsService {
  register(definition: ToolDefinition): () => void
  schemas(scope?: unknown): Array<{ name: string; description?: string; parameters?: unknown }>
}

interface PluginInventoryEntry {
  entryId: string
  patchId?: string
  moduleName: string
  enabled: boolean
  fiberPhase: 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null
  readOnlyReason?: string
}

interface PluginManagerService {
  listPlugins(): Promise<PluginInventoryEntry[]>
  setPluginEnabled(id: string, enabled: boolean): Promise<{
    changed: boolean
    application: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
    error?: { code?: string; diagnostic?: string }
    warnings?: string[]
  }>
}

interface ConfigEditorEntry {
  options: { id: string; config?: Record<string, unknown> }
  fiber?: { state?: number }
}

interface ConfigEditorService {
  entries(): ConfigEditorEntry[]
  edit(entry: ConfigEditorEntry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>): Promise<void>
}

interface AgentLike {
  readonly id: string
  ctx?: {
    get(name: string): unknown
    inject(deps: string[], callback: (child: any) => unknown): { dispose?: () => unknown }
    effect(fn: () => unknown, label?: string): unknown
    on(event: string, listener: (...args: any[]) => unknown): unknown
  }
}

interface AgentsService {
  list(): AgentLike[]
}

interface SkillInvocation {
  modelInvocable: boolean
  userInvocable: boolean
}
interface SkillSummary {
  name: string
  description: string
  whenToUse?: string
  invocation: SkillInvocation
  source: string
  provider: string
  resourceBase?: unknown
  path?: string
}
interface SkillCandidate extends SkillSummary {
  rank: number
  locator: unknown
}
interface SkillDefinition extends SkillSummary {
  content: string
  metadata?: unknown
}
interface SkillProviderControl {
  signal: { aborted: boolean; addEventListener(type: string, fn: () => void, opts?: unknown): void }
  invalidate(): void
}
interface SkillProvider {
  name: string
  list(options?: unknown): Promise<SkillCandidate[] | { candidates: SkillCandidate[]; complete: boolean }>
  get(candidate: SkillSummary, options?: unknown): Promise<SkillDefinition | undefined>
}
interface SkillService {
  registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void
  snapshot(options?: unknown): Promise<{ skills: SkillSummary[]; complete: boolean }>
  get(name: string, options?: unknown): Promise<SkillDefinition | undefined>
}

interface DshContext {
  timer: unknown
  fs: FsService
  tools: ToolsService
  timeout(delay: number): Promise<void>
  get(name: string): unknown
  inject(deps: string[], callback: (child: any) => unknown): unknown
  effect(fn: () => unknown, label?: string): unknown
  on(event: string, listener: (...args: any[]) => unknown, options?: unknown): unknown
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const Config = z.object({
  token: z.string().default('').description('Optional access token required by state-changing HTTP API operations (x-dsh-token).'),
})

export type ManagerConfig = { token?: string }

export const name = 'dsh-mcp-manager'
export const inject = ['timer', 'fs', 'tools']

const MCP_NAME = '@deepseek-ai/dsh-mcp-client'
const OVERRIDE_PROVIDER = 'dsh-mcp-manager-override'
const AGENT_OVERRIDE_PROVIDER = 'dsh-mcp-manager-agent-override'
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/
const MAX_BODY = 1024 * 1024
const MAX_TIMER_MS = 2_147_483_647

type Layer = 'profile' | 'home'

interface ManagedRow {
  id: string
  name?: string
  serverName: string
  level: Layer | 'loader'
  disabled: boolean
  config: Record<string, any>
  live?: { enabled: boolean; phase: string | null; entryId?: string; addressable: boolean; readOnlyReason?: string }
  toolCount?: number
  readOnly?: boolean
  readOnlyReason?: 'home' | 'loader' | 'overridden-by-home' | string
}

interface Paths {
  home: string
  profileDir: string
  profileName: string
  profilePatch: string
  homePatch: string
}

// ---------------------------------------------------------------------------
// Package version (shown in both Settings pages and the API)
// ---------------------------------------------------------------------------

function packageVersion(): string {
  try {
    const req = createRequire(import.meta.url)
    const pkg = req('../package.json') as { version?: string }
    return pkg.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

const message = (e: unknown) => String((e && (e as Error).message) || e)

// The scope tag is a module-local symbol in @deepseek-ai/dsh-scope. Importing
// that package from a plugin can resolve a second copy, whose symbol would not
// match the contexts DSH minted. Read the tag from the context itself instead:
// the scope key lives on an own `Symbol('dsh.scope')` property somewhere on the
// context's prototype chain.
function scopeKeyOf(ctx: unknown): object | undefined {
  try {
    let cursor = ctx as Record<PropertyKey, unknown> | null
    for (let depth = 0; cursor && depth < 24; depth++) {
      for (const key of Object.getOwnPropertySymbols(cursor)) {
        if (key.description === 'dsh.scope') {
          const value = cursor[key]
          if (value && (typeof value === 'object' || typeof value === 'function')) return value as object
        }
      }
      cursor = Object.getPrototypeOf(cursor) as Record<PropertyKey, unknown> | null
    }
  } catch {
    /* a hostile or unusual context simply has no visible scope tag */
  }
  return undefined
}

// ---------------------------------------------------------------------------
// YAML helpers — document-level editing preserves comments and !!js nodes.
// ---------------------------------------------------------------------------

type PatchDoc = ReturnType<typeof parseDocument>

const JS_TAG = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value: string) => value,
}

function loadDoc(text: string): PatchDoc {
  const doc = parseDocument(text && text.trim() ? text : '[]\n', { customTags: [JS_TAG] })
  if (doc.errors.length > 0) throw new Error('invalid YAML: ' + doc.errors[0].message)
  if (doc.contents === null || doc.contents === undefined) {
    doc.contents = doc.createNode([]) as any
  }
  if (!isSeq(doc.contents)) throw new Error('patch file must be a top-level YAML array')
  // New `createNode` values inside an existing flow sequence would be emitted as
  // flow collections; keep the human-readable block style the rest of a DSH
  // patch file uses.
  doc.contents.flow = false
  return doc
}

function topItems(doc: PatchDoc): unknown[] {
  return isSeq(doc.contents) ? doc.contents.items : []
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function toPlain(node: unknown): any {
  if (node && typeof (node as { toJSON?: unknown }).toJSON === 'function') {
    try {
      return (node as { toJSON(): unknown }).toJSON()
    } catch {
      /* fall through */
    }
  }
  return node
}

function configOf(node: unknown): Record<string, any> {
  const v = toPlain(node)
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {}
}

interface RowSeed {
  id: string
  level: Layer
  config: Record<string, any>
  disabled: boolean
}

interface OverrideSeed {
  id: string
  hasConfig: boolean
  config: Record<string, any>
  hasDisabled: boolean
  disabled: boolean
}

function parsePatchText(text: string, level: Layer): { inserts: RowSeed[]; overrides: OverrideSeed[] } {
  const doc = loadDoc(text)
  const inserts: RowSeed[] = []
  const overrides: OverrideSeed[] = []

  for (const item of topItems(doc)) {
    if (!isMap(item)) continue
    const insert = item.get('insert')
    if (isSeq(insert)) {
      for (const child of insert.items) {
        if (!isMap(child)) continue
        if (str(child.get('name')) !== MCP_NAME) continue
        const id = str(child.get('id'))
        if (!id) continue
        inserts.push({
          id,
          level,
          config: configOf(child.get('config')),
          disabled: child.get('disabled') === true,
        })
      }
      continue
    }
    const id = str(item.get('id'))
    if (!id) continue
    const declaredName = item.get('name')
    if (declaredName !== undefined && declaredName !== null && str(declaredName) !== MCP_NAME) continue
    overrides.push({
      id,
      config: configOf(item.get('config')),
      hasConfig: isMap(item.get('config')),
      disabled: item.get('disabled') === true,
      hasDisabled: item.has('disabled'),
    })
  }
  return { inserts, overrides }
}

function ensureInsertSeq(doc: PatchDoc): YAMLSeq {
  for (const item of topItems(doc)) {
    if (!isMap(item)) continue
    const insert = item.get('insert')
    if (isSeq(insert)) return insert
  }
  const row = doc.createNode({ insert: [] }) as YAMLMap
  ;(doc.contents as YAMLSeq).items.push(row)
  return row.get('insert') as YAMLSeq
}

function findInsertChild(doc: PatchDoc, id: string): YAMLMap | null {
  for (const item of topItems(doc)) {
    if (!isMap(item)) continue
    const insert = item.get('insert')
    if (!isSeq(insert)) continue
    for (const child of insert.items) {
      if (isMap(child) && str(child.get('id')) === id) return child
    }
  }
  return null
}

function isBareOverride(item: unknown): item is YAMLMap {
  return isMap(item) && !item.has('insert')
}

function clearDisabledOverrides(doc: PatchDoc, id: string): void {
  const seq = doc.contents as YAMLSeq
  seq.items = seq.items.filter((item) => {
    if (!isBareOverride(item) || str(item.get('id')) !== id) return true
    if (item.has('config')) {
      if (item.has('disabled')) item.delete('disabled')
      return true
    }
    return false
  })
}

function appendDisabledOverride(doc: PatchDoc, id: string, disabled: boolean): void {
  ;(doc.contents as YAMLSeq).items.push(doc.createNode({ id, name: MCP_NAME, disabled }))
}

function setDisabledInDoc(doc: PatchDoc, id: string, disabled: boolean): void {
  clearDisabledOverrides(doc, id)
  const child = findInsertChild(doc, id)
  const insertDisabled = child ? child.get('disabled') === true : false
  if (disabled) appendDisabledOverride(doc, id, true)
  else if (insertDisabled) appendDisabledOverride(doc, id, false)
}

function upsertInDoc(doc: PatchDoc, id: string, config: Record<string, any>): void {
  const seq = ensureInsertSeq(doc)
  let child: YAMLMap | null = null
  for (const item of seq.items) {
    if (isMap(item) && str(item.get('id')) === id) {
      child = item
      break
    }
  }
  if (child) {
    child.set('name', MCP_NAME)
    child.set('config', doc.createNode(config))
  } else {
    seq.items.push(doc.createNode({ id, name: MCP_NAME, config }))
  }
  // A profile-level config override wins over the insert row; keep it aligned.
  for (const item of topItems(doc)) {
    if (isBareOverride(item) && str(item.get('id')) === id && item.has('config')) {
      item.set('config', doc.createNode(config))
    }
  }
}

function removeFromDoc(doc: PatchDoc, id: string): void {
  const seq = doc.contents as YAMLSeq
  for (let i = seq.items.length - 1; i >= 0; i--) {
    const item = seq.items[i]
    if (!isMap(item)) continue
    const insert = item.get('insert')
    if (isSeq(insert)) {
      insert.items = insert.items.filter((child) => !(isMap(child) && str(child.get('id')) === id))
      if (insert.items.length === 0) seq.items.splice(i, 1)
      continue
    }
    if (str(item.get('id')) === id) seq.items.splice(i, 1)
  }
}

// ---------------------------------------------------------------------------
// MCP config normalization
// ---------------------------------------------------------------------------

function has(obj: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v))
  const text = typeof value === 'string' ? value : value == null ? '' : String(value)
  if (!text.trim()) return []
  // Newlines are the unambiguous separator (paths may contain spaces); a
  // single-line value keeps the historical space/comma-separated convenience.
  const lines = /\r?\n/.test(text)
    ? text.split(/\r?\n/).map((s) => s.trim().replace(/,$/, '')).filter(Boolean)
    : text.split(/[\s,]+/).filter(Boolean)
  return lines
}

function asStringMap(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, string> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) out[key] = String((value as Record<string, unknown>)[key])
    return out
  }
  const out: Record<string, string> = {}
  for (const line of String(value ?? '').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

function optionalNumber(input: Record<string, any>, current: Record<string, any>, key: string, min: number, max: number): number | undefined {
  const raw = has(input, key) ? input[key] : current[key]
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}`)
  }
  return n
}

function optionalBoolean(input: Record<string, any>, current: Record<string, any>, key: string): boolean | undefined {
  if (!has(input, key)) {
    if (has(current, key)) return current[key] === true
    return undefined
  }
  const raw = input[key]
  if (typeof raw === 'boolean') return raw
  const text = String(raw ?? '').trim().toLowerCase()
  if (text === 'true' || text === '1' || text === 'yes' || text === 'on') return true
  if (text === 'false' || text === '0' || text === 'no' || text === 'off') return false
  throw new Error(`${key} must be a boolean`)
}

function normalizeMcpConfig(input: Record<string, any>, current: Record<string, any> = {}): Record<string, any> {
  const serverName = String(has(input, 'serverName') ? input.serverName : current.serverName ?? '').trim()
  if (!SERVER_NAME_RE.test(serverName)) throw new Error('serverName must be 1-32 characters of [A-Za-z0-9_-]')
  const transport = (has(input, 'transport') ? input.transport : current.transport) === 'stdio' ? 'stdio' : 'streamable-http'

  const config: Record<string, any> = { ...current }
  for (const key of ['serverName', 'transport', 'command', 'args', 'env', 'cwd', 'url', 'headers', 'toolCallTimeoutMs', 'failOnStartupError', 'maxInstructionBytes', 'reconnect']) {
    delete config[key]
  }
  config.serverName = serverName
  config.transport = transport
  if (transport === 'stdio') {
    const command = String(has(input, 'command') ? input.command : current.command ?? '').trim()
    if (!command) throw new Error('command is required for stdio')
    config.command = command
    const args = has(input, 'args') ? asStringArray(input.args) : asStringArray(current.args ?? [])
    if (args.length > 0) config.args = args
    const env = has(input, 'env') ? asStringMap(input.env) : asStringMap(current.env ?? {})
    if (Object.keys(env).length > 0) config.env = env
    const cwd = String(has(input, 'cwd') ? input.cwd : current.cwd ?? '').trim()
    if (cwd) config.cwd = cwd
  } else {
    const url = String(has(input, 'url') ? input.url : current.url ?? '').trim()
    if (!/^https?:\/\//i.test(url)) throw new Error('url must start with http:// or https://')
    config.url = url
    const headers = has(input, 'headers') ? asStringMap(input.headers) : asStringMap(current.headers ?? {})
    if (Object.keys(headers).length > 0) config.headers = headers
  }

  const timeout = optionalNumber(input, current, 'toolCallTimeoutMs', 1, 24 * 60 * 60 * 1000)
  if (timeout !== undefined && timeout !== 60_000) config.toolCallTimeoutMs = timeout
  const failOnStartupError = optionalBoolean(input, current, 'failOnStartupError')
  if (failOnStartupError === true) config.failOnStartupError = true
  const maxInstructionBytes = optionalNumber(input, current, 'maxInstructionBytes', 1, 4 * 1024 * 1024)
  if (maxInstructionBytes !== undefined && maxInstructionBytes !== 32_768) config.maxInstructionBytes = maxInstructionBytes

  const currentReconnect = current.reconnect && typeof current.reconnect === 'object' ? current.reconnect : {}
  const inputReconnect = input.reconnect && typeof input.reconnect === 'object' ? input.reconnect : {}
  const reconnect: Record<string, any> = {}
  const enabled = optionalBoolean(inputReconnect, currentReconnect, 'enabled')
  if (enabled !== undefined && enabled !== true) reconnect.enabled = enabled
  const initialDelayMs = optionalNumber(inputReconnect, currentReconnect, 'initialDelayMs', 1, MAX_TIMER_MS)
  if (initialDelayMs !== undefined && initialDelayMs !== 500) reconnect.initialDelayMs = initialDelayMs
  const maxDelayMs = optionalNumber(inputReconnect, currentReconnect, 'maxDelayMs', 1, MAX_TIMER_MS)
  if (maxDelayMs !== undefined && maxDelayMs !== 30_000) reconnect.maxDelayMs = maxDelayMs
  const maxAttempts = optionalNumber(inputReconnect, currentReconnect, 'maxAttempts', 1, 1_000_000)
  if (maxAttempts !== undefined && maxAttempts !== 10) reconnect.maxAttempts = maxAttempts
  if (Object.keys(reconnect).length > 0) config.reconnect = reconnect

  // Flat model-tool inputs (`reconnectEnabled`, etc.) are accepted too.
  const flatEnabled = optionalBoolean(input, {}, 'reconnectEnabled')
  if (flatEnabled !== undefined && flatEnabled !== true) config.reconnect = { ...(config.reconnect || {}), enabled: flatEnabled }
  const flatInitial = optionalNumber(input, {}, 'reconnectInitialDelayMs', 1, MAX_TIMER_MS)
  if (flatInitial !== undefined && flatInitial !== 500) config.reconnect = { ...(config.reconnect || {}), initialDelayMs: flatInitial }
  const flatMax = optionalNumber(input, {}, 'reconnectMaxDelayMs', 1, MAX_TIMER_MS)
  if (flatMax !== undefined && flatMax !== 30_000) config.reconnect = { ...(config.reconnect || {}), maxDelayMs: flatMax }
  const flatAttempts = optionalNumber(input, {}, 'reconnectMaxAttempts', 1, 1_000_000)
  if (flatAttempts !== undefined && flatAttempts !== 10) config.reconnect = { ...(config.reconnect || {}), maxAttempts: flatAttempts }

  return config
}

// ---------------------------------------------------------------------------
// Skill frontmatter (mirrors dsh-skill-filesystem's accepted shape)
// ---------------------------------------------------------------------------

function parseFrontmatterBoolean(val: string): boolean | undefined {
  const v = val.toLowerCase()
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false
  return undefined
}

interface ParsedSkillFile {
  fm: { name: string; description: string; whenToUse?: string; userInvocable?: boolean; disableModelInvocation?: boolean }
  content: string
}

function parseSkillFile(raw: string): ParsedSkillFile | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (!m) return null
  const fields = new Map<string, string>()
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    fields.set(kv[1], kv[2].trim().replace(/^['"]|['"]$/g, ''))
  }
  if (fields.has('userInvocable') || fields.has('modelInvocable')) return null
  const name = fields.get('name')
  const description = fields.get('description')
  if (!name || description === undefined || description === '') return null
  const fm: ParsedSkillFile['fm'] = { name, description }
  const wtu = fields.get('whenToUse') ?? fields.get('when-to-use')
  if (wtu) fm.whenToUse = wtu
  const ui = fields.get('user-invocable')
  if (ui !== undefined) {
    const b = parseFrontmatterBoolean(ui)
    if (b === undefined) return null
    fm.userInvocable = b
  }
  const dmi = fields.get('disable-model-invocation')
  if (dmi !== undefined) {
    const b = parseFrontmatterBoolean(dmi)
    if (b === undefined) return null
    fm.disableModelInvocation = b
  }
  return { fm, content: raw.slice(m[0].length).replace(/^\r?\n+/, '') }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function apply(ctx: DshContext, config?: ManagerConfig): void {
  const fs = ctx.fs
  const tools = ctx.tools
  const pkgVersion = packageVersion()
  const TOKEN = String(config?.token || process.env.DSH_MCP_MANAGER_TOKEN || '').trim()
  const WRITE_OPS = new Set([
    'mcpm-add', 'mcpm-edit', 'mcpm-remove', 'mcpm-set-enabled', 'mcpm-restart',
    'mcpm-export', 'mcpm-import', 'skill-toggle',
  ])

  const wait = (ms: number) => ctx.timeout(ms)
  const optional = <T>(name: string): T | undefined => {
    try {
      return ctx.get(name) as T | undefined
    } catch {
      return undefined
    }
  }

  let writeChain: Promise<void> = Promise.resolve()
  function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = writeChain.then(fn, fn)
    writeChain = run.then(() => undefined, () => undefined)
    return run
  }

  // ---------- paths ----------
  let pathsCache: Paths | null = null
  async function paths(): Promise<Paths> {
    if (pathsCache) return pathsCache
    let home = String(process.env.DSH_HOME || '').trim() || ''
    let profileDir = String(process.env.DSH_PROFILE_DIR || '').trim() || ''
    let profileName = String(process.env.DSH_PROFILE || '').trim()
    if (!profileDir) {
      const settings = optional<SettingsService>('settings')
      if (settings?.prepareDocument) {
        try {
          const doc = await settings.prepareDocument()
          if (typeof doc === 'string' && doc) {
            profileDir = dirname(doc)
            profileName = profileName || basename(profileDir)
            home = home || dirname(dirname(profileDir))
          }
        } catch {
          /* fall through to the scan */
        }
      }
    }
    if (!home) home = join(homedir(), '.dsh')
    if (!profileDir) {
      const candidates = ['desktop', 'web', 'headless']
      if (profileName && !candidates.includes(profileName)) candidates.unshift(profileName)
      for (const candidate of candidates) {
        const dir = join(home, 'profiles', candidate)
        if (await exists(join(dir, 'cordis.patch.yml'))) {
          profileDir = dir
          profileName = candidate
          break
        }
      }
    }
    if (!profileDir) {
      profileName = profileName || 'web'
      profileDir = join(home, 'profiles', profileName)
    }
    pathsCache = {
      home,
      profileDir,
      profileName,
      profilePatch: join(profileDir, 'cordis.patch.yml'),
      homePatch: join(home, 'cordis.patch.yml'),
    }
    return pathsCache
  }

  async function exists(abs: string): Promise<boolean> {
    try {
      return (await fs.stat(await fs.resolve(abs))) !== undefined
    } catch {
      return false
    }
  }

  async function readPatch(abs: string): Promise<string> {
    try {
      return await fs.readText(await fs.resolve(abs))
    } catch (e) {
      if (String((e as { code?: string }).code) === 'FS_NOT_FOUND') return ''
      throw e
    }
  }

  async function writePatch(abs: string, content: string): Promise<void> {
    const policy = optional<SandboxPolicyService>('sandboxPolicy')
    const resolved = policy ? await policy.resolve({ mode: 'danger-full-access' }) : undefined
    await fs.writeText(await fs.resolve(abs), content, undefined, undefined, resolved)
  }

  async function profilePatch(): Promise<string> {
    return (await paths()).profilePatch
  }

  // ---------- skill state ----------
  const overrideSkills = new Map<string, SkillDefinition>()
  let skills: SkillService | null = null
  let agents: AgentsService | null = null
  let skillStateLoaded = false
  let userSkillCache: { at: number; rows: SkillDefinition[] } | null = null

  async function skillStatePath(): Promise<string> {
    return join((await paths()).profileDir, 'dsh-skill-manager.json')
  }

  async function readDisabledNames(): Promise<string[]> {
    try {
      const raw = await fs.readText(await fs.resolve(await skillStatePath()))
      const data = JSON.parse(raw)
      return Array.isArray(data.disabledSkills)
        ? data.disabledSkills.filter((n: unknown): n is string => typeof n === 'string' && SKILL_NAME_RE.test(n))
        : []
    } catch {
      return []
    }
  }

  async function writeDisabledNames(names: string[]): Promise<void> {
    const policy = optional<SandboxPolicyService>('sandboxPolicy')
    const resolved = policy ? await policy.resolve({ mode: 'danger-full-access' }) : undefined
    await fs.writeText(
      await fs.resolve(await skillStatePath()),
      JSON.stringify({ version: 1, disabledSkills: [...new Set(names)].sort() }, null, 2),
      undefined,
      undefined,
      resolved,
    )
  }

  let disabledNames = new Set<string>()

  async function saveSkillState(): Promise<void> {
    const names = new Set(disabledNames)
    for (const name of overrideSkills.keys()) names.add(name)
    disabledNames = names
    await writeDisabledNames([...disabledNames])
  }

  function makeOverrideProvider(providerName: string): SkillProvider {
    return {
      name: providerName,
      async list() {
        const candidates: SkillCandidate[] = []
        for (const def of overrideSkills.values()) {
          candidates.push({
            name: def.name,
            description: def.description,
            ...(def.whenToUse !== undefined ? { whenToUse: def.whenToUse } : {}),
            invocation: { modelInvocable: false, userInvocable: false },
            source: def.source || 'custom',
            provider: providerName,
            ...(def.path !== undefined ? { path: def.path } : {}),
            ...(def.resourceBase !== undefined ? { resourceBase: def.resourceBase } : {}),
            rank: 0,
            locator: def.name,
          })
        }
        return candidates
      },
      async get(candidate: SkillSummary) {
        const def = overrideSkills.get(candidate.name)
        if (!def) return undefined
        return {
          ...def,
          provider: providerName,
          invocation: { modelInvocable: false, userInvocable: false },
        }
      },
    }
  }

  interface AgentSkillView {
    service: SkillService
    scope?: object
    invalidate: () => void
    dispose: () => void
  }
  const agentViews = new Map<string, AgentSkillView>()
  const agentInjects = new Map<string, { dispose?: () => unknown }>()
  let globalProviderControl: SkillProviderControl | null = null

  function invalidateProviders(): void {
    try {
      globalProviderControl?.invalidate?.()
    } catch {
      /* ignore */
    }
    for (const view of agentViews.values()) {
      try {
        view.invalidate()
      } catch {
        /* ignore */
      }
    }
  }

  function userSkillRoots(): Array<{ dir: string; source: string }> {
    const roots: Array<{ dir: string; source: string }> = []
    const overrideDir = String(process.env.DSH_MCP_MANAGER_SKILLS_DIR || '').trim()
    if (overrideDir) {
      roots.push({ dir: overrideDir, source: 'user-dsh' })
      return roots
    }
    const dshHome = String(process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
    roots.push({ dir: join(dshHome, 'skills'), source: 'user-dsh' })
    const agentsHome = String(process.env.DSH_AGENTS_HOME || '').trim() || join(homedir(), '.agents')
    roots.push({ dir: join(agentsHome, 'skills'), source: 'user-agents' })
    return roots
  }

  async function scanSkillRoot(root: { dir: string; source: string }): Promise<SkillDefinition[]> {
    let entries: Array<{ name: string }> = []
    try {
      entries = await fs.listDir(await fs.resolve(root.dir))
    } catch {
      return []
    }
    const rows: SkillDefinition[] = []
    const seen = new Set<string>()
    for (const ent of entries) {
      const entryName = String(ent.name || '')
      if (!entryName || entryName === '.system') continue
      let path = join(root.dir, entryName, 'SKILL.md')
      let directory = join(root.dir, entryName)
      let raw = ''
      try {
        raw = await fs.readText(await fs.resolve(path))
      } catch {
        if (!entryName.endsWith('.md')) continue
        path = join(root.dir, entryName)
        directory = root.dir
        try {
          raw = await fs.readText(await fs.resolve(path))
        } catch {
          continue
        }
      }
      const parsed = parseSkillFile(raw)
      if (!parsed) continue
      if (!SKILL_NAME_RE.test(parsed.fm.name) || seen.has(parsed.fm.name)) continue
      seen.add(parsed.fm.name)
      rows.push({
        name: parsed.fm.name,
        description: parsed.fm.description,
        ...(parsed.fm.whenToUse !== undefined ? { whenToUse: parsed.fm.whenToUse } : {}),
        invocation: {
          modelInvocable: parsed.fm.disableModelInvocation !== true,
          userInvocable: parsed.fm.userInvocable !== false,
        },
        source: root.source,
        provider: 'filesystem',
        resourceBase: { kind: 'directory', path: directory },
        path,
        content: parsed.content,
      })
    }
    return rows
  }

  async function scanUserSkills(force = false): Promise<SkillDefinition[]> {
    const now = Date.now()
    if (!force && userSkillCache && now - userSkillCache.at < 2000) return userSkillCache.rows
    const rows: SkillDefinition[] = []
    const seen = new Set<string>()
    for (const root of userSkillRoots()) {
      for (const row of await scanSkillRoot(root)) {
        if (seen.has(row.name)) continue
        seen.add(row.name)
        rows.push(row)
      }
    }
    userSkillCache = { at: now, rows }
    return rows
  }

  function agentSkillViews(): AgentSkillView[] {
    return [...agentViews.values()]
  }

  async function lookupSkill(name: string): Promise<SkillDefinition | undefined> {
    if (skills) {
      try {
        const def = await skills.get(name)
        if (def) return def
      } catch {
        /* ignore one scope */
      }
    }
    for (const view of agentSkillViews()) {
      try {
        const def = await view.service.get(name, view.scope ? { scope: view.scope } : {})
        if (def) return def
      } catch {
        /* ignore one scope */
      }
    }
    return (await scanUserSkills()).find((s) => s.name === name)
  }

  async function ensureRestored(force = false): Promise<void> {
    if (!skillStateLoaded || force) {
      const names = await readDisabledNames()
      disabledNames = new Set(names)
      skillStateLoaded = true
    }
    let changed = false
    for (const name of disabledNames) {
      if (overrideSkills.has(name)) continue
      const def = await lookupSkill(name)
      if (!def) continue
      overrideSkills.set(name, {
        ...def,
        provider: OVERRIDE_PROVIDER,
        invocation: { modelInvocable: false, userInvocable: false },
      })
      changed = true
    }
    // State entries whose skill disappeared are kept in the file (the skill can
    // come back) but have no live override.
    if (changed) await saveSkillState()
  }

  function restoreSkillStateQuietly(): void {
    void ensureRestored(true).catch((e) => {
      console.warn('[dsh-mcp-manager] skill state restore failed:', message(e))
    })
  }

  function registerAgentOverrides(agent: AgentLike): void {
    const id = String(agent?.id || '')
    const agentCtx = agent?.ctx
    if (!id || !agentCtx || agentViews.has(id)) return
    let fiber: { dispose?: () => unknown } | undefined
    let control: SkillProviderControl | null = null
    try {
      fiber = agentCtx.inject(['skills'], (child: any) => {
        const service = child.get('skills') as SkillService | undefined
        if (!service) return
        const scope = scopeKeyOf(child)
        const view: AgentSkillView = {
          service,
          ...(scope ? { scope } : {}),
          invalidate: () => {
            try {
              control?.invalidate?.()
            } catch {
              /* ignore */
            }
          },
          dispose: () => {
            try {
              fiber?.dispose?.()
            } catch {
              /* ignore */
            }
            agentInjects.delete(id)
            agentViews.delete(id)
          },
        }
        agentViews.set(id, view)
        // Register the override in the agent's own scope, so preset/project/user
        // skills are shadowed for that session (a global provider cannot do this).
        child.effect(() => child.skills.registerProvider((c: SkillProviderControl) => {
          control = c
          return makeOverrideProvider(AGENT_OVERRIDE_PROVIDER)
        }))
      })
      if (fiber) agentInjects.set(id, fiber)
    } catch {
      return
    }
    // Drop the bookkeeping when the agent scope itself is disposed.
    try {
      agentCtx.effect(() => () => {
        agentViews.delete(id)
        agentInjects.delete(id)
      })
    } catch {
      /* ignore */
    }
  }

  // Optional services: every registration below follows the service lifetime.
  ctx.inject(['skills'], (child: any) => {
    const service = child.get('skills') as SkillService | undefined
    if (!service) return
    skills = service
    child.on('skills/change', () => {
      restoreSkillStateQuietly()
    })
    child.effect(() => child.skills.registerProvider((control: SkillProviderControl) => {
      globalProviderControl = control
      return makeOverrideProvider(OVERRIDE_PROVIDER)
    }))
    restoreSkillStateQuietly()
  })

  ctx.inject(['agents'], (child: any) => {
    const service = child.get('agents') as AgentsService | undefined
    if (!service) return
    agents = service
    child.on('agent/created', (payload: { agent: AgentLike }) => registerAgentOverrides(payload.agent))
    for (const agent of agents.list()) registerAgentOverrides(agent)
  })

  ctx.effect(() => () => {
    for (const view of [...agentViews.values()]) view.dispose()
    for (const fiber of agentInjects.values()) {
      try {
        fiber.dispose?.()
      } catch {
        /* ignore */
      }
    }
    agentInjects.clear()
    agentViews.clear()
  })

  async function skillList() {
    await ensureRestored(true)
    const byName = new Map<string, SkillSummary>()
    const merge = (row: SkillSummary) => {
      const existing = byName.get(row.name)
      if (!existing) {
        byName.set(row.name, row)
        return
      }
      if (existing.provider === OVERRIDE_PROVIDER || existing.provider === AGENT_OVERRIDE_PROVIDER) byName.set(row.name, row)
    }
    if (skills) {
      try {
        const snap = await skills.snapshot({})
        for (const row of snap.skills) merge(row)
      } catch {
        /* ignore */
      }
    }
    for (const view of agentSkillViews()) {
      try {
        const snap = await view.service.snapshot(view.scope ? { scope: view.scope } : {})
        for (const row of snap.skills) merge(row)
      } catch {
        /* ignore one scope */
      }
    }
    for (const row of await scanUserSkills(true)) merge(row)

    const rows = [...byName.values()]
      .map((row) => {
        const userLevel = row.source === 'user-dsh' || row.source === 'user-agents'
        const disabled = disabledNames.has(row.name) || row.provider === OVERRIDE_PROVIDER || row.provider === AGENT_OVERRIDE_PROVIDER
        return {
          name: row.name,
          description: row.description,
          ...(row.whenToUse !== undefined ? { whenToUse: row.whenToUse } : {}),
          invocation: disabled ? { modelInvocable: false, userInvocable: false } : row.invocation,
          source: row.source,
          provider: disabled && row.provider !== AGENT_OVERRIDE_PROVIDER ? OVERRIDE_PROVIDER : row.provider,
          ...(row.path !== undefined ? { path: row.path } : {}),
          userLevel,
          disabled,
        }
      })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    return { ok: true, skills: rows, complete: true, agents: agents?.list().length || 0 }
  }

  async function skillToggle(args: { name?: string; enabled?: boolean }) {
    const name = String(args.name || '').trim()
    if (!name) return { ok: false, error: 'skill name is required' }
    if (typeof args.enabled !== 'boolean') return { ok: false, error: 'enabled must be a boolean' }
    if (!SKILL_NAME_RE.test(name)) return { ok: false, error: 'skill name must be kebab-case' }
    await ensureRestored(true)
    const enabled = args.enabled
    return withWriteLock(async () => {
      if (enabled) {
        overrideSkills.delete(name)
        disabledNames.delete(name)
        await saveSkillState()
        invalidateProviders()
        return { ok: true }
      }
      if (!overrideSkills.has(name)) {
        const def = await lookupSkill(name)
        if (!def) return { ok: false, error: 'skill not found: ' + name }
        overrideSkills.set(name, {
          ...def,
          provider: OVERRIDE_PROVIDER,
          invocation: { modelInvocable: false, userInvocable: false },
        })
      }
      disabledNames.add(name)
      await saveSkillState()
      invalidateProviders()
      return { ok: true }
    })
  }

  // ---------- MCP read/write ----------
  async function collectRows(): Promise<{ rows: ManagedRow[]; errors: string[] }> {
    const errors: string[] = []
    const rows = new Map<string, ManagedRow>()
    const overrides: Array<{ level: Layer; seed: OverrideSeed }> = []
    const p = await paths()
    for (const layer of [
      { level: 'profile' as Layer, abs: p.profilePatch },
      { level: 'home' as Layer, abs: p.homePatch },
    ]) {
      try {
        const parsed = parsePatchText(await readPatch(layer.abs), layer.level)
        for (const seed of parsed.inserts) {
          rows.set(seed.id, {
            id: seed.id,
            name: MCP_NAME,
            serverName: str(seed.config.serverName) || seed.id,
            level: seed.level,
            disabled: seed.disabled,
            config: seed.config,
            ...(seed.level === 'home' ? { readOnly: true, readOnlyReason: 'home' as const } : {}),
          })
        }
        for (const seed of parsed.overrides) overrides.push({ level: layer.level, seed })
      } catch (e) {
        errors.push(`${layer.level}: ${message(e)}`)
      }
    }

    // Patch layers apply in order (profile first, then the home patch). A home
    // override can target a profile row, and since home outranks profile the
    // row is effectively read-only for this manager.
    const homeOverridden = new Set<string>()
    for (const { level, seed } of overrides) {
      if (level === 'home') homeOverridden.add(seed.id)
      const row = rows.get(seed.id)
      if (!row) continue
      if (seed.hasConfig) row.config = seed.config
      if (seed.hasDisabled) row.disabled = seed.disabled
    }
    for (const row of rows.values()) {
      row.serverName = str(row.config.serverName) || row.id
      if (row.level === 'profile' && homeOverridden.has(row.id)) {
        row.readOnly = true
        row.readOnlyReason = 'overridden-by-home'
      }
    }
    return { rows: [...rows.values()], errors }
  }

  async function listLive(): Promise<PluginInventoryEntry[]> {
    const manager = optional<PluginManagerService>('pluginManager')
    if (!manager?.listPlugins) return []
    try {
      const entries = await manager.listPlugins()
      return entries.filter((e) => e.moduleName === MCP_NAME)
    } catch {
      return []
    }
  }

  function liveFor(entryId: string | undefined, live: PluginInventoryEntry[]): PluginInventoryEntry | undefined {
    if (!entryId) return undefined
    const tail = entryId.includes(':') ? entryId.slice(entryId.lastIndexOf(':') + 1) : entryId
    return live.find((e) => e.patchId === entryId) || live.find((e) => e.patchId === tail) || live.find((e) => e.entryId === entryId) || live.find((e) => e.entryId.endsWith(':' + tail))
  }

  async function mcpmList() {
    const p = await paths()
    const collected = await collectRows()
    const live = await listLive()
    const toolCounts: Record<string, number> = {}
    try {
      for (const schema of tools.schemas()) {
        const m = String(schema?.name || '').match(/^mcp__([A-Za-z0-9_-]+)__/)
        if (m) toolCounts[m[1]] = (toolCounts[m[1]] || 0) + 1
      }
    } catch {
      /* ignore */
    }

    const rows: ManagedRow[] = collected.rows.map((row) => {
      const config = row.config
      const entry = liveFor(row.id, live)
      const serverName = str(config.serverName) || row.serverName || row.id
      const entryReadOnly = row.level === 'profile' && entry?.patchId === undefined && entry?.readOnlyReason !== undefined
      const readOnly = row.readOnly === true || entryReadOnly
      return {
        ...row,
        config,
        serverName,
        toolCount: toolCounts[serverName] || 0,
        live: entry
          ? {
              enabled: entry.enabled,
              phase: entry.fiberPhase,
              entryId: entry.entryId,
              addressable: !!entry.patchId,
              ...(entry.readOnlyReason ? { readOnlyReason: entry.readOnlyReason } : {}),
            }
          : undefined,
        readOnly,
        readOnlyReason: row.readOnlyReason || (entryReadOnly ? entry?.readOnlyReason : undefined),
      }
    })

    // A row introduced by a bundle layer is live but not present in either
    // writable patch. Show it read-only rather than letting the user "delete"
    // something this plugin does not own.
    for (const entry of live) {
      const id = entry.patchId || (entry.entryId.includes(':') ? entry.entryId.slice(entry.entryId.lastIndexOf(':') + 1) : entry.entryId)
      if (rows.some((r) => r.id === id)) continue
      const config = { serverName: id }
      rows.push({
        id,
        name: MCP_NAME,
        serverName: str(config.serverName) || id,
        level: 'loader',
        disabled: !entry.enabled,
        config,
        toolCount: toolCounts[str(config.serverName) || id] || 0,
        live: { enabled: entry.enabled, phase: entry.fiberPhase, entryId: entry.entryId, addressable: !!entry.patchId, ...(entry.readOnlyReason ? { readOnlyReason: entry.readOnlyReason } : {}) },
        readOnly: true,
        readOnlyReason: entry.readOnlyReason || 'loader',
      })
    }

    return {
      ok: true,
      rows: rows.map((row) => ({
        id: row.id,
        serverName: row.serverName,
        transport: row.config.transport || null,
        url: row.config.url || null,
        command: row.config.command || null,
        args: row.config.args || null,
        env: row.config.env || null,
        headers: row.config.headers || null,
        cwd: row.config.cwd || null,
        toolCallTimeoutMs: row.config.toolCallTimeoutMs || null,
        failOnStartupError: row.config.failOnStartupError === true,
        maxInstructionBytes: row.config.maxInstructionBytes || null,
        reconnect: row.config.reconnect || null,
        level: row.level,
        disabled: row.disabled,
        live: row.live || null,
        toolCount: row.toolCount || 0,
        readOnly: !!row.readOnly,
        ...(row.readOnlyReason ? { readOnlyReason: row.readOnlyReason } : {}),
      })),
      paths: {
        profile: p.profilePatch,
        home: p.homePatch,
        homeExists: await exists(p.homePatch),
        profileDir: p.profileDir,
        profileName: p.profileName,
      },
      errors: collected.errors,
    }
  }

  async function nextId(serverName: string, existing: ManagedRow[]): Promise<string> {
    const base = 'mcp-' + serverName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const ids = new Set(existing.map((r) => r.id))
    let id = base
    let n = 2
    while (ids.has(id)) id = base + '-' + n++
    return id
  }

  async function mcpmAdd(args: Record<string, any>) {
    const collected = await collectRows()
    if (args.level === 'global' || args.level === 'home') {
      return { ok: false, error: 'the home patch is read-only in this manager; MCP servers are added to the current profile' }
    }
    let config: Record<string, any>
    try {
      config = normalizeMcpConfig(args)
    } catch (e) {
      return { ok: false, error: message(e) }
    }
    const serverName = String(config.serverName)
    const duplicate = collected.rows.find((r) => r.serverName === serverName)
    if (duplicate) return { ok: false, error: `serverName "${serverName}" already exists` }
    const id = await nextId(serverName, collected.rows)
    return withWriteLock(async () => {
      const abs = await profilePatch()
      const before = await readPatch(abs)
      const doc = loadDoc(before)
      upsertInDoc(doc, id, config)
      if (args.enabled === false) setDisabledInDoc(doc, id, true)
      await writePatch(abs, String(doc))
      return { ok: true, row: { id, serverName, level: 'profile', disabled: args.enabled === false } }
    })
  }

  async function mcpmEdit(args: Record<string, any>) {
    const id = String(args.id || '').trim()
    if (!id) return { ok: false, error: 'id is required' }
    if (args.level === 'global' || args.level === 'home') {
      return { ok: false, error: 'the home patch is read-only in this manager' }
    }
    const collected = await collectRows()
    const current = collected.rows.find((r) => r.id === id)
    if (!current) return { ok: false, error: `row not found: ${id}` }
    if (current.level !== 'profile' || current.readOnly) {
      return { ok: false, error: current.readOnlyReason === 'overridden-by-home' ? 'this row is overridden by the home patch and cannot be edited here' : 'this server comes from another layer and cannot be edited here' }
    }
    let nextConfig: Record<string, any>
    try {
      nextConfig = normalizeMcpConfig(args, current.config)
    } catch (e) {
      return { ok: false, error: message(e) }
    }
    const serverName = String(nextConfig.serverName)
    const duplicate = collected.rows.find((r) => r.id !== id && r.serverName === serverName)
    if (duplicate) return { ok: false, error: `serverName "${serverName}" is already used by ${duplicate.id}` }

    // Prefer the official config editor when the profile row is live.
    const editor = optional<ConfigEditorService>('configEditor')
    if (editor?.entries) {
      try {
        const entry = editor.entries().find((e) => String(e.options?.id) === id)
        if (entry && entry.fiber) {
          await withWriteLock(async () => {
            await editor.edit(entry, () => nextConfig)
          })
          return { ok: true }
        }
      } catch (e) {
        // Fall through to the file edit; the diagnostic explains an override
        // by a home patch, which the file fallback also cannot change.
        const warning = message(e)
        const result = await editProfileFile(id, nextConfig)
        return result.ok ? { ...result, warning } : result
      }
    }
    return withWriteLock(() => editProfileFile(id, nextConfig))
  }

  async function editProfileFile(id: string, nextConfig: Record<string, any>): Promise<Record<string, any>> {
    const abs = await profilePatch()
    const before = await readPatch(abs)
    const doc = loadDoc(before)
    upsertInDoc(doc, id, nextConfig)
    await writePatch(abs, String(doc))
    return { ok: true }
  }

  async function liveEntryFor(id: string): Promise<PluginInventoryEntry | undefined> {
    const live = await listLive()
    return live.find((e) => e.patchId === id) || live.find((e) => e.entryId === id) || live.find((e) => e.entryId.endsWith(':' + id))
  }

  async function waitForLive(id: string, wantEnabled: boolean, timeoutMs: number): Promise<boolean> {
    const started = Date.now()
    for (;;) {
      const entry = await liveEntryFor(id)
      if (entry && entry.enabled === wantEnabled) return true
      if (Date.now() - started > timeoutMs) return false
      await wait(250)
    }
  }

  async function mcpmSetEnabled(args: Record<string, any>) {
    const id = String(args.id || '')
    const enabled = args.enabled === true
    if (!id) return { ok: false, error: 'id is required' }
    if (typeof args.enabled !== 'boolean') return { ok: false, error: 'enabled must be a boolean' }
    const collected = await collectRows()
    const row = collected.rows.find((r) => r.id === id)
    if (!row) return { ok: false, error: `row not found: ${id}` }
    if (row.level !== 'profile' || row.readOnly) {
      return { ok: false, error: row.readOnlyReason === 'overridden-by-home' ? 'this row is overridden by the home patch and cannot be changed here' : 'this server is not managed in the current profile' }
    }

    const manager = optional<PluginManagerService>('pluginManager')
    const entry = await liveEntryFor(id)
    if (manager?.setPluginEnabled && entry?.patchId) {
      const result = await manager.setPluginEnabled(entry.entryId, enabled)
      if (result.application === 'failed') return { ok: false, error: result.error?.diagnostic || 'plugin manager rejected the change' }
      const applied = result.application === 'applied'
      return {
        ok: true,
        ...(applied ? {} : { warning: result.application === 'overridden' ? 'a higher-priority layer overrides this row' : 'restart required for this change' }),
      }
    }

    const abs = await profilePatch()
    return withWriteLock(async () => {
      const before = await readPatch(abs)
      const doc = loadDoc(before)
      setDisabledInDoc(doc, id, !enabled)
      await writePatch(abs, String(doc))
      return { ok: true }
    })
  }

  async function mcpmRestart(args: Record<string, any>) {
    const id = String(args.id || '')
    if (!id) return { ok: false, error: 'id is required' }
    const collected = await collectRows()
    const row = collected.rows.find((r) => r.id === id)
    if (!row) return { ok: false, error: `row not found: ${id}` }
    if (row.level !== 'profile' || row.readOnly) {
      return { ok: false, error: row.readOnlyReason === 'overridden-by-home' ? 'this row is overridden by the home patch and cannot be restarted here' : 'this server is not managed in the current profile' }
    }

    const manager = optional<PluginManagerService>('pluginManager')
    const entry = await liveEntryFor(id)
    if (manager?.setPluginEnabled && entry?.patchId) {
      if (entry.enabled) {
        const off = await manager.setPluginEnabled(entry.entryId, false)
        if (off.application === 'failed') return { ok: false, error: off.error?.diagnostic || 'plugin manager rejected the restart' }
        await waitForLive(id, false, 5000)
      }
      const result = await manager.setPluginEnabled(entry.entryId, true)
      if (result.application === 'failed') return { ok: false, error: result.error?.diagnostic || 'plugin manager rejected the restart' }
      const on = await waitForLive(id, true, 5000)
      return on ? { ok: true } : { ok: true, warning: 'loader did not report the service as active within 5 seconds' }
    }

    const abs = await profilePatch()
    const canWait = !!entry && typeof manager?.listPlugins === 'function'
    return withWriteLock(async () => {
      const before = await readPatch(abs)
      let doc = loadDoc(before)
      setDisabledInDoc(doc, id, true)
      await writePatch(abs, String(doc))
      const warnings: string[] = []
      const off = canWait ? await waitForLive(id, false, 4000) : true
      if (!off) warnings.push('loader did not report the service as stopped within 4 seconds')
      await wait(600)
      try {
        doc = loadDoc(await readPatch(abs))
        setDisabledInDoc(doc, id, false)
        await writePatch(abs, String(doc))
      } catch (e) {
        try {
          await writePatch(abs, before)
        } catch {
          /* best effort */
        }
        return { ok: false, error: 'restart failed: ' + message(e) }
      }
      const on = canWait ? await waitForLive(id, true, 4000) : true
      if (!on) warnings.push('loader did not report the service as active within 4 seconds')
      return warnings.length > 0 ? { ok: true, warning: warnings.join('; ') } : { ok: true }
    })
  }

  async function mcpmRemove(args: Record<string, any>) {
    const id = String(args.id || '')
    if (!id) return { ok: false, error: 'id is required' }
    const collected = await collectRows()
    const row = collected.rows.find((r) => r.id === id)
    if (!row) return { ok: false, error: `row not found: ${id}` }
    if (row.level !== 'profile' || row.readOnly) {
      return { ok: false, error: row.readOnlyReason === 'overridden-by-home' ? 'this row is overridden by the home patch and cannot be removed here' : 'this server is not managed in the current profile' }
    }
    const abs = await profilePatch()
    return withWriteLock(async () => {
      const before = await readPatch(abs)
      const doc = loadDoc(before)
      removeFromDoc(doc, id)
      await writePatch(abs, String(doc))
      return { ok: true }
    })
  }

  async function mcpmTools(args: Record<string, any>) {
    const serverName = String(args.serverName || '').trim()
    if (!serverName) return { ok: false, error: 'serverName is required' }
    const prefix = 'mcp__' + serverName + '__'
    let schemas: Array<{ name: string; description?: string; parameters?: unknown }> = []
    try {
      schemas = tools.schemas()
    } catch (e) {
      return { ok: false, error: message(e) }
    }
    const list: any[] = []
    for (const schema of schemas) {
      const fullName = String(schema?.name || '')
      if (!fullName.startsWith(prefix)) continue
      const params: any[] = []
      const properties = schema.parameters && typeof schema.parameters === 'object'
        ? (schema.parameters as { properties?: Record<string, any>; required?: unknown }).properties
        : undefined
      const required = schema.parameters && typeof schema.parameters === 'object' && Array.isArray((schema.parameters as { required?: unknown }).required)
        ? new Set(((schema.parameters as { required: unknown[] }).required).filter((v): v is string => typeof v === 'string'))
        : new Set<string>()
      if (properties && typeof properties === 'object') {
        for (const [key, spec] of Object.entries(properties)) {
          const ps = spec && typeof spec === 'object' ? spec as Record<string, any> : {}
          params.push({
            key,
            required: required.has(key),
            type: typeof ps.type === 'string' ? ps.type : 'any',
            ...(typeof ps.description === 'string' ? { description: ps.description } : {}),
          })
        }
      }
      list.push({
        name: fullName.slice(prefix.length),
        description: typeof schema.description === 'string' ? schema.description : '',
        parameters: params,
      })
    }
    return { ok: true, tools: list }
  }

  async function mcpmExport() {
    const list = await mcpmList()
    const rows = (list.rows || [])
      .filter((r: any) => r.level === 'profile' && !r.readOnly)
      .map((r: any) => ({
        id: r.id,
        serverName: r.serverName,
        transport: r.transport,
        url: r.url || undefined,
        command: r.command || undefined,
        args: r.args || undefined,
        env: r.env || undefined,
        headers: r.headers || undefined,
        cwd: r.cwd || undefined,
        toolCallTimeoutMs: r.toolCallTimeoutMs || undefined,
        failOnStartupError: r.failOnStartupError || undefined,
        maxInstructionBytes: r.maxInstructionBytes || undefined,
        reconnect: r.reconnect || undefined,
        level: 'profile',
        disabled: r.disabled,
      }))
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), version: pkgVersion, rows }, null, 2)
    let savedTo: string | null = null
    try {
      const p = await paths()
      savedTo = join(p.home, 'mcp-manager-export.json')
      await writePatch(savedTo, json)
    } catch {
      /* non-fatal */
    }
    return { ok: true, json, savedTo }
  }

  async function mcpmImport(args: Record<string, any>) {
    let parsed: any
    try {
      parsed = JSON.parse(String(args.json || ''))
    } catch (e) {
      return { ok: false, error: 'invalid JSON: ' + message(e) }
    }
    const entries = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.rows) ? parsed.rows : null
    if (!entries) return { ok: false, error: 'expected an array or { rows: [...] }' }
    const added: string[] = []
    const skipped: Array<{ id: string; reason: string }> = []
    for (const item of entries) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        skipped.push({ id: '?', reason: 'entry is not an object' })
        continue
      }
      const input = item as Record<string, any>
      if (input.level === 'global' || input.level === 'home') {
        skipped.push({ id: String(input.id || input.serverName || '?'), reason: 'home-layer rows are read-only; import targets the current profile' })
        continue
      }
      let config: Record<string, any>
      try {
        config = normalizeMcpConfig(input)
      } catch (e) {
        skipped.push({ id: String(input.id || input.serverName || '?'), reason: message(e) })
        continue
      }
      let row: { added?: string; skipped?: boolean; reason?: string }
      try {
        row = await withWriteLock(async () => {
          const collected = await collectRows()
          if (collected.rows.some((r) => r.serverName === config.serverName)) return { skipped: true, reason: 'serverName already exists' }
          const requested = String(input.id || '').trim()
          const id = requested && !collected.rows.some((r) => r.id === requested) ? requested : await nextId(String(config.serverName), collected.rows)
          const abs = await profilePatch()
          const before = await readPatch(abs)
          const doc = loadDoc(before)
          upsertInDoc(doc, id, config)
          if (input.disabled === true || input.enabled === false) setDisabledInDoc(doc, id, true)
          await writePatch(abs, String(doc))
          return { added: id }
        })
      } catch (e) {
        skipped.push({ id: String(input.id || input.serverName || '?'), reason: message(e) })
        continue
      }
      if (row.added) added.push(row.added)
      else skipped.push({ id: String(input.id || input.serverName || '?'), reason: row.reason || 'write failed' })
    }
    return { ok: true, added, skipped }
  }

  async function pluginVersion() {
    return { ok: true, version: pkgVersion }
  }

  const handlers: Record<string, (args: any) => Promise<any>> = {
    'plugin-version': pluginVersion,
    'mcpm-list': mcpmList,
    'mcpm-tools': mcpmTools,
    'mcpm-add': mcpmAdd,
    'mcpm-edit': mcpmEdit,
    'mcpm-set-enabled': mcpmSetEnabled,
    'mcpm-restart': mcpmRestart,
    'mcpm-remove': mcpmRemove,
    'mcpm-export': mcpmExport,
    'mcpm-import': mcpmImport,
    'skill-list': skillList,
    'skill-toggle': skillToggle,
  }

  // ---------- model-facing tools ----------
  const text = (value: string) => [{ type: 'text' as const, text: value }]

  ctx.effect(() => tools.register(defineTool({
    name: 'mcp_manager_list',
    description: 'List MCP servers in the current profile and the read-only home layer, with enabled state, live loader phase, and registered tool count.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_a, value) => text(value) },
    async execute() {
      const result = await mcpmList()
      if (!result.ok) throw new Error(result.errors.join('; ') || 'failed to list MCP servers')
      const summary = result.rows.map((row: any) => (
        `${row.id} | ${row.serverName} | ${row.level}${row.readOnly ? '(read-only)' : ''} | ${row.disabled ? 'disabled' : 'enabled'}` +
        (row.live ? ` | loader:${row.live.enabled ? 'on' : 'off'}${row.live.phase ? ':' + row.live.phase : ''}` : '') +
        (typeof row.toolCount === 'number' ? ` | tools:${row.toolCount}` : '')
      ))
      return 'MCP servers:\n' + (summary.join('\n') || '(none)')
    },
  })))

  ctx.effect(() => tools.register(defineTool({
    name: 'mcp_manager_set_enabled',
    description: 'Enable or disable one MCP server managed in the current profile. Rows owned by the home layer or another bundle are read-only.',
    parameters: {
      id: { type: 'string', required: true, description: 'Entry id of the MCP server, e.g. mcp-stepfun-web-search.' },
      enabled: { type: 'boolean', required: true, description: 'true to enable, false to disable.' },
    },
    output: { schema: { type: 'string' }, render: (_a, value) => text(value) },
    async execute(args) {
      const result: any = await mcpmSetEnabled({ id: args.id, enabled: args.enabled })
      if (!result.ok) throw new Error(result.error)
      return 'OK: ' + args.id + ' now ' + (args.enabled ? 'enabled' : 'disabled')
    },
  })))

  ctx.effect(() => tools.register(defineTool({
    name: 'mcp_manager_restart',
    description: 'Restart one MCP server managed in the current profile (disconnect and reconnect, then re-sync its tools). Home-layer rows are read-only.',
    parameters: {
      id: { type: 'string', required: true, description: 'Entry id of the MCP server.' },
    },
    output: { schema: { type: 'string' }, render: (_a, value) => text(value) },
    async execute(args) {
      const result: any = await mcpmRestart({ id: args.id })
      if (!result.ok) throw new Error(result.error)
      return 'OK: ' + args.id + ' restarted' + (result.warning ? ' (' + result.warning + ')' : '')
    },
  })))

  ctx.effect(() => tools.register(defineTool({
    name: 'mcp_manager_add',
    description: 'Add a new MCP server (streamable-http or stdio) to the current profile.',
    parameters: {
      serverName: { type: 'string', required: true, description: 'Unique server name (1-32 chars, [A-Za-z0-9_-]).' },
      transport: { type: 'string', required: true, description: 'streamable-http or stdio.' },
      url: { type: 'string', description: 'Server URL (required for streamable-http).' },
      command: { type: 'string', description: 'Executable (required for stdio).' },
      args: { type: 'string', description: 'Arguments separated by newlines (stdio).' },
      headers: { type: 'string', description: 'Extra headers as key=value lines (streamable-http).' },
      env: { type: 'string', description: 'Extra env vars as key=value lines (stdio).' },
      cwd: { type: 'string', description: 'Working directory for a stdio server.' },
      toolCallTimeoutMs: { type: 'number', description: 'Per-call timeout in ms (default 60000).' },
      failOnStartupError: { type: 'boolean', description: 'Reject activation when the initial connection fails.' },
    },
    output: { schema: { type: 'string' }, render: (_a, value) => text(value) },
    async execute(args) {
      const result: any = await mcpmAdd(args)
      if (!result.ok) throw new Error(result.error)
      return 'OK: added ' + result.row.id
    },
  })))

  // ---------- HTTP API (client half) ----------
  ctx.inject(['webServer'], (child: any) => {
    const server = child.get('webServer') as WebServerService | undefined
    if (!server) return
    child.effect(() => server.register({
      kind: 'exact',
      path: '/dsh-mcp-manager/api',
      handler: async (req, res) => {
        const header = (key: string): string => {
          const value = req.headers?.[key]
          return Array.isArray(value) ? value[0] ?? '' : value ?? ''
        }
        if (String(req.method || 'POST').toUpperCase() !== 'POST') {
          res.writeHead(405, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'method not allowed' }))
          return
        }
        if (header('x-dsh-plugin') !== 'dsh-mcp-manager') {
          res.writeHead(403, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'missing plugin gate header' }))
          return
        }
        const origin = header('origin')
        if (origin) {
          const isLoopback = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(host)
          let sameOrigin = false
          try {
            const actual = new URL(origin)
            const expected = typeof server.getOrigin === 'function' ? server.getOrigin() : ''
            if (expected) {
              const want = new URL(expected)
              sameOrigin = actual.origin === want.origin
                || (actual.protocol === want.protocol && actual.port === want.port && isLoopback(actual.hostname) && isLoopback(want.hostname))
            } else {
              sameOrigin = isLoopback(actual.hostname) || actual.host === header('host')
            }
          } catch {
            /* unparseable origin */
          }
          if (!sameOrigin) {
            res.writeHead(403, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'cross-origin request rejected' }))
            return
          }
        }

        const readBody = () => new Promise<string>((resolve, reject) => {
          const chunks: string[] = []
          let size = 0
          req.on('data', (chunk) => {
            const value = String(chunk ?? '')
            size += Buffer.byteLength(value, 'utf8')
            if (size > MAX_BODY) {
              reject(new Error('request body too large'))
              return
            }
            chunks.push(value)
          })
          req.on('end', () => resolve(chunks.join('')))
          req.on('error', reject)
        })

        res.writeHead(200, { 'content-type': 'application/json' })
        try {
          let payload: any = {}
          try {
            payload = JSON.parse((await readBody()) || '{}')
          } catch (e) {
            if (String((e as Error)?.message).includes('body too large')) {
              res.end(JSON.stringify({ ok: false, error: '请求体过大' }))
              return
            }
            /* malformed JSON → empty payload, reported as unknown op */
          }
          const op = String(payload.op || '')
          if (TOKEN && WRITE_OPS.has(op) && header('x-dsh-token') !== TOKEN) {
            res.end(JSON.stringify({ ok: false, error: 'missing or invalid access token (x-dsh-token)' }))
            return
          }
          const fn = handlers[op]
          if (!fn) {
            res.end(JSON.stringify({ ok: false, error: 'unknown op: ' + op }))
            return
          }
          const result = await fn(payload.args || {})
          res.end(JSON.stringify(result === undefined ? { ok: true } : result))
        } catch (e) {
          res.end(JSON.stringify({ ok: false, error: message(e) }))
        }
      },
    }), 'dsh-mcp-manager: api route')
  })

  // The client half registers under the package name only; no second module id
  // is emitted, matching `dsh-client-modules`' package-name attachment.
}
