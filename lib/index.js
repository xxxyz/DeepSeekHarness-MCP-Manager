// dsh-mcp-manager — host half, written in TypeScript to the DeepSeek Harness
// plugin development standard (https://deepseek-harness.github.io/deepseek-harness/develop/basic/):
//   * object-form Cordis plugin: { name, inject, apply } (docs: "对象形式")
//   * required services declared in `inject` — the framework guarantees they are
//     ready before apply runs, and reloads the plugin if one disappears
//   * agent-facing capability exposed as registered tools (ctx.tools.register +
//     defineTool), the documented way to add model-callable abilities
//   * UI-facing capability exposed via a webServer exact route (used by the
//     client half), registered defensively
//
// Build: `tsc -p tsconfig.json` compiles this to lib/index.js (the shipped
// artifact — same convention as DSH's own packages, which ship compiled JS).
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createRequire } from 'node:module';
export default {
    name: 'dsh-mcp-manager-host',
    inject: ['timer', 'fs', 'settings', 'sandboxPolicy', 'webServer', 'tools', 'skills'],
    apply(ctx, config) {
        const fs = ctx.fs;
        const settings = ctx.settings;
        const sandboxPolicy = ctx.sandboxPolicy;
        const webServer = ctx.webServer;
        const tools = ctx.tools;
        // pluginInventory is optional: probe at use time, degrade to no live info.
        const pluginInventory = ctx.get('pluginInventory');
        // Package version, surfaced in the Settings pages and the HTTP API. Read
        // from the installed package.json so it always matches the release tag.
        let PKG_VERSION = 'unknown';
        try {
            PKG_VERSION = createRequire(import.meta.url)('../package.json').version || 'unknown';
        }
        catch (e) { /* keep unknown */ }
        // Optional access token (defense in depth for LAN exposure). Enabled by
        // setting `config.token` on this plugin's loader row (profile
        // cordis.patch.yml override) or the DSH_MCP_MANAGER_TOKEN env var. When
        // set, every state-changing op requires `x-dsh-token: <token>`. Read-only
        // ops (plugin-version, mcpm-list, skill-list) stay open so the UI still
        // renders; mcpm-export is guarded too because it leaks full configs.
        // NOTE: the entry config arrives as the SECOND apply argument (Cordis
        // calls `callback(ctx, config)`) — never read it off `ctx.config`, which
        // is not an injected service and throws "cannot get property without
        // inject" at boot.
        const TOKEN = String(config?.token || process.env.DSH_MCP_MANAGER_TOKEN || '').trim();
        const WRITE_OPS = new Set([
            'mcpm-add', 'mcpm-edit', 'mcpm-remove', 'mcpm-set-enabled', 'mcpm-restart',
            'mcpm-export', 'mcpm-import', 'skill-toggle',
        ]);
        const wait = (ms) => ctx.timeout(ms);
        const message = (e) => String((e && e.message) || e);
        let writeChain = Promise.resolve();
        function withWriteLock(fn) {
            const run = writeChain.then(() => fn(), () => fn());
            writeChain = run.then(() => undefined, () => undefined);
            return run;
        }
        // ---------- skills management: list + enable/disable (rank-0 override provider) ----------
        // A skill is disabled by advertising a same-name candidate with a rank lower
        // than every real provider (project-dsh is 100; we use 0), so a user-explicit
        // disable wins over any level — including project-level skills. State persists
        // to <profile>/dsh-skill-manager.json and is re-applied lazily (providers may
        // still be starting up when this plugin applies).
        const OVERRIDE_PROVIDER = 'dsh-mcp-manager-override';
        const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
        const overrideSkills = new Map();
        let skillProviderControl = null;
        const statePath = async () => {
            const p = await ensurePaths();
            const s = p.profileDir.indexOf('\\') >= 0 ? '\\' : '/';
            return p.profileDir + s + 'dsh-skill-manager.json';
        };
        async function readState() {
            try {
                const raw = await fs.readText(await fs.resolve(await statePath()));
                const data = JSON.parse(raw);
                return Array.isArray(data.disabledSkills) ? data.disabledSkills.filter((n) => typeof n === 'string') : [];
            }
            catch (e) {
                return [];
            }
        }
        async function saveState(names) {
            const policy = await sandboxPolicy.resolve({ mode: 'danger-full-access' });
            await fs.writeText(await fs.resolve(await statePath()), JSON.stringify({ version: 1, disabledSkills: names }, null, 2), undefined, undefined, policy);
        }
        const overrideProvider = {
            name: OVERRIDE_PROVIDER,
            async list() {
                return [...overrideSkills.values()].map((d) => ({
                    name: d.name,
                    description: d.description,
                    ...(d.whenToUse !== undefined ? { whenToUse: d.whenToUse } : {}),
                    invocation: d.invocation,
                    source: d.source,
                    provider: OVERRIDE_PROVIDER,
                    rank: 0,
                    ...(d.path !== undefined ? { path: d.path } : {}),
                    locator: d.name,
                }));
            },
            async get(candidate) {
                return overrideSkills.get(candidate.name);
            },
        };
        try {
            ctx.skills.registerProvider((control) => {
                skillProviderControl = control;
                return overrideProvider;
            });
        }
        catch (e) {
            console.error('[dsh-mcp-manager] skills override provider registration failed:', message(e));
        }
        async function ensureRestored() {
            let changed = false;
            for (const name of await readState()) {
                if (overrideSkills.has(name))
                    continue;
                // Pre-2.2.2 migration: user-level skills are view-only now. Drop any
                // stale state entry without touching the file — the sandbox blocks
                // writing ~/.dsh/skills from a profile plugin, and an override could
                // never shadow the scoped-layer filesystem entry anyway.
                const userDef = await findUserSkill(name);
                if (userDef) {
                    changed = true;
                    continue;
                }
                const def = await ctx.skills.get(name);
                if (!def)
                    continue;
                overrideSkills.set(name, { ...def, provider: OVERRIDE_PROVIDER, invocation: { modelInvocable: false, userInvocable: false } });
                changed = true;
            }
            if (changed) {
                await saveState([...overrideSkills.keys()]);
                if (skillProviderControl)
                    skillProviderControl.invalidate();
            }
        }
        ;
        ctx.on('skills/change', () => { void ensureRestored(); });
        // User-level skills (~/.dsh/skills/*/SKILL.md) are discovered by
        // dsh-skill-filesystem in the agent-preset SCOPED layer, which a scope-less
        // ctx.skills.snapshot({}) (global layer only) never reaches — so the
        // management page would silently hide them. Scan the directory ourselves
        // and merge into skill-list.
        //
        // Disable/enable is NOT offered for user skills: (a) a rank-0 override in
        // the global layer cannot shadow the scoped layer's filesystem entry
        // (collectFresh merges layers; the nearest layer wins); (b) writing the
        // SKILL.md frontmatter is blocked by the fs sandbox (profile plugin,
        // workspace-write mode — ~/.dsh/skills is outside its scope). Users
        // disable such skills by editing `user-invocable: false` in the file
        // directly. DSH_MCP_MANAGER_SKILLS_DIR overrides the directory for tests.
        function userSkillsDir(home, sep) {
            const env = process.env.DSH_MCP_MANAGER_SKILLS_DIR;
            return env && env.trim() ? env.trim() : home + sep + 'skills';
        }
        // Minimal SKILL.md frontmatter reader that MIRRORS the official
        // dsh-skill-filesystem parse rules (so this page never lists a skill the
        // / menu would reject):
        //   * `name` and `description` are REQUIRED (non-empty) — no dir-name fallback
        //   * legacy camelCase keys (`userInvocable` / `modelInvocable`) are REJECTED
        //   * booleans accept true/1/yes/on vs false/0/no/off (case-insensitive);
        //     any other value invalidates the whole entry
        // Returns null for anything the official provider would skip.
        function parseFrontmatterBoolean(val) {
            const v = val.toLowerCase();
            if (v === 'true' || v === '1' || v === 'yes' || v === 'on')
                return true;
            if (v === 'false' || v === '0' || v === 'no' || v === 'off')
                return false;
            return undefined;
        }
        function parseSkillFile(raw) {
            const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
            if (!m)
                return null;
            const fields = new Map();
            for (const line of m[1].split(/\r?\n/)) {
                const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim());
                if (!kv)
                    continue;
                fields.set(kv[1], kv[2].trim().replace(/^['"]|['"]$/g, ''));
            }
            if (fields.has('userInvocable') || fields.has('modelInvocable'))
                return null;
            const name = fields.get('name');
            const description = fields.get('description');
            if (!name || description === undefined || description === '')
                return null;
            const fm = { name, description };
            const wtu = fields.get('whenToUse') ?? fields.get('when-to-use');
            if (wtu)
                fm.whenToUse = wtu;
            const ui = fields.get('user-invocable');
            if (ui !== undefined) {
                const b = parseFrontmatterBoolean(ui);
                if (b === undefined)
                    return null;
                fm.userInvocable = b;
            }
            const dmi = fields.get('disable-model-invocation');
            if (dmi !== undefined) {
                const b = parseFrontmatterBoolean(dmi);
                if (b === undefined)
                    return null;
                fm.disableModelInvocation = b;
            }
            const content = raw.slice(m[0].length).replace(/^\r?\n+/, '');
            return { fm, content };
        }
        async function scanUserSkills() {
            let dir;
            let sep;
            try {
                const p = await ensurePaths();
                sep = p.home.indexOf('\\') >= 0 ? '\\' : '/';
                dir = userSkillsDir(p.home, sep);
            }
            catch (e) {
                return [];
            }
            let entries = [];
            try {
                entries = await fs.listDir(await fs.resolve(dir));
            }
            catch (e) {
                return [];
            }
            const rows = [];
            const seen = new Set();
            for (const ent of entries) {
                const nm = String(ent.name || '');
                if (!nm || nm === '.system')
                    continue;
                // Official parity (dsh-skill-filesystem discoverRoot): a directory entry
                // points at `<dir>/SKILL.md`; a flat `*.md` file in the root is itself a
                // skill. We cannot stat entry types through the fs service, so try the
                // directory form first and fall back to the flat form for `.md` names.
                let path = dir + sep + nm + sep + 'SKILL.md';
                let directory = dir + sep + nm;
                let raw = '';
                try {
                    raw = await fs.readText(await fs.resolve(path));
                }
                catch (e) {
                    if (!nm.endsWith('.md'))
                        continue;
                    path = dir + sep + nm;
                    directory = dir;
                    try {
                        raw = await fs.readText(await fs.resolve(path));
                    }
                    catch (e2) {
                        continue;
                    }
                }
                const parsed = parseSkillFile(raw);
                if (!parsed) {
                    console.warn(`[dsh-mcp-manager] user skill ${path} ignored: missing/invalid frontmatter (name+description required, kebab-case name, official boolean grammar)`);
                    continue;
                }
                const { fm, content } = parsed;
                if (!SKILL_NAME_RE.test(fm.name))
                    continue;
                if (seen.has(fm.name))
                    continue;
                seen.add(fm.name);
                rows.push({
                    name: fm.name,
                    description: fm.description,
                    ...(fm.whenToUse !== undefined ? { whenToUse: fm.whenToUse } : {}),
                    invocation: { modelInvocable: fm.disableModelInvocation !== true, userInvocable: fm.userInvocable !== false },
                    source: 'user-dsh',
                    provider: 'filesystem',
                    resourceBase: { kind: 'directory', path: directory },
                    path,
                    content,
                });
            }
            return rows;
        }
        async function findUserSkill(name) {
            return (await scanUserSkills()).find((s) => s.name === name);
        }
        async function skillList() {
            await ensureRestored();
            const snap = await ctx.skills.snapshot({});
            const seen = new Set(snap.skills.map((s) => s.name));
            const extra = (await scanUserSkills()).filter((s) => !seen.has(s.name));
            const skills = snap.skills.concat(extra).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
            return { ok: true, skills, complete: snap.complete !== false };
        }
        // User-level skills (~/.dsh/skills) are VIEW-ONLY in this page. They are
        // discovered by dsh-skill-filesystem in the agent-preset SCOPED layer; a
        // scope-less snapshot({}) (global layer only) never sees them, so we scan
        // the directory and merge rows into skill-list. Disable/enable is NOT
        // supported for them: (a) the rank-0 override provider lives in the global
        // layer and a scoped read merges the scope chain with the scoped entry
        // winning the duplicate name outright (collectFresh last-wins), so an
        // override cannot hide them from the / menu; (b) rewriting the SKILL.md
        // frontmatter is blocked by the fs sandbox (profile plugin, workspace-write
        // mode — ~/.dsh/skills is outside its scope). Users disable such skills by
        // editing `user-invocable: false` in the file directly.
        const USER_SKILL_VIEW_ONLY_ERROR = '用户级技能由 DSH 文件系统管理，仅支持查看；如需禁用请直接编辑 SKILL.md 的 user-invocable 字段';
        async function skillToggle(args) {
            const name = String(args.name || '').trim();
            if (!name)
                return { ok: false, error: '技能名不能为空' };
            if (!SKILL_NAME_RE.test(name))
                return { ok: false, error: '技能名格式非法（需 kebab-case）' };
            await ensureRestored();
            const enabled = args.enabled !== false;
            return withWriteLock(async () => {
                const userDef = await findUserSkill(name);
                if (userDef) {
                    // Drop any stale override row created by older versions (pre-2.2.2
                    // migration) — it can never shadow the scoped entry anyway, and the
                    // toggle for user skills is not supported.
                    if (overrideSkills.delete(name)) {
                        await saveState([...overrideSkills.keys()]);
                        skillProviderControl?.invalidate();
                    }
                    return { ok: false, error: USER_SKILL_VIEW_ONLY_ERROR };
                }
                if (enabled) {
                    if (overrideSkills.delete(name)) {
                        await saveState([...overrideSkills.keys()]);
                        skillProviderControl?.invalidate();
                    }
                }
                else {
                    if (!overrideSkills.has(name)) {
                        const def = await ctx.skills.get(name);
                        if (!def)
                            return { ok: false, error: '技能不存在: ' + name };
                        overrideSkills.set(name, { ...def, provider: OVERRIDE_PROVIDER, invocation: { modelInvocable: false, userInvocable: false } });
                        await saveState([...overrideSkills.keys()]);
                        skillProviderControl?.invalidate();
                    }
                }
                return { ok: true };
            });
        }
        // ---------- path discovery ----------
        // Known limitation: profile detection probes 'web' then 'headless' by
        // presence of profiles/<name>/cordis.patch.yml, then falls back to any
        // profile that has one, and finally to 'web'. A profile whose directory
        // name matches none of these and has no patch file yet is not detected.
        let cached = null;
        async function ensurePaths() {
            if (cached)
                return cached;
            let home = null;
            try {
                const doc = await settings.prepareDocument();
                if (typeof doc === 'string' && doc) {
                    const i = Math.max(doc.lastIndexOf('\\'), doc.lastIndexOf('/'));
                    home = i > 0 ? doc.slice(0, i) : doc;
                }
            }
            catch (e) { /* ignore */ }
            if (!home)
                throw new Error('无法确定 DSH 主目录（settings.prepareDocument 未返回路径）');
            const sep = home.indexOf('\\') >= 0 ? '\\' : '/';
            let profileDir = null;
            let profileName = 'web';
            for (const name of ['web', 'headless']) {
                if (await exists(home + sep + 'profiles' + sep + name + sep + 'cordis.patch.yml')) {
                    profileDir = home + sep + 'profiles' + sep + name;
                    profileName = name;
                    break;
                }
            }
            if (!profileDir) {
                try {
                    const t = await fs.resolve(home + sep + 'profiles');
                    const entries = await fs.listDir(t);
                    for (const e of entries) {
                        if (e.name === 'node_modules')
                            continue;
                        if (await exists(home + sep + 'profiles' + sep + e.name + sep + 'cordis.patch.yml')) {
                            profileDir = home + sep + 'profiles' + sep + e.name;
                            profileName = e.name;
                            break;
                        }
                    }
                }
                catch (e) { /* ignore */ }
            }
            if (!profileDir)
                profileDir = home + sep + 'profiles' + sep + 'web';
            cached = {
                home,
                profileDir,
                profileName,
                projectPatch: profileDir + sep + 'cordis.patch.yml',
                globalPatch: home + sep + 'cordis.patch.yml',
            };
            return cached;
        }
        async function exists(abs) {
            try {
                const t = await fs.resolve(abs);
                return (await fs.stat(t)) !== undefined;
            }
            catch (e) {
                return false;
            }
        }
        async function readPatch(abs) {
            try {
                const t = await fs.resolve(abs);
                return await fs.readText(t);
            }
            catch (e) {
                if (String(e.code) === 'FS_NOT_FOUND')
                    return '';
                throw e;
            }
        }
        async function writePatch(abs, content) {
            const t = await fs.resolve(abs);
            const policy = await sandboxPolicy.resolve({ mode: 'danger-full-access' });
            await fs.writeText(t, content, undefined, undefined, policy);
        }
        // ---------- YAML generation ----------
        function yq(v) { return typeof v === 'string' ? JSON.stringify(v) : String(v); }
        function yplain(v) { return /^[A-Za-z0-9_.:@%+=/-]+$/.test(v) ? v : yq(v); }
        function buildInsertBlock(row) {
            const lines = [
                '# dsh-mcp-manager:server:' + row.id,
                '- insert:',
                '    - id: ' + yplain(row.id),
                "      name: '@deepseek-ai/dsh-mcp-client'",
                '      config:',
                '        serverName: ' + yq(row.serverName),
                '        transport: ' + yq(row.transport),
            ];
            if (row.transport === 'streamable-http') {
                lines.push('        url: ' + yq(row.url || ''));
                const headers = row.headers || {};
                const hk = Object.keys(headers);
                if (hk.length) {
                    lines.push('        headers:');
                    for (const k of hk)
                        lines.push('          ' + yq(k) + ': ' + yq(headers[k]));
                }
            }
            else {
                lines.push('        command: ' + yq(row.command || ''));
                const args = row.args || [];
                if (args.length) {
                    lines.push('        args:');
                    for (const a of args)
                        lines.push('          - ' + yq(a));
                }
                const env = row.env || {};
                const ek = Object.keys(env);
                if (ek.length) {
                    lines.push('        env:');
                    for (const k of ek)
                        lines.push('          ' + yq(k) + ': ' + yq(env[k]));
                }
            }
            if (row.toolCallTimeoutMs)
                lines.push('        toolCallTimeoutMs: ' + Number(row.toolCallTimeoutMs));
            return lines.join('\n');
        }
        function buildDisableBlock(id, disabled) {
            return [
                '# dsh-mcp-manager:' + (disabled ? 'disable' : 'enable') + ':' + id,
                '- id: ' + yplain(id),
                "  name: '@deepseek-ai/dsh-mcp-client'",
                '  disabled: ' + (disabled ? 'true' : 'false'),
            ].join('\n');
        }
        // ---------- YAML parsing (mini parser) ----------
        // Known limitation: this hand-rolled parser assumes the exact indentation
        // style that buildInsertBlock emits (config at 6 spaces, children at 8,
        // nested maps/lists at 10+). Hand-edited patch files using different
        // indentation may parse incorrectly — DSH itself only cares about the
        // effective YAML it reads, and this parser exists purely for the UI.
        function splitKV(text) {
            const m = text.match(/^("(?:\\.|[^"])*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/);
            if (!m)
                return null;
            return { key: unquote(m[1]), value: m[2] };
        }
        function unquote(v) {
            if (v === undefined || v === null)
                return v;
            const s = String(v).trim();
            if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
                try {
                    return JSON.parse(s);
                }
                catch (e) {
                    return s.slice(1, -1);
                }
            }
            if (s.length >= 2 && s.startsWith("'") && s.endsWith("'"))
                return s.slice(1, -1).replace(/''/g, "'");
            if (/^\[.*\]$/.test(s))
                return s.slice(1, -1).split(',').map((x) => unquote(x.trim())).filter((x) => x !== '');
            if (s === 'true')
                return true;
            if (s === 'false')
                return false;
            if (/^-?\d+$/.test(s))
                return Number(s);
            return s;
        }
        function parseEntry(lines) {
            const entry = { config: {} };
            let inConfig = false;
            let configIndent = 0;
            let nested = null;
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#'))
                    continue;
                const indent = line.match(/^\s*/)[0].length;
                let t = trimmed;
                if (t.startsWith('- '))
                    t = t.slice(2).trim();
                const kv = splitKV(t);
                if (!kv) {
                    if (inConfig && nested && nested.type === 'list')
                        nested.current.push(unquote(t));
                    continue;
                }
                if (!inConfig) {
                    if (kv.key === 'config' && kv.value === '') {
                        inConfig = true;
                        configIndent = indent;
                        continue;
                    }
                    if (kv.key === 'id')
                        entry.id = unquote(kv.value);
                    else if (kv.key === 'name')
                        entry.name = unquote(kv.value);
                    else if (kv.key === 'disabled')
                        entry.disabled = kv.value === 'true';
                    continue;
                }
                if (indent <= configIndent) {
                    inConfig = false;
                    nested = null;
                    continue;
                }
                if (kv.value === '' && (kv.key === 'headers' || kv.key === 'env')) {
                    nested = { key: kv.key, indent, type: 'map', current: {} };
                    entry.config[kv.key] = nested.current;
                    continue;
                }
                if (kv.value === '' && kv.key === 'args') {
                    nested = { key: kv.key, indent, type: 'list', current: [] };
                    entry.config[kv.key] = nested.current;
                    continue;
                }
                if (nested && indent > nested.indent) {
                    if (nested.type === 'map')
                        nested.current[kv.key] = unquote(kv.value);
                    else if (nested.type === 'list')
                        nested.current.push(unquote(kv.value));
                    continue;
                }
                nested = null;
                entry.config[kv.key] = unquote(kv.value);
            }
            return entry;
        }
        function parseRows(content) {
            const lines = content.split(/\r?\n/);
            const managedIds = new Set();
            for (const line of lines) {
                const m = line.match(/^# dsh-mcp-manager:server:(.+)$/);
                if (m)
                    managedIds.add(m[1].trim());
            }
            const rows = [];
            const overrides = [];
            const blocks = [];
            let current = null;
            for (const line of lines) {
                if (/^- /.test(line)) {
                    current = { text: line };
                    blocks.push(current);
                }
                else if (current) {
                    current.text += '\n' + line;
                }
            }
            for (const block of blocks) {
                const head = block.text.split('\n')[0];
                if (/^- insert:/.test(head)) {
                    const parts = block.text.split('\n');
                    const children = [];
                    let j = 0;
                    while (j < parts.length) {
                        if (/^    - /.test(parts[j])) {
                            const child = { lines: [parts[j]] };
                            j++;
                            while (j < parts.length && !/^    - /.test(parts[j])) {
                                child.lines.push(parts[j]);
                                j++;
                            }
                            children.push(child);
                        }
                        else
                            j++;
                    }
                    for (const child of children) {
                        const entry = parseEntry(child.lines);
                        if (entry && entry.name === '@deepseek-ai/dsh-mcp-client') {
                            rows.push({ id: entry.id, name: entry.name, disabled: entry.disabled, config: entry.config, managed: managedIds.has(entry.id) });
                        }
                    }
                }
                else {
                    const entry = parseEntry(block.text.split('\n'));
                    if (entry && entry.name === '@deepseek-ai/dsh-mcp-client')
                        overrides.push({ id: entry.id, disabled: entry.disabled });
                }
            }
            for (const o of overrides) {
                const row = rows.find((r) => r.id === o.id);
                if (row && o.disabled !== undefined)
                    row.disabled = o.disabled;
            }
            return { rows };
        }
        // ---------- line-based block editing ----------
        function splitLines(content) { return content.split(/\r?\n/); }
        function joinLines(lines) {
            let res = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
            if (!res.trim()) {
                res = '[]\n';
            }
            else if (!/^- /m.test(res) && !/^\[\]\s*$/m.test(res)) {
                // A patch file must stay a top-level YAML array: after removing the last
                // entry, emit [] so loadOptionalPatches never throws on a comments-only file.
                res = res.replace(/\n*$/, '\n[]\n');
            }
            return res;
        }
        function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
        function markerRanges(lines, id, ops) {
            const n = lines.length;
            const re = new RegExp('^# dsh-mcp-manager:(' + ops + '):' + escRe(id) + '$');
            const ranges = [];
            for (let i = 0; i < n; i++) {
                if (!re.test(lines[i]))
                    continue;
                let j = i + 1;
                while (j < n && !/^- /.test(lines[j]))
                    j++;
                let end = j;
                if (j < n && /^- /.test(lines[j])) {
                    let k = j + 1;
                    while (k < n && !/^- /.test(lines[k]))
                        k++;
                    end = k;
                }
                ranges.push([i, end]);
            }
            return ranges;
        }
        function insertBlockRange(lines, id) {
            const n = lines.length;
            const entryRe = new RegExp('^\\s*- id: ' + escRe(id) + '\\s*$');
            for (let i = 0; i < n; i++) {
                if (!/^- insert:/.test(lines[i]))
                    continue;
                let end = i + 1;
                while (end < n && !/^- /.test(lines[end]))
                    end++;
                if (lines.slice(i, end).some((l) => entryRe.test(l)))
                    return [i, end];
            }
            return null;
        }
        function bareOverrideRanges(lines, id) {
            const n = lines.length;
            const re = new RegExp('^- id: ' + escRe(id) + '\\s*$');
            const ranges = [];
            for (let i = 0; i < n; i++) {
                if (!re.test(lines[i]))
                    continue;
                let end = i + 1;
                while (end < n && !/^- /.test(lines[end]))
                    end++;
                ranges.push([i, end]);
            }
            return ranges;
        }
        function spliceRanges(lines, ranges) {
            const remove = new Set();
            for (const r of ranges)
                for (let i = r[0]; i < r[1]; i++)
                    remove.add(i);
            return joinLines(lines.filter((_, i) => !remove.has(i)));
        }
        function removeEntryAll(content, id) {
            const lines = splitLines(content);
            const ranges = markerRanges(lines, id, 'server|disable|enable');
            const ib = insertBlockRange(lines, id);
            if (ib)
                ranges.push(ib);
            ranges.push(...bareOverrideRanges(lines, id));
            return spliceRanges(lines, ranges);
        }
        function removeMarked(content, id, op) {
            return spliceRanges(splitLines(content), markerRanges(splitLines(content), id, op));
        }
        function appendBlock(content, block) {
            let c = content;
            if (/^\[\]\s*$/m.test(c))
                c = c.replace(/^\[\]\s*$/m, block + '\n');
            else
                c = c.replace(/\s*$/, '\n' + block + '\n');
            return c;
        }
        // ---------- shared state ----------
        async function collectAll() {
            const p = await ensurePaths();
            const ids = new Set();
            const serverNames = new Set();
            const rows = [];
            for (const level of ['project', 'global']) {
                const abs = level === 'project' ? p.projectPatch : p.globalPatch;
                let content = '';
                try {
                    content = await readPatch(abs);
                }
                catch (e) {
                    continue;
                }
                const { rows: fileRows } = parseRows(content);
                for (const r of fileRows) {
                    ids.add(r.id);
                    const sn = r.config && r.config.serverName ? String(r.config.serverName) : r.id;
                    serverNames.add(sn);
                    rows.push({ id: r.id, serverName: sn, level, disabled: !!r.disabled });
                }
            }
            return { ids, serverNames, rows };
        }
        const bareEntryId = (v) => { const s = String(v); const i = s.lastIndexOf(':'); return i >= 0 ? s.slice(i + 1) : s; };
        async function liveEntry(id) {
            if (!pluginInventory)
                return null;
            try {
                const res = await pluginInventory.list();
                return res.entries.find((e) => e.moduleName === '@deepseek-ai/dsh-mcp-client' && bareEntryId(e.entryId) === id) || null;
            }
            catch (e) {
                return null;
            }
        }
        async function waitFor(pred, timeoutMs, stepMs) {
            const start = Date.now();
            for (;;) {
                const v = await pred();
                if (v)
                    return true;
                if (Date.now() - start > timeoutMs)
                    return false;
                await wait(stepMs);
            }
        }
        async function entryExists(id, level) {
            const p = await ensurePaths();
            const abs = level === 'global' ? p.globalPatch : p.projectPatch;
            let content = '';
            try {
                content = await readPatch(abs);
            }
            catch (e) {
                return false;
            }
            const { rows } = parseRows(content);
            if (rows.some((r) => r.id === id))
                return true;
            return (await liveEntry(id)) !== null;
        }
        function normalizeRow(r, level, abs) {
            const cfg = r.config || {};
            return {
                id: r.id,
                serverName: cfg.serverName || r.id,
                transport: cfg.transport || null,
                url: cfg.url || null,
                command: cfg.command || null,
                args: cfg.args || null,
                env: cfg.env || null,
                headers: cfg.headers || null,
                level,
                disabled: !!r.disabled,
                managed: !!r.managed,
            };
        }
        // ---------- import helpers ----------
        function toStrMap(v) {
            if (!v || typeof v !== 'object' || Array.isArray(v))
                return {};
            const out = {};
            for (const k of Object.keys(v))
                out[k] = String(v[k]);
            return out;
        }
        function normalizeImportItem(item) {
            if (!item || typeof item !== 'object' || Array.isArray(item))
                return { ok: false, error: '条目不是对象' };
            const it = item;
            const serverName = String(it.serverName || '').trim();
            if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName))
                return { ok: false, error: 'serverName 非法: ' + String(it.serverName) };
            const transport = it.transport === 'stdio' ? 'stdio' : 'streamable-http';
            const level = it.level === 'global' ? 'global' : 'project';
            const baseId = 'mcp-' + serverName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            const rawId = String(it.id || '').trim();
            const id = rawId && /^[A-Za-z0-9_.:@%+=/-]+$/.test(rawId) ? rawId : baseId;
            const row = { id, serverName, transport, level, disabled: !!it.disabled };
            if (transport === 'streamable-http') {
                const url = String(it.url || '').trim();
                if (!/^https?:\/\//.test(url))
                    return { ok: false, error: serverName + ': url 非法' };
                row.url = url;
                row.headers = toStrMap(it.headers);
            }
            else {
                const command = String(it.command || '').trim();
                if (!command)
                    return { ok: false, error: serverName + ': command 缺失' };
                row.command = command;
                row.args = Array.isArray(it.args) ? it.args.map(String) : [];
                row.env = toStrMap(it.env);
            }
            return { ok: true, row };
        }
        // ---------- ops ----------
        async function pluginVersion() {
            return { ok: true, version: PKG_VERSION };
        }
        async function mcpmList() {
            const p = await ensurePaths();
            const rows = [];
            const errors = [];
            for (const level of ['project', 'global']) {
                const abs = level === 'project' ? p.projectPatch : p.globalPatch;
                let content = '';
                try {
                    content = await readPatch(abs);
                }
                catch (e) {
                    errors.push(level + ': ' + message(e));
                    continue;
                }
                const { rows: fileRows } = parseRows(content);
                for (const r of fileRows)
                    rows.push(normalizeRow(r, level, abs));
            }
            const toolCounts = {};
            try {
                const schemas = await tools.schemas();
                for (const s of schemas) {
                    const m = String(s && s.name || '').match(/^mcp__([A-Za-z0-9_-]+)__/);
                    if (m)
                        toolCounts[m[1]] = (toolCounts[m[1]] || 0) + 1;
                }
            }
            catch (e) { /* ignore */ }
            let live = [];
            if (pluginInventory) {
                try {
                    const res = await pluginInventory.list();
                    live = res.entries.filter((e) => e.moduleName === '@deepseek-ai/dsh-mcp-client');
                }
                catch (e) { /* ignore */ }
            }
            for (const e of live) {
                const bid = bareEntryId(e.entryId);
                const found = rows.find((r) => r.id === bid);
                if (found)
                    found.live = { enabled: e.enabled, phase: e.fiberPhase };
                else
                    rows.push({ id: e.entryId, serverName: e.entryId, transport: null, url: null, command: null, args: null, env: null, headers: null, level: 'loader', disabled: !e.enabled, managed: false, live: { enabled: e.enabled, phase: e.fiberPhase } });
            }
            for (const row of rows) {
                if (row.toolCount === undefined)
                    row.toolCount = toolCounts[row.serverName] || 0;
            }
            return { ok: true, rows, paths: { project: p.projectPatch, global: p.globalPatch, home: p.home, profile: p.profileName }, errors };
        }
        async function mcpmAdd(args) {
            const p = await ensurePaths();
            const serverName = String(args.serverName || '').trim();
            const transport = args.transport === 'stdio' ? 'stdio' : 'streamable-http';
            const level = args.level === 'global' ? 'global' : 'project';
            if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName))
                return { ok: false, error: 'serverName 需为 1-32 位 [A-Za-z0-9_-]' };
            const baseId = 'mcp-' + serverName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            const existing = await collectAll();
            if (existing.serverNames.has(serverName))
                return { ok: false, error: 'serverName "' + serverName + '" 已存在' };
            let id = baseId;
            let n = 2;
            while (existing.ids.has(id)) {
                id = baseId + '-' + n;
                n++;
            }
            const row = { id, serverName, transport };
            if (transport === 'streamable-http') {
                const url = String(args.url || '').trim();
                if (!/^https?:\/\//.test(url))
                    return { ok: false, error: 'url 需为 http(s):// 开头的地址' };
                row.url = url;
                row.headers = parseKv(args.headers);
            }
            else {
                const command = String(args.command || '').trim();
                if (!command)
                    return { ok: false, error: 'command 不能为空' };
                row.command = command;
                row.args = parseArgs(args.args);
                row.env = parseKv(args.env);
            }
            const abs = level === 'global' ? p.globalPatch : p.projectPatch;
            return withWriteLock(async () => {
                let content = '';
                try {
                    content = await readPatch(abs);
                }
                catch (e) {
                    return { ok: false, error: '读取补丁失败: ' + message(e) };
                }
                content = appendBlock(content, buildInsertBlock(row));
                if (args.enabled === false)
                    content = appendBlock(content, buildDisableBlock(id, true));
                try {
                    await writePatch(abs, content);
                }
                catch (e) {
                    return { ok: false, error: '写入补丁失败: ' + message(e) };
                }
                return { ok: true, row: { ...row, level, disabled: args.enabled === false } };
            });
        }
        async function mcpmEdit(args) {
            const p = await ensurePaths();
            const id = String(args.id || '');
            const level = args.level === 'global' ? 'global' : 'project';
            if (!id)
                return { ok: false, error: '缺少 id' };
            const all = await collectAll();
            const cur = all.rows.find((r) => r.id === id);
            if (!cur)
                return { ok: false, error: '未找到条目 ' + id };
            const serverName = String(args.serverName || '').trim();
            const transport = args.transport === 'stdio' ? 'stdio' : 'streamable-http';
            if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName))
                return { ok: false, error: 'serverName 需为 1-32 位 [A-Za-z0-9_-]' };
            if (serverName !== cur.serverName && all.serverNames.has(serverName))
                return { ok: false, error: 'serverName "' + serverName + '" 已被其他服务占用' };
            const row = { id, serverName, transport };
            if (transport === 'streamable-http') {
                const url = String(args.url || '').trim();
                if (!/^https?:\/\//.test(url))
                    return { ok: false, error: 'url 需为 http(s):// 开头的地址' };
                row.url = url;
                row.headers = parseKv(args.headers);
            }
            else {
                const command = String(args.command || '').trim();
                if (!command)
                    return { ok: false, error: 'command 不能为空' };
                row.command = command;
                row.args = parseArgs(args.args);
                row.env = parseKv(args.env);
            }
            const oldAbs = cur.level === 'global' ? p.globalPatch : p.projectPatch;
            const newAbs = level === 'global' ? p.globalPatch : p.projectPatch;
            const block = buildInsertBlock(row);
            return withWriteLock(async () => {
                if (oldAbs !== newAbs) {
                    // Level migration: remove from the old file, insert into the new one.
                    // Not atomic, so keep the old content and restore it if the second
                    // write fails — losing the entry is worse than a transient dup.
                    const origOld = await readPatch(oldAbs);
                    let c = origOld;
                    c = removeEntryAll(c, id);
                    try {
                        await writePatch(oldAbs, c);
                    }
                    catch (e) {
                        return { ok: false, error: '写入失败: ' + message(e) };
                    }
                    let c2 = await readPatch(newAbs);
                    c2 = appendBlock(c2, block);
                    if (cur.disabled)
                        c2 = appendBlock(c2, buildDisableBlock(id, true));
                    try {
                        await writePatch(newAbs, c2);
                    }
                    catch (e) {
                        try {
                            await writePatch(oldAbs, origOld);
                        }
                        catch (e2) { /* best effort */ }
                        return { ok: false, error: '写入失败（已回滚）: ' + message(e) };
                    }
                }
                else {
                    let c = await readPatch(newAbs);
                    c = removeEntryAll(c, id);
                    c = appendBlock(c, block);
                    if (cur.disabled)
                        c = appendBlock(c, buildDisableBlock(id, true));
                    await writePatch(newAbs, c);
                }
                return { ok: true };
            });
        }
        async function mcpmSetEnabled(args) {
            const p = await ensurePaths();
            const { id, level } = args;
            const enabled = !!args.enabled;
            if (!id || (level !== 'global' && level !== 'project'))
                return { ok: false, error: '缺少 id 或 level' };
            if (!(await entryExists(id, level)))
                return { ok: false, error: '未找到条目 ' + id };
            const abs = level === 'global' ? p.globalPatch : p.projectPatch;
            return withWriteLock(async () => {
                let c = await readPatch(abs);
                if (enabled) {
                    // Drop every `disabled: true` override for this id. If the insert row
                    // itself still says disabled (e.g. user hand-edited it), append an
                    // explicit `disabled: false` override so the effective state flips.
                    // Enable overrides are intentionally left in place — they are the
                    // mechanism that lets a disabled-by-default row be turned on.
                    c = removeMarked(c, id, 'disable');
                    const { rows } = parseRows(c);
                    const row = rows.find((r) => r.id === id);
                    if (row && row.disabled)
                        c = appendBlock(c, buildDisableBlock(id, false));
                }
                else {
                    c = removeMarked(c, id, 'enable');
                    c = appendBlock(c, buildDisableBlock(id, true));
                }
                await writePatch(abs, c);
                return { ok: true };
            });
        }
        async function mcpmRestart(args) {
            const p = await ensurePaths();
            const { id, level } = args;
            if (!id || (level !== 'global' && level !== 'project'))
                return { ok: false, error: '缺少 id 或 level' };
            if (!(await entryExists(id, level)))
                return { ok: false, error: '未找到条目 ' + id };
            const abs = level === 'global' ? p.globalPatch : p.projectPatch;
            return withWriteLock(async () => {
                let c = await readPatch(abs);
                c = removeMarked(c, id, 'enable');
                c = appendBlock(c, buildDisableBlock(id, true));
                await writePatch(abs, c);
                const warnings = [];
                if (pluginInventory) {
                    const off = await waitFor(async () => {
                        const e = await liveEntry(id);
                        return e ? e.enabled === false : false;
                    }, 5000, 300);
                    if (!off)
                        warnings.push('loader 未在 5 秒内停用该服务');
                }
                await wait(1000);
                c = await readPatch(abs);
                c = removeMarked(c, id, 'disable');
                await writePatch(abs, c);
                if (pluginInventory) {
                    const on = await waitFor(async () => {
                        const e = await liveEntry(id);
                        return e ? e.enabled === true : false;
                    }, 5000, 300);
                    if (!on)
                        warnings.push('loader 未在 5 秒内重新启用该服务');
                }
                else
                    await wait(1500);
                return warnings.length ? { ok: true, warning: warnings.join('；') } : { ok: true };
            });
        }
        async function mcpmRemove(args) {
            const p = await ensurePaths();
            const { id, level } = args;
            if (!id || (level !== 'global' && level !== 'project'))
                return { ok: false, error: '缺少 id 或 level' };
            const abs = level === 'global' ? p.globalPatch : p.projectPatch;
            return withWriteLock(async () => {
                let c = await readPatch(abs);
                c = removeEntryAll(c, id);
                await writePatch(abs, c);
                return { ok: true };
            });
        }
        async function mcpmExport() {
            const p = await ensurePaths();
            const list = await mcpmList();
            const rows = (list.rows || []).filter((r) => r.level !== 'loader').map((r) => ({
                id: r.id,
                serverName: r.serverName,
                transport: r.transport,
                url: r.url || undefined,
                command: r.command || undefined,
                args: r.args || undefined,
                env: r.env || undefined,
                headers: r.headers || undefined,
                level: r.level,
                disabled: r.disabled,
            }));
            const json = JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 2);
            let savedTo = null;
            try {
                const abs = p.home + (p.home.indexOf('\\') >= 0 ? '\\' : '/') + 'mcp-manager-export.json';
                await writePatch(abs, json);
                savedTo = abs;
            }
            catch (e) { /* non-fatal */ }
            return { ok: true, json, savedTo };
        }
        async function mcpmImport(args) {
            const p = await ensurePaths();
            let parsed = null;
            try {
                parsed = JSON.parse(String(args.json || ''));
            }
            catch (e) {
                return { ok: false, error: 'JSON 解析失败: ' + message(e) };
            }
            const entries = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.rows) ? parsed.rows : null);
            if (!entries)
                return { ok: false, error: '导入内容格式不正确：需要数组或 { rows: [...] }' };
            const added = [];
            const skipped = [];
            for (const item of entries) {
                const norm = normalizeImportItem(item);
                if (!norm.ok) {
                    skipped.push({ id: (item && (item.id || item.serverName)) || '?', reason: norm.error });
                    continue;
                }
                const row = norm.row;
                // Existence checks run INSIDE the write lock so two concurrent imports
                // (or an import racing an add) cannot both pass the same-id/same-name
                // check and duplicate rows (TOCTOU).
                const res = await withWriteLock(async () => {
                    const existing = await collectAll();
                    if (existing.ids.has(row.id))
                        return { skipped: true, reason: 'id 已存在' };
                    if (existing.serverNames.has(row.serverName))
                        return { skipped: true, reason: 'serverName 已存在' };
                    const abs = row.level === 'global' ? p.globalPatch : p.projectPatch;
                    let c = await readPatch(abs);
                    c = appendBlock(c, buildInsertBlock(row));
                    if (row.disabled)
                        c = appendBlock(c, buildDisableBlock(row.id, true));
                    await writePatch(abs, c);
                    return { added: true };
                });
                if (res.added)
                    added.push(row.id);
                else
                    skipped.push({ id: row.id, reason: (res && res.reason) || '写入失败' });
            }
            return { ok: true, added, skipped };
        }
        function parseKv(text) {
            const out = {};
            String(text || '').split(/\r?\n/).forEach((line) => {
                const t = line.trim();
                if (!t || t.startsWith('#'))
                    return;
                const i = t.indexOf('=');
                if (i <= 0)
                    return;
                out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
            });
            return out;
        }
        function parseArgs(text) {
            return String(text || '').split(/[\s,]+/).map((s) => s.trim()).filter((s) => s !== '');
        }
        const handlers = {
            'plugin-version': pluginVersion,
            'mcpm-list': mcpmList,
            'mcpm-add': mcpmAdd,
            'mcpm-edit': mcpmEdit,
            'mcpm-set-enabled': mcpmSetEnabled,
            'mcpm-restart': mcpmRestart,
            'mcpm-remove': mcpmRemove,
            'mcpm-export': mcpmExport,
            'mcpm-import': mcpmImport,
            'skill-list': skillList,
            'skill-toggle': skillToggle,
        };
        // ---------- agent-facing tools (standard ctx.tools.register + defineTool) ----------
        const text = (value) => [{ type: 'text', text: value }];
        tools.register(defineTool({
            name: 'mcp_manager_list',
            description: 'List all configured MCP servers (level, enabled state, live loader status, registered tool count).',
            parameters: {},
            output: { schema: { type: 'string' }, render: (_a, v) => text(v) },
            async execute() {
                const r = await mcpmList();
                if (!r.ok)
                    throw new Error(r.error);
                const summary = (r.rows || []).map((x) => (x.id + ' | ' + x.serverName + ' | ' + x.level + ' | ' + (x.disabled ? 'disabled' : 'enabled') +
                    (x.live ? ' | loader:' + (x.live.enabled ? 'on' : 'off') + (x.live.phase ? ':' + x.live.phase : '') : '') +
                    (typeof x.toolCount === 'number' ? ' | tools:' + x.toolCount : '')));
                return 'MCP servers:\n' + (summary.join('\n') || '(none)');
            },
        }));
        tools.register(defineTool({
            name: 'mcp_manager_set_enabled',
            description: 'Enable or disable one configured MCP server (writes the patch file; takes effect via HMR).',
            parameters: {
                id: { type: 'string', required: true, description: 'Entry id of the MCP server, e.g. mcp-stepfun-web-search.' },
                level: { type: 'string', required: true, description: 'project or global.' },
                enabled: { type: 'boolean', required: true, description: 'true to enable, false to disable.' },
            },
            output: { schema: { type: 'string' }, render: (_a, v) => text(v) },
            async execute(args) {
                const r = await mcpmSetEnabled({ id: args.id, level: args.level, enabled: args.enabled });
                if (!r.ok)
                    throw new Error(r.error);
                return 'OK: ' + args.id + ' now ' + (args.enabled ? 'enabled' : 'disabled');
            },
        }));
        tools.register(defineTool({
            name: 'mcp_manager_restart',
            description: 'Restart one configured MCP server (disable + re-enable; reconnect and re-sync tools).',
            parameters: {
                id: { type: 'string', required: true, description: 'Entry id of the MCP server, e.g. mcp-stepfun-web-search.' },
                level: { type: 'string', required: true, description: 'project or global.' },
            },
            output: { schema: { type: 'string' }, render: (_a, v) => text(v) },
            async execute(args) {
                const r = await mcpmRestart({ id: args.id, level: args.level });
                if (!r.ok)
                    throw new Error(r.error);
                return 'OK: ' + args.id + ' restarted';
            },
        }));
        tools.register(defineTool({
            name: 'mcp_manager_add',
            description: 'Add a new MCP server (streamable-http or stdio) at project or global level.',
            parameters: {
                serverName: { type: 'string', required: true, description: 'Unique server name (1-32 chars, [A-Za-z0-9_-]).' },
                transport: { type: 'string', required: true, description: 'streamable-http or stdio.' },
                url: { type: 'string', description: 'Server URL (required for streamable-http).' },
                command: { type: 'string', description: 'Executable (required for stdio).' },
                args: { type: 'string', description: 'Arguments, space separated (stdio).' },
                headers: { type: 'string', description: 'Extra headers as key=value lines (streamable-http).' },
                env: { type: 'string', description: 'Extra env vars as key=value lines (stdio).' },
                level: { type: 'string', description: 'project or global (default project).' },
            },
            output: { schema: { type: 'string' }, render: (_a, v) => text(v) },
            async execute(args) {
                const r = await mcpmAdd(args);
                if (!r.ok)
                    throw new Error(r.error);
                return 'OK: added ' + r.row.id + ' at ' + r.row.level;
            },
        }));
        // ---------- HTTP API route (UI half), registered defensively ----------
        if (webServer) {
            // Cap request bodies (1 MiB) — the API has no legitimate large payloads,
            // and unbounded buffering would let a local attacker exhaust memory.
            const MAX_BODY = 1024 * 1024;
            const readBody = (req) => new Promise((resolve, reject) => {
                const chunks = [];
                let size = 0;
                req.on('data', (c) => {
                    const s = String(c);
                    size += s.length;
                    if (size > MAX_BODY) {
                        reject(new Error('request body too large'));
                        return;
                    }
                    chunks.push(s);
                });
                req.on('end', () => resolve(chunks.join('')));
                req.on('error', reject);
            });
            try {
                // ctx.effect wires the route's disposer into this plugin's scope, so an
                // unload (HMR removal, disable, update) unregisters the route — the
                // documented cleanup contract (webServer.register does not auto-scope).
                ctx.effect(() => webServer.register({
                    kind: 'exact',
                    path: '/dsh-mcp-manager/api',
                    handler: async (req, res) => {
                        // Cross-site (CSRF) gate. This route mutates config files, so it
                        // must only be reachable from the DSH web UI (same origin) or
                        // local tooling. A browser cross-site request cannot attach a
                        // custom header without a CORS preflight, and this route never
                        // answers preflights — requiring `x-dsh-plugin` is the primary
                        // gate; POST-only and the Origin check are defense in depth.
                        const hdr = (name) => {
                            const v = req.headers?.[name];
                            return Array.isArray(v) ? v[0] ?? '' : v ?? '';
                        };
                        if (String(req.method || 'POST').toUpperCase() !== 'POST') {
                            res.writeHead(405, { 'content-type': 'application/json' });
                            res.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
                            return;
                        }
                        if (hdr('x-dsh-plugin') !== 'dsh-mcp-manager') {
                            res.writeHead(403, { 'content-type': 'application/json' });
                            res.end(JSON.stringify({ ok: false, error: 'missing plugin gate header' }));
                            return;
                        }
                        const origin = hdr('origin');
                        if (origin) {
                            let sameOrigin = false;
                            try {
                                const u = new URL(origin);
                                const hostHdr = hdr('host') || '';
                                sameOrigin =
                                    /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname) || u.host === hostHdr;
                            }
                            catch (e) { /* unparseable origin → rejected below */ }
                            if (!sameOrigin) {
                                res.writeHead(403, { 'content-type': 'application/json' });
                                res.end(JSON.stringify({ ok: false, error: 'cross-origin request rejected' }));
                                return;
                            }
                        }
                        res.writeHead(200, { 'content-type': 'application/json' });
                        try {
                            let payload = {};
                            try {
                                payload = JSON.parse((await readBody(req)) || '{}');
                            }
                            catch (e) {
                                if (String(e?.message).includes('body too large')) {
                                    res.end(JSON.stringify({ ok: false, error: '请求体过大' }));
                                    return;
                                }
                                /* otherwise fall through with {} */
                            }
                            const op = String(payload.op || '');
                            if (TOKEN && WRITE_OPS.has(op) && hdr('x-dsh-token') !== TOKEN) {
                                res.end(JSON.stringify({ ok: false, error: '缺少或错误的访问令牌（x-dsh-token）' }));
                                return;
                            }
                            const fn = handlers[op];
                            if (!fn) {
                                res.end(JSON.stringify({ ok: false, error: '未知操作: ' + op }));
                                return;
                            }
                            const result = await fn(payload.args || {});
                            res.end(JSON.stringify(result === undefined ? { ok: true } : result));
                        }
                        catch (e) {
                            res.end(JSON.stringify({ ok: false, error: message(e) }));
                        }
                    },
                }), 'dsh-mcp-manager: api route');
            }
            catch (e) {
                // A registration failure must never take down the whole entry: log and continue.
                console.error('[dsh-mcp-manager] webServer route registration failed:', message(e));
            }
        }
    },
};
