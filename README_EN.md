# dsh-mcp-manager

<!-- Hero -->
<div align="center">
  <b style="font-size: 1.15em;">Manage every MCP server in DeepSeek Harness from one settings page — install, configure, monitor.</b><br /><br />
  <code>server list</code> <code>add / edit / delete</code> <code>enable / disable</code> <code>restart</code> <code>tool-count health</code> <code>JSON export / import</code><br />
  <code>4 model tools</code> <code>HTTP API</code> <code>npx / npm / dsh plugin / scripts</code><br /><br />
  <b>Settings → MCP 管理</b> manages <code>@deepseek-ai/dsh-mcp-client</code> rows in your project-level and
  global <code>cordis.patch.yml</code> — no hand-editing, every change applies live via HMR, survives restarts and upgrades.
</div>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@xxxyz/dsh-mcp-manager?logo=npm&color=cb3837)](https://www.npmjs.com/package/@xxxyz/dsh-mcp-manager)
[![License](https://img.shields.io/github/license/xxxyz/DeepSeekHarness-MCP-Manager?color=blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)](package.json)
[![GitHub](https://img.shields.io/badge/GitHub-xxxyz%2FDeepSeekHarness--MCP--Manager-181717?logo=github)](https://github.com/xxxyz/DeepSeekHarness-MCP-Manager)

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
- **📦 Cross-platform install** — one command on Windows / macOS / Linux (npx / npm / `dsh plugin` / scripts)

## 🚀 Install

**Prerequisite**: DSH installed and running (`dsh web` works), Node.js ≥ 18.

### Method 1 · One-shot npx (recommended)

```sh
npx -y @xxxyz/dsh-mcp-manager
```

All flags pass through: `npx -y @xxxyz/dsh-mcp-manager --dsh-home /path/.dsh --profile web --repair --port 3080`.

### Method 2 · Global npm install (for frequent use)

```sh
npm i -g @xxxyz/dsh-mcp-manager
dsh-mcp-manager                  # install the plugin
dsh-mcp-manager-uninstall        # uninstall the plugin
npm i -g @xxxyz/dsh-mcp-manager@latest   # upgrade
```

### Method 3 · dsh command (bundle)

```sh
dsh plugin --profile web add @xxxyz/dsh-mcp-manager
# or from GitHub (build artifacts are committed, no local build needed)
dsh plugin --profile web add github:xxxyz/DeepSeekHarness-MCP-Manager
```

### Method 4 · No npm account: straight from GitHub

```sh
npx -y github:xxxyz/DeepSeekHarness-MCP-Manager
```

<details>
<summary><b>Script install</b> (source checkout; idempotent)</summary>

**Windows (PowerShell)**:

```powershell
.\dsh-mcp-manager\install.ps1                     # default: ~/.dsh, web profile
.\dsh-mcp-manager\install.ps1 -DshHome D:\path\.dsh -Profile web
```

**macOS / Linux (bash)** (run `chmod +x dsh-mcp-manager/install.sh` if needed):

```sh
./dsh-mcp-manager/install.sh                      # default: ~/.dsh, web profile
./dsh-mcp-manager/install.sh --dsh-home /path/.dsh --profile web
```

**Any platform (direct)**:

```sh
node dsh-mcp-manager/install.mjs [--dsh-home <path>] [--profile <name>] [--port <n>] [--repair] [--skip-patch]
```

The installer ① copies the package to `local-packages/` (source of record, untouched by DSH upgrades) ② copies it into `profiles/node_modules/` (a plain copy, not a symlink, so ESM resolves `@deepseek-ai/dsh-tools`) ③ appends the loader row (an `insert` block, idempotent).

</details>

After installing, **hard-refresh the browser** (Cmd/Ctrl+Shift+R) and open **Settings → MCP 管理**. If the page is missing, restart DSH once (the host half needs a first mount).

<details>
<summary><b>Uninstall</b></summary>

```sh
dsh-mcp-manager-uninstall                          # if installed via npm -g
# or: .\uninstall.ps1 | ./uninstall.sh | node uninstall.mjs [--dsh-home <path>] [--profile <name>]
```

Then restart DSH. Uninstall removes the deployed copy, the `local-packages` source, and the loader row (the patch stays a valid array).

</details>

<details>
<summary><b>After a DSH upgrade: --repair</b></summary>

If a DSH upgrade (or a broken HMR state) leaves the settings page or the `mcp_manager_*` tools missing, run one repair command: redeploy → bump the loader row's `config.version` (forces an HMR re-apply) → poll the API until `{ok:true}` (default 30 s).

```sh
node dsh-mcp-manager/install.mjs --repair --port 3080
# PowerShell: .\install.ps1 -Repair -Port 3080    bash: ./install.sh --repair --port 3080
```

If the API still does not answer, restart DSH once (the loader re-imports at boot).

</details>

<details>
<summary><b>FAQ</b></summary>

| Symptom | Cause & fix |
|---|---|
| No "MCP 管理" in Settings after install | Hard-refresh (Cmd/Ctrl+Shift+R); if still missing, restart DSH once. |
| **Two MCP tabs / duplicated tools** | Double mount: both install.mjs and `dsh plugin add` were used. Remove one (run `dsh-mcp-manager-uninstall`, or delete the extra loader row / `dsh.profile.bundles` entry). |
| Tools missing after a DSH upgrade | Run `--repair` (see above). |
| `npx` / `npm view` reports 404 | Local mirror (npmmirror) sync lag: add `--registry=https://registry.npmjs.org` or wait a moment. |
| Installer fails with `EPERM` | DSH is running and holds the files: quit DSH before installing. |
| Config changes don't take effect | All changes apply via HMR within 1–2 s; the page auto-polls. |

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
