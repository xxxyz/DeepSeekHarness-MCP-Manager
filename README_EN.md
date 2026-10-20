# dsh-mcp-manager

<!-- Hero -->
<div align="center">
  <b style="font-size: 1.15em;">MCP server and skill management for DeepSeek Harness — installed, connected, managed on one page.</b><br /><br />
  <code>Server list</code> <code>Add / edit / remove</code> <code>Enable / disable</code> <code>Restart</code> <code>Tool health</code> <code>JSON export / import</code><br />
  <code>Browse / search / disable skills</code> <code>4 model tools</code> <code>HTTP API</code> <code>one-command install</code><br /><br />
  <b>Settings → MCP servers</b> manages <code>@deepseek-ai/dsh-mcp-client</code> rows in the <strong>current profile's</strong> <code>cordis.patch.yml</code>; rows from the global home layer are shown read-only.<br />
  <b>Settings → Skills</b> browses and disables global, project-root, user-root, and plugin-provided skills. Every change applies through the Loader.
</div>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@xxxyz/dsh-mcp-manager?logo=npm&color=cb3837)](https://www.npmjs.com/package/@xxxyz/dsh-mcp-manager)
[![License](https://img.shields.io/github/license/xxxyz/DeepSeekHarness-MCP-Manager?color=blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js)](package.json)
[![DSH](https://img.shields.io/badge/dsh-%3E%3D0.2.1--rc.2%20%3C0.3-4d6bfe)](package.json)
[![GitHub](https://img.shields.io/badge/GitHub-xxxyz%2FDeepSeekHarness--MCP--Manager-181717?logo=github)](https://github.com/xxxyz/DeepSeekHarness-MCP-Manager)
[![dsh.market](https://img.shields.io/badge/dsh.market-%E2%9C%93-3fb950)](https://dsh.market)
[![awesome-dsh-plugin](https://img.shields.io/badge/awesome--dsh--plugin-listed-3fb950)](https://awesome-dsh-plugin.com)
[![dsh-suite](https://img.shields.io/badge/featured%20on-dsh--suite-4d6bfe)](https://whyihaveyou.github.io/dsh-suite/)

</div>

<div align="center">
  🌏 <a href="./README.md">中文</a> · <a href="./README_EN.md"><b>English</b></a>
</div>

## ✨ Features

- **📋 Server list**: every configured MCP server (`@deepseek-ai/dsh-mcp-client`) with `serverName`, transport (`stdio` / `streamable-http`), URL or command, enablement, live Loader phase, and registered tool count.
- **➕ Add / remove**: a form with env / headers / args / cwd / timeout / reconnection, format and duplicate validation, and one-click removal.
- **🔌 Enable / disable**: manages current-profile rows, preferring the official `pluginManager.setPluginEnabled()`; falls back to the current profile patch when the row is unaddressable.
- **🔄 Restart**: disable and re-enable, reconnect, and re-sync tools while watching the Loader phase.
- **💾 Persistence**: writes to the **current profile** (`profiles/<profile>/cordis.patch.yml`) and survives restart. Rows from `~/.dsh/cordis.patch.yml` (global home) are listed read-only: visible, but not edited, toggled, or exported. The path area shows only the current profile unless the home layer actually has MCP rows (or overrides a profile row).
- **🩺 Health**: live tool counts and Loader phases; failure and zero-tool states are called out.
- **⚙️ 0.2.x fields**: `cwd`, `toolCallTimeoutMs`, `failOnStartupError`, `maxInstructionBytes`, `reconnect.{enabled,initialDelayMs,maxDelayMs,maxAttempts}`.
- **📦 Backup / restore**: JSON export and import; imports add missing rows and skip existing ones.
- **🤖 Model tools**: four `mcp_manager_*` tools registered on the Host.
- **🧠 Skills**: **Settings → Skills** aggregates the global registry and every live session scope, grouped by source (project root, runtime, custom root, user root, bundled root, plugin-provided). Project-root, user-root, and plugin skills can genuinely be disabled through rank-0 override providers in the global layer and each agent scope. State lives in `dsh-skill-manager.json` and applies immediately.
- **🌐 HTTP API**: `POST /dsh-mcp-manager/api` with `{op, args}` → `{ok, ...}`. POST-only, requires `x-dsh-plugin: dsh-mcp-manager`, and validates the same-origin `Origin` (local scripts without an Origin still work).
- **🎨 Host-consistent UI**: page width, type sizes, cards, status chips, switches, search fields, and dialogs use `--dsw-alias-*` theme tokens; Chinese and English go through the Client locale service; dialogs support Escape, backdrop close, and focus restore.
- **📦 One-command install**: `dsh plugin --profile <profile> add` installs and mounts the bundle.

## 🚀 Install

**Requirements**: DSH `>= 0.2.1-rc.2 < 0.3`, Node.js ≥ 20, pnpm ≥ 9.

### Option 1 — dsh CLI (recommended)

```sh
dsh plugin --profile desktop add @xxxyz/dsh-mcp-manager@latest
```

`desktop` is the DeepSeek Desktop profile; use `web` for the CLI Web profile, or your own profile name.

After installation, hard-refresh the browser (Cmd/Ctrl+Shift+R). Client changes hot-reload; only a Host-half update needs a DSH restart.

### Option 2 — let DSH install it

```text
Install the dsh-mcp-manager plugin (DSH MCP server manager):
1. Run: dsh plugin --profile desktop add @xxxyz/dsh-mcp-manager@latest
2. When it finishes, remind me to hard-refresh the browser (Cmd/Ctrl+Shift+R).
If it fails, check the FAQ in https://github.com/xxxyz/DeepSeekHarness-MCP-Manager first.
```

**Update**

```sh
dsh plugin --profile desktop add @xxxyz/dsh-mcp-manager@latest
```

You can also raise the version in `~/.dsh/profiles/<profile>/package.json` and run `pnpm install`, then hard-refresh.

> **Version requirement**: this package declares `engines.dsh = ">=0.2.1-rc.2 <0.3.0"`. Older DSH releases (0.1.x) refuse to mount it; 0.3+ needs an upgrade against the new contract.

<details>
<summary><b>FAQ</b></summary>

| Symptom | Cause and fix |
|---|---|
| No “MCP servers” / “Skills” section | Hard-refresh (Cmd/Ctrl+Shift+R); if it is still missing, restart DSH. |
| DSH version is incompatible | This build targets DSH 0.2.x. Upgrade DSH or use the previous plugin major. |
| Two MCP tabs or duplicated tools | Double mount: an old loader row and the bundle entry both exist. Remove the old row from `cordis.patch.yml` or the profile bundle list, then restart. |
| Enable/restart says `unaddressable` or `management-required` | The row comes from a bundle or aggregate layer that DSH does not address through the profile patch; the page shows it read-only. |
| A row is tagged “Global home (read-only)” | The row comes from `~/.dsh/cordis.patch.yml`, which outranks the profile. The manager only displays it; add a copy in the current profile to edit it. |
| `pluginManager` reports “did not activate” | The MCP server itself failed to connect (URL, command, credentials, network). Check the `loader: failed` hint and the server. |
| Upgrading from an older install | Remove the old package, then install 3.0.0. The bundle keeps its double-mount guard. |
| `dsh: command not found` | Install DSH first, or use `npx -y --package @deepseek-ai/dsh dsh plugin --profile desktop add @xxxyz/dsh-mcp-manager@latest`. |

</details>

<details>
<summary><b>Uninstall</b></summary>

```sh
dsh plugin --profile <profile> remove @xxxyz/dsh-mcp-manager
```

Then restart DSH.

</details>

## 📖 Usage

**Settings → MCP servers**

- **Add**: a unique `serverName` (1–32 characters of `[A-Za-z0-9_-]`), transport, and its fields (`streamable-http`: URL / headers; `stdio`: command / args / env / cwd). The server is written to the **current profile**; there is no level selector. Advanced options cover timeouts, startup failure policy, instruction byte limits, and reconnection.
- Each card shows live status, target, Loader phase, and tool count; use **enable/disable**, **restart**, **edit**, **delete**, or **tool preview**.
- **Backup / restore** exports JSON or imports a pasted document; existing names and ids are skipped.
- The footer lists the patch files being edited.

**Settings → Skills**

- **Browse/search**: aggregates global skills and every live session's preset-scope skills, grouped by source (project root, runtime, custom root, user root, bundled root, plugin-provided), then by provider. Search filters live.
- **Enable/disable**: every skill can be toggled. Project-root, user-root, and plugin skills are genuinely shadowed by rank-0 providers registered in the global layer and in each agent scope.
- **Persistence**: state is written to `<profileDir>/dsh-skill-manager.json` and survives restart; changes apply through HMR.

## ⚙️ Configuration

The plugin's own loader row (`Config` validated by Schemastery):

| Field | Meaning |
|---|---|
| `token` | Optional access token for state-changing HTTP operations. When set, add/edit/remove/enable/restart/export/import/skill-toggle require `x-dsh-token: <token>`. The settings page has a token field stored in browser localStorage; `DSH_MCP_MANAGER_TOKEN` works too. Off by default. |

> **Why a token?** The CSRF gate only stops cross-site browser requests and assumes DSH Web listens on localhost. If the port is exposed through port forwarding, a LAN-access plugin, or a reverse proxy, anyone reaching it would otherwise get full write access — and a `stdio` server's `command` can be any executable, which is remote code execution. The token is the last gate for that deployment. Local single-machine use does not need it.
>
> **Note**: the token protects writes only. Read endpoints such as `mcpm-list`, `mcpm-tools`, and `skill-list` remain open so the settings page can render; `mcpm-list` returns `env` / `headers` values. If the port is exposed and reads must be authenticated too, add authentication at the network layer or do not expose the DSH port.

Use an `insert` block to mount the plugin; a bare `- id:` row only overrides an existing entry:

```yaml
- insert:
    - id: dsh-mcp-manager
      name: '@xxxyz/dsh-mcp-manager'
      config:
        token: your-token   # optional
```

The bundle patch from `dsh plugin add` writes this row automatically.

## 🏗️ Architecture

- **Host** (`src/index.ts` → `lib/index.js`, 0.2.x named exports `name` / `inject` / `Config` / `apply`):
  - Hard dependencies: `timer`, `fs`, `tools`. `skills`, `agents`, `pluginManager`, `configEditor`, and `webServer` are optional through `ctx.inject([...])`, so their registrations follow the service lifetime.
  - MCP: writes only the current profile; profile rows prefer `configEditor` for writes and `pluginManager` for toggles; rows from `~/.dsh/cordis.patch.yml` are shown read-only because the home layer outranks profile and is not a supported write target.
  - Skills: one global provider plus one rank-0 provider per agent scope; `skill-list` aggregates the global layer, agent scopes, and user skill roots.
  - Registers four model tools (`ctx.tools.register(defineTool(...))`) and the exact `POST /dsh-mcp-manager/api` route, both scoped through `ctx.effect`.
- **Browser** (`lib/client.js`, ModuleLoader CJS bundle, module id = package name):
  - `inject = ['slots','locale','timer']`; `ctx.locale.register('dsh.mcpManager', { zh, en })`.
  - Registers **Settings → MCP servers** (`settings.section`, order 16) and **Settings → Skills** (order 17).
  - Talks to the Host over same-origin `fetch('/dsh-mcp-manager/api')`; never touches the filesystem; styles use only `--dsw-alias-*` tokens.
- **Loader row**: inserted by the bundle patch; `client-modules` attaches the browser half by package name.

## 🛠️ Development

```bash
npm install
npm run build        # tsc -p tsconfig.json → lib/index.js
npm test             # build + node --test (37 tests)
npm run lint         # node --check lib/client.js && node --check lib/index.js
```

- Host source: `src/index.ts`; browser bundle: `lib/client.js` (hand-written, no build step).
- Runtime dependencies: `yaml` (document-level editing) and `@deepseek-ai/schemastery` (Config); `@deepseek-ai/dsh-tools` is provided by the DSH runtime.
- Test fixtures: `tests/helpers.mjs` (fake Cordis ctx); `tests/client.test.mjs` renders both pages with ReactDOMServer as a smoke test.
- Release: `npm version patch && npm publish` (`prepublishOnly` builds; the scoped package sets `publishConfig.access: public`).

## License

MIT
