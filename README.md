# dsh-mcp-manager

<!-- Hero -->
<div align="center">
  <b style="font-size: 1.15em;">DeepSeek Harness 的 MCP 服务管理器：装没装、连没连、一页管完。</b><br /><br />
  <code>服务器列表</code> <code>新增 / 编辑 / 删除</code> <code>启用 / 停用</code> <code>重启</code> <code>工具数健康</code> <code>JSON 导出 / 导入</code><br />
  <code>4 个模型工具</code> <code>HTTP API</code> <code>dsh plugin 一条命令</code><br /><br />
  <b>设置 → MCP 管理</b> 管理项目级与全局 <code>cordis.patch.yml</code> 中的 <code>@deepseek-ai/dsh-mcp-client</code> 行——<br />
  无需再手改配置文件，所有修改即改即生效（HMR 热应用），重启、升级后依然存在。
</div>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@xxxyz/dsh-mcp-manager?logo=npm&color=cb3837)](https://www.npmjs.com/package/@xxxyz/dsh-mcp-manager)
[![License](https://img.shields.io/github/license/xxxyz/DeepSeekHarness-MCP-Manager?color=blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)](package.json)
[![GitHub](https://img.shields.io/badge/GitHub-xxxyz%2FDeepSeekHarness--MCP--Manager-181717?logo=github)](https://github.com/xxxyz/DeepSeekHarness-MCP-Manager)
[![dsh.market](https://img.shields.io/badge/dsh.market-%E2%9C%93-3fb950)](https://dsh.market)
[![awesome-dsh-plugin](https://img.shields.io/badge/awesome--dsh--plugin-%E5%BE%85%E5%90%88%E5%B9%B6-ffd93d)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2078)

</div>

<div align="center">
  🛒 已收录于 <a href="https://dsh.market"><b>dsh.market</b></a> · 已提交 <a href="https://awesome-dsh-plugin.com"><b>awesome-dsh-plugin.com</b></a> 官方列表收录（<a href="https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2078"><b>PR #2078</b></a> 待合并）
</div>

<div align="center">
  🌏 <a href="./README.md"><b>中文</b></a> · <a href="./README_EN.md">English</a>
</div>

<br />

<p align="center"><img src="show.png" alt="dsh-mcp-manager 设置 → MCP 管理 页面图例" /></p>

## ✨ 功能一览

- **📋 服务器列表**：列出所有已配置的 MCP 服务器（`@deepseek-ai/dsh-mcp-client` 实例）——`serverName`、传输方式（`stdio` / `streamable-http`）、URL / 命令、启用状态、loader 实时加载阶段、已注册工具数
- **➕ 新增 / ➖ 删除**：表单添加 MCP 服务器（支持 env / headers / args），带格式与重名校验；一键删除
- **🔌 启用 / 停用**：随时切换，工具随之热连接 / 热断开
- **🔄 重启**：disable + re-enable，自动重连并重新同步工具
- **💾 持久化**：写入**项目级**（`profiles/<profile>/cordis.patch.yml`）或**全局**（`~/.dsh/cordis.patch.yml`），重启后保留；页面底部显示文件路径
- **🩺 健康检查**：每台服务器实时工具数与 loader 阶段，异常一目了然
- **📦 备份 / 恢复**：JSON 导出 / 导入，合并新增、已存在自动跳过
- **🤖 模型工具**：宿主注册 4 个 `mcp_manager_*` 工具，模型可直接查询与操作 MCP 服务
- **🌐 HTTP API**：`POST /dsh-mcp-manager/api`（JSON `{op, args}` → `{ok, ...}`），供客户端与脚本调用。带跨站（CSRF）防护：仅接受 POST、必须携带 `x-dsh-plugin: dsh-mcp-manager` 请求头、校验同源 Origin（curl 等本地脚本无需 Origin）
- **📦 一键安装**：`dsh plugin --profile web add` 一条命令装包 + 自动挂载（Windows / macOS / Linux）

## 🚀 安装

**前置**：已装好 DSH（`dsh web` 能正常运行），Node.js ≥ 18、pnpm ≥ 9。

### 方式一 · dsh 命令安装（推荐）

一条命令装包 + **自动挂载**（`dsh.bundle.patch` 机制，无需手动改任何配置文件）：

```sh
dsh plugin --profile web add @xxxyz/dsh-mcp-manager@latest
```

装完**硬刷新浏览器**（Cmd/Ctrl+Shift+R）即可看到 **设置 → MCP 管理**（DSH 对 client 改动热加载，无需重启；仅 host 半更新时需要重启）。

### 方式二 · 让 DSH 自己装

把下面这段提示词发给任意一个 DSH 会话：

```text
帮我安装 dsh-mcp-manager 插件（DSH MCP 服务管理器），步骤：
1. 执行 dsh plugin --profile web add @xxxyz/dsh-mcp-manager@latest
2. 完成后提醒我硬刷新浏览器（Cmd/Ctrl+Shift+R）
遇到报错先查 https://github.com/xxxyz/DeepSeekHarness-MCP-Manager README 的常见问题表。
```

**更新**

```sh
dsh plugin --profile web add @xxxyz/dsh-mcp-manager@latest
```

也可把 `~/.dsh/profiles/web/package.json` 里的版本号改高后 `pnpm install`。改完**硬刷新浏览器**（Cmd/Ctrl+Shift+R）即可（client 改动无需重启 DSH）。

<details>
<summary><b>从源码安装 / 开发</b>（可选，替代 npm 方式）</summary>

调试本地改动或跟随开发分支时，用 tarball 走官方通道（真复制，非符号链接）：

```text
1. git clone https://github.com/xxxyz/DeepSeekHarness-MCP-Manager.git
cd DeepSeekHarness-MCP-Manager && npm install && npm run build
2. npm pack                               # 生成 xxyz-dsh-mcp-manager-<版本>.tgz
3. dsh plugin --profile web add ./xxxyz-dsh-mcp-manager-<版本>.tgz
4. 硬刷新浏览器（Cmd/Ctrl+Shift+R）
```

更新：`git pull && npm install && npm run build && npm pack` → 重新 `dsh plugin add <tgz>`。切回 npm 通道时，把依赖改回 `"@xxxyz/dsh-mcp-manager": "^2.0.6"` 再 `pnpm install`。

</details>

<details>
<summary><b>脚本安装</b>（旧通道：无 pnpm / 旧版 DSH 兼容）</summary>

```sh
npx -y @xxxyz/dsh-mcp-manager                    # 一键（npx 方式，Windows / macOS / Linux）
# 或 npm 全局：npm i -g @xxxyz/dsh-mcp-manager && dsh-mcp-manager
```

脚本会：① 复制到 `local-packages/`（真源备份，DSH 升级不动它）② 复制到 `profiles/node_modules/`（普通复制而非软链接）③ 幂等追加 loader 行到 `cordis.patch.yml`。所有参数照常透传：`npx -y @xxxyz/dsh-mcp-manager --dsh-home /path/.dsh --profile web --repair --port 3080`。

> ⚠️ 脚本通道与 `dsh plugin add` 通道**不要混用**，否则会双挂载（页面出现两个 MCP 页签 / 工具重复）。

</details>

<details>
<summary><b>常见问题</b></summary>

| 现象 | 原因与解决 |
|---|---|
| 装完设置里没有「MCP 管理」 | 硬刷新（Cmd/Ctrl+Shift+R）；仍没有就重启 DSH 一次。 |
| 页面出现**两个 MCP 页签 / 工具重复** | 双挂载：同时用了脚本安装与 `dsh plugin add`。卸载其中一种（删掉 `cordis.patch.yml` 里的 loader 行，或 `dsh.profile.bundles` 条目）。 |
| DSH 升级后工具消失 | 脚本通道跑一次 `--repair`（见下方「DSH 升级后」）。 |
| `npx` / `npm view` 报 404 | 国内镜像（npmmirror）同步有延迟：加 `--registry=https://registry.npmjs.org` 或稍等再试。 |
| 提示 `dsh: command not found` | 先安装 DSH；或直接用 `npx -y --package @deepseek-ai/dsh dsh plugin --profile web add @xxxyz/dsh-mcp-manager@latest`。 |
| 修改配置后未生效 | 所有修改走 HMR 热应用，等 1–2 秒自动刷新；页面会自动轮询。 |

</details>

<details>
<summary><b>DSH 升级后：--repair</b></summary>

（脚本通道）DSH 升级（或 HMR 状态异常）后若 **设置里没有「MCP 管理」** 或 **`mcp_manager_*` 工具消失**，运行一次修复命令：重新部署 → 递增 loader 行 `config.version`（触发 HMR 重应用）→ 轮询 API 直到 `{ok:true}`（默认 30 秒）。

```sh
node dsh-mcp-manager/install.mjs --repair --port 3080
# PowerShell: .\install.ps1 -Repair -Port 3080    bash: ./install.sh --repair --port 3080
```

仍不恢复则重启一次 DSH（loader 启动时重新导入）。

</details>

<details>
<summary><b>卸载</b></summary>

```sh
dsh plugin --profile web remove @xxxyz/dsh-mcp-manager     # 官方通道
# 脚本通道：dsh-mcp-manager-uninstall（npm -g）或 .\uninstall.ps1 | ./uninstall.sh | node uninstall.mjs
```

然后重启 DSH。脚本卸载会删除部署副本、`local-packages` 真源，并清理 loader 行（补丁保持合法）。

</details>

## 📖 使用说明

打开 **设置 → MCP 管理**：

- **添加服务器**：填写 `serverName`（唯一，1–32 位 `[A-Za-z0-9_-]`）、传输方式及对应字段（`streamable-http` 填 URL / headers；`stdio` 填 command / args / env），选择级别（项目级 / 全局）。面板做格式与重名校验。
- 每张卡片显示实时状态、连接目标与工具数；可 **启用 / 停用**、**重启**、**编辑**、**删除**。
- **备份 / 恢复**：一键导出 JSON，或粘贴 JSON 导入（合并新增，已存在自动跳过）。
- 页面底部显示正在编辑的补丁文件路径。

## ⚙️ 配置

插件自身在 loader 行中的配置：

| 字段 | 说明 |
|---|---|
| `version` | loader 行 `config.version`。`--repair` 会将其递增以强制 HMR 重应用，无需手动修改。 |

loader 行必须为 **`insert` 块**形式（DSH patch 方言中普通 `- id:` 行只是对已存在条目的覆盖，无法新增插件）：

```yaml
- insert:
    - id: dsh-mcp-manager
      name: dsh-mcp-manager
      config:
        version: 1
```

## 🏗️ 架构

- **宿主端**（`src/index.ts` → `lib/index.js`，对象形态 Cordis 插件 `{name, inject, apply}`）：`inject` 声明 `timer/fs/settings/sandboxPolicy/webServer/tools`，框架保证就绪并在依赖消失时自动重载——这是插件跨 DSH 升级存活的机制。注册 4 个模型工具（`ctx.tools.register(defineTool(...))`）与精确路由 `POST /dsh-mcp-manager/api`（`ctx.effect` 作用域化清理）；对 `cordis.patch.yml` 做行级 CRUD（迷你 YAML 解析 + 按文件写锁）。
- **浏览器端**（`lib/client.js`，ModuleLoader CJS bundle）：注册 设置 → MCP 管理 页（`settings.section` 槽位，order 16），经同源 `fetch('/dsh-mcp-manager/api')` 与宿主通信，不直接访问文件系统。
- **loader 行**：写入 profile 的 `cordis.patch.yml`，client-modules 服务扫描启用的条目并下发客户端 bundle。
- **安装器**：`install.mjs`（跨平台核心）/ `install.ps1` / `install.sh` + 对应的 `uninstall.*`；npm 包 `@xxxyz/dsh-mcp-manager` 的 bin 直接执行安装器（`dsh-mcp-manager` / `dsh-mcp-manager-uninstall`）。

## 🛠️ 开发

```bash
npm install
npm run build        # tsc -p tsconfig.json → lib/index.js（宿主端）
```

- 宿主插件源码：`src/index.ts`；浏览器 bundle：`lib/client.js`（手写，无需构建）
- 包本身纯 JS、零依赖、跨平台；构建只需 devDependencies（typescript、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@types/node`）
- 发布：`npm version patch && npm publish`（`prepublishOnly` 自动构建；scoped 包已配置 `publishConfig.access: public`）

## 许可证

MIT
