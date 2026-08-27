# dsh-mcp-manager

<!-- Hero -->
<div align="center">
  <b style="font-size: 1.15em;">Manage every MCP server in DeepSeek Harness from one settings page — install, configure, monitor.</b><br /><br />
  <code>server list</code> <code>add / edit / delete</code> <code>enable / disable</code> <code>restart</code> <code>tool-count health</code> <code>JSON export / import</code><br />
  <code>4 model tools</code> <code>HTTP API</code> <code>dsh plugin one-command</code><br /><br />
  <b>Settings → MCP 管理</b> manages <code>@deepseek-ai/dsh-mcp-client</code> rows in your project-level and
  global <code>cordis.patch.yml</code> — no hand-editing, every change applies live via HMR, survives restarts and upgrades.
</div>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@xxxyz/dsh-mcp-manager?logo=npm&color=cb3837)](https://www.npmjs.com/package/@xxxyz/dsh-mcp-manager)
[![License](https://img.shields.io/github/license/xxxyz/DeepSeekHarness-MCP-Manager?color=blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)](package.json)
[![GitHub](https://img.shields.io/badge/GitHub-xxxyz%2FDeepSeekHarness--MCP--Manager-181717?logo=github)](https://github.com/xxxyz/DeepSeekHarness-MCP-Manager)
[![dsh.market](https://img.shields.io/badge/dsh.market-%E2%9C%93-3fb950)](https://dsh.market)
[![awesome-dsh-plugin](https://img.shields.io/badge/awesome--dsh--plugin-pending-ffd93d)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2078)

</div>

<div align="center">
  🛒 Listed on <a href="https://dsh.market"><b>dsh.market</b></a> · submitted to <a href="https://awesome-dsh-plugin.com"><b>awesome-dsh-plugin.com</b></a> (<a href="https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2078"><b>PR #2078</b></a> pending merge)
</div>

<div align="center">
  🌏 <a href="./README.md">中文</a> · <a href="./README_EN.md"><b>English</b></a>
</div>

<br />

<p align="center"><img src="show.png" alt="dsh-mcp-manager Settings → MCP 管理 page" /></p>

## ✨ Features

- **📋 Server list** — every configured MCP server (`@deepseek-ai/dsh-mcp-client` instance): `serverName`, transport (`stdio` / `streamable-http`), URL / command, enabled state, live loader phase, registered tool count
- **➕ Add / ➖ Delete** — form-based (env / headers / args supported) with format and duplicate-name validation; one-click delete
- **🔌 Enable / Disable** — flip at any time, tools hot-connect / hot-disconnect
- **🔄 Restart** — disable + re-enable, reconnect and re-sync tools automatically
- **💾 Persistence** — written to the **project-level** (`profiles/<profile>/cordis.patch.yml`) or **global** (`~/.dsh/cordis.patch.yml`) patch file; survives restarts; the file path is shown at the bottom of the page
- **🩺 Health check** — live tool counts and loader phase per server, problems visible at a glance
- **📦 Backup / Restore** — JSON export / import; merges new entries, skips existing ones
- **🤖 Model tools** — four `mcp_manager_*` tools registered on the host, so the model can query and manage MCP servers directly
- **🌐 HTTP API** — `POST /dsh-mcp-manager/api` (JSON `{op, args}` → `{ok, ...}`) for the client and scripts. Cross-site (CSRF) protected: POST-only, requires the `x-dsh-plugin: dsh-mcp-manager` request header, and checks the Origin is same-origin (local scripts without an Origin are fine)
- **📦 One-command install** — `dsh plugin --profile web add` installs and mounts automatically (Windows / macOS / Linux)

## 🚀 Install

**Prerequisite**: DSH installed and running (`dsh web` works), Node.js ≥ 18, pnpm ≥ 9.

### Method 1 · dsh command (recommended)

One command installs the package and **auto-mounts** it (the `dsh.bundle.patch` mechanism — no manual config file edits needed):

```sh
dsh plugin --profile web add @xxxyz/dsh-mcp-manager@latest
```

After installing, **hard-refresh the browser** (Cmd/Ctrl+Shift+R) and open **Settings → MCP 管理** (DSH hot-reloads client changes; a full restart is only needed for host-half changes).

### Method 2 · Let DSH install it

Paste this prompt into any DSH conversation:

```text
Install the dsh-mcp-manager plugin (DSH MCP server manager):
1. Run dsh plugin --profile web add @xxxyz/dsh-mcp-manager@latest
2. When done, remind me to hard-refresh the browser (Cmd/Ctrl+Shift+R)
If you hit an error, check https://github.com/xxxyz/DeepSeekHarness-MCP-Manager README's FAQ table.
```

**Update**

```sh
dsh plugin --profile web add @xxxyz/dsh-mcp-manager@latest
```

Or bump the version in `~/.dsh/profiles/web/package.json` and run `pnpm install`. Hard-refresh the browser afterwards (Cmd/Ctrl+Shift+R) — client changes are hot-reloaded; only host-half changes need a restart.

<details>
<summary><b>Build from source / develop</b> (optional, alternative to npm)</summary>

To develop locally or follow the dev branch, build a tarball and install through the official channel (real copy, not a symlink):

```text
1. git clone https://github.com/xxxyz/DeepSeekHarness-MCP-Manager.git
cd DeepSeekHarness-MCP-Manager && npm install && npm run build
2. npm pack                               # produces xxyz-dsh-mcp-manager-<version>.tgz
3. dsh plugin --profile web add ./xxxyz-dsh-mcp-manager-<version>.tgz
4. hard-refresh the browser (Cmd/Ctrl+Shift+R)
```

Update: `git pull && npm install && npm run build && npm pack` → re-run `dsh plugin add <tgz>`. To switch back to the npm channel, change the dependency in `~/.dsh/profiles/web/package.json` to `"@xxxyz/dsh-mcp-manager": "^2.0.6"` and `pnpm install`.

</details>

<details>
<summary><b>Script install</b> (legacy: for environments without pnpm / old DSH)</summary>

```sh
npx -y @xxxyz/dsh-mcp-manager                    # one-shot (npx, Windows / macOS / Linux)
# or global npm: npm i -g @xxxyz/dsh-mcp-manager && dsh-mcp-manager
```

The installer ① copies the package to `local-packages/` (source of record, untouched by DSH upgrades) ② copies it into `profiles/node_modules/` (a plain copy, not a symlink) ③ appends the loader row to `cordis.patch.yml` (idempotent). All flags pass through: `npx -y @xxxyz/dsh-mcp-manager --dsh-home /path/.dsh --profile web --repair --port 3080`.

> ⚠️ **Do not mix** the script channel with the `dsh plugin add` channel — that causes a double mount (two MCP tabs / duplicated tools).

</details>

<details>
<summary><b>FAQ</b></summary>

| Symptom | Cause & fix |
|---|---|
| No "MCP 管理" in Settings after install | Hard-refresh (Cmd/Ctrl+Shift+R); if still missing, restart DSH once. |
| **Two MCP tabs / duplicated tools** | Double mount: both the script install and `dsh plugin add` were used. Remove one (delete the loader row from `cordis.patch.yml`, or the `dsh.profile.bundles` entry). |
| Tools missing after a DSH upgrade | (Script channel) run `--repair` (see below). |
| `npx` / `npm view` reports 404 | Local mirror (npmmirror) sync lag: add `--registry=https://registry.npmjs.org` or wait a moment. |
| `dsh: command not found` | Install DSH first, or use `npx -y --package @deepseek-ai/dsh dsh plugin --profile web add @xxxyz/dsh-mcp-manager@latest`. |
| Config changes don't take effect | All changes apply via HMR within 1–2 s; the page auto-polls. |

</details>

<details>
<summary><b>After a DSH upgrade: --repair</b></summary>

(Script channel) If a DSH upgrade (or a broken HMR state) leaves the settings page or the `mcp_manager_*` tools missing, run one repair command: redeploy → bump the loader row's `config.version` (forces an HMR re-apply) → poll the API until `{ok:true}` (default 30 s).

```sh
node dsh-mcp-manager/install.mjs --repair --port 3080
# PowerShell: .\install.ps1 -Repair -Port 3080    bash: ./install.sh --repair --port 3080
```

If the API still does not answer, restart DSH once (the loader re-imports at boot).

</details>

<details>
<summary><b>Uninstall</b></summary>

```sh
dsh plugin --profile web remove @xxxyz/dsh-mcp-manager     # official channel
# Script channel: dsh-mcp-manager-uninstall (npm -g) or .\uninstall.ps1 | ./uninstall.sh | node uninstall.mjs
```

Then restart DSH. The script uninstall removes the deployed copy, the `local-packages` source, and the loader row (the patch stays a valid array).

</details>

## 📖 Usage

Open **Settings → MCP 管理**:

- **Add a server**: enter `serverName` (unique, 1–32 chars of `[A-Za-z0-9_-]`), the transport and its fields (`streamable-http` → URL / headers; `stdio` → command / args / env), and the level (project / global). The form validates format and duplicate names.
- Each card shows live status, the connection target and the tool count; you can **enable / disable**, **restart**, **edit** and **delete**.
- **Backup / Restore**: export the configuration as JSON with one click, or paste JSON to import (merges new entries, skips existing ones).
- The file path being edited is shown at the bottom of the page.

## ⚙️ Configuration

Configuration of the plugin itself on its loader row:

| Field | Description |
|---|---|
| `version` | The loader row's `config.version`. `--repair` increments it to force an HMR re-apply; no manual edits needed. |

The loader row must be an **`insert` block** (in DSH's patch dialect a plain `- id:` row only overrides existing entries and can never add a new plugin):

```yaml
- insert:
    - id: dsh-mcp-manager
      name: dsh-mcp-manager
      config:
        version: 1
```

## 🏗️ Architecture

- **Host half** (`src/index.ts` → `lib/index.js`, an object-form Cordis plugin `{name, inject, apply}`): `inject` declares `timer/fs/settings/sandboxPolicy/webServer/tools` — the framework guarantees they are ready and reloads the plugin if one disappears, which is how the plugin survives DSH upgrades. Registers four model tools (`ctx.tools.register(defineTool(...))`) and the exact route `POST /dsh-mcp-manager/api` (scoped cleanup via `ctx.effect`); line-level CRUD on `cordis.patch.yml` (mini YAML parser + per-file write lock).
- **Browser half** (`lib/client.js`, ModuleLoader CJS bundle): registers the Settings → MCP 管理 page (`settings.section` slot, order 16) and talks to the host through same-origin `fetch('/dsh-mcp-manager/api')` — it never touches the filesystem directly.
- **Loader row**: written into the profile's `cordis.patch.yml`; the client-modules service scans enabled entries and serves the client bundle.
- **Installers**: `install.mjs` (cross-platform core) / `install.ps1` / `install.sh`, plus matching `uninstall.*`; the npm package `@xxxyz/dsh-mcp-manager` exposes them as bins (`dsh-mcp-manager` / `dsh-mcp-manager-uninstall`).

## 🛠️ Development

```bash
npm install
npm run build        # tsc -p tsconfig.json → lib/index.js (host half)
```

- Host source: `src/index.ts`; browser bundle: `lib/client.js` (hand-written, no build step)
- The package is pure JS, zero-dependency and cross-platform; building only needs the devDependencies (typescript, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, `@types/node`)
- Publishing: `npm version patch && npm publish` (`prepublishOnly` builds automatically; the scoped package has `publishConfig.access: public`)

## License

MIT
