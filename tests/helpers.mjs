// Shared fake Cordis context for the plugin tests.
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

export function freshHome(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function useHome(home) {
  // `paths()` prefers the launcher environment; point it at the fixture so tests
  // never touch the real profile.
  process.env.DSH_HOME = home
  process.env.DSH_PROFILE = 'web'
  process.env.DSH_PROFILE_DIR = join(home, 'profiles', 'web')
  process.env.DSH_AGENTS_HOME = join(home, 'agents')
}

export function makeCtx(home, files, extra = {}) {
  useHome(home)
  files = files || new Map()
  if (!files.has(join(home, 'settings.yaml'))) files.set(join(home, 'settings.yaml'), '')
  if (!files.has(join(home, 'profiles', 'web', 'cordis.patch.yml'))) files.set(join(home, 'profiles', 'web', 'cordis.patch.yml'), '[]\n')
  if (!files.has(join(home, 'cordis.patch.yml'))) files.set(join(home, 'cordis.patch.yml'), '[]\n')

  let route = null
  const listeners = new Map()
  const disposers = []
  const tools = extra.tools || { register() {}, schemas: () => [] }
  const skills = extra.skills || {
    registerProvider() {},
    async snapshot() { return { skills: [], complete: true } },
    async get() { return undefined },
  }
  const webServer = extra.webServer || {
    getOrigin: () => 'http://127.0.0.1:1618',
    register(value) { route = value; return () => { route = null } },
  }
  const services = {
    settings: { prepareDocument: async () => join(home, 'settings.yaml') },
    sandboxPolicy: { resolve: async () => ({}) },
    tools,
    skills,
    webServer,
    ...(extra.services || {}),
  }
  const ctx = {
    timer: {},
    timeout: () => Promise.resolve(),
    tools,
    skills,
    ...services,
    fs: {
      async resolve(p) { return p },
      async stat(p) { return files.has(p) ? { isFile: () => true, isDirectory: () => false } : undefined },
      async readText(p) {
        if (!files.has(p)) {
          const error = new Error('not found')
          error.code = 'FS_NOT_FOUND'
          throw error
        }
        return files.get(p)
      },
      async writeText(p, content) { files.set(p, String(content)) },
      async listDir() { return [] },
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    on(event, callback) {
      listeners.set(event, callback)
    },
    get(name) {
      return services[name]
    },
    inject(deps, callback) {
      if (!deps.every((name) => services[name] !== undefined)) return undefined
      const child = {
        get(name) { return services[name] },
        on(event, cb) { ctx.on(event, cb) },
        effect(fn) { return ctx.effect(fn) },
        get skills() { return services.skills },
        get agents() { return services.agents },
        get webServer() { return services.webServer },
      }
      callback(child)
      return { dispose() {} }
    },
    webServer,
    _files: files,
    _route: () => route,
    _listeners: listeners,
    _disposers: disposers,
  }
  return ctx
}

export function call(route, payload, headers = {}, body = null) {
  const text = body === null ? JSON.stringify(payload) : body
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-plugin': 'dsh-mcp-manager', ...headers },
    on(event, cb) { if (event === 'data') cb(text); if (event === 'end') cb() },
  }
  const res = {
    status: 200,
    bodyText: '',
    writeHead(code) { this.status = code },
    end(value) { this.bodyText = value || '' },
  }
  const result = route.handler(req, res)
  return (result ? Promise.resolve(result) : Promise.resolve()).then(() => ({
    status: res.status,
    json: res.bodyText ? JSON.parse(res.bodyText) : null,
  }))
}
