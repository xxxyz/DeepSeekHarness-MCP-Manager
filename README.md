# dsh-mcp-manager

<!-- Hero -->
<div align="center">
  <b style="font-size: 1.15em;">DeepSeek Harness 的 MCP 服务与技能管理器：装没装、连没连、一页管完。</b><br /><br />
  <code>服务器列表</code> <code>新增 / 编辑 / 删除</code> <code>启用 / 停用</code> <code>重启</code> <code>工具数健康</code> <code>JSON 导出 / 导入</code><br />
  <code>Skills 浏览 / 搜索 / 停用</code> <code>4 个模型工具</code> <code>HTTP API</code> <code>dsh plugin 一条命令</code><br /><br />
  <b>设置 → MCP 服务</b> 管理<strong>当前 profile</strong> 的 <code>cordis.patch.yml</code> 中的 <code>@deepseek-ai/dsh-mcp-client</code> 行，全局 home 层只读展示；<br />
  <b>设置 → Skills</b> 浏览并停用全局、项目根、用户根与插件提供技能——无需再手改配置文件，修改经 Loader 热应用。
</div>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@xxxyz/dsh-mcp-manager?logo=npm&color=cb3837)](https://www.npmjs.com/package/@xxxyz/dsh-mcp-manager)
[![License](https://img.shields.io/github/license/xxxyz/DeepSeekHarness-MCP-Manager?color=blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js)](package.json)
[![DSH](https://img.shields.io/badge/dsh-%3E%3D0.2.1--rc.2%20%3C0.3-4d6bfe)](package.json)
[![GitHub](https://img.shields.io/badge/GitHub-xxxyz%2FDeepSeekHarness--MCP--Manager-181717?logo=github)](https://github.com/xxxyz/DeepSeekHarness-MCP-Manager)
[![dsh.market](https://img.shields.io/badge/dsh.market-%E2%9C%93-3fb950)](https://dsh.market)
[![awesome-dsh-plugin](https://img.shields.io/badge/awesome--dsh--plugin-%E5%B7%B2%E6%94%B6%E5%BD%95-3fb950)](https://awesome-dsh-plugin.com)
[![dsh-suite](https://img.shields.io/badge/featured%20on-dsh--suite-4d6bfe)](https://whyihaveyou.github.io/dsh-suite/)

</div>

<div align="center">
  🛒 已收录于 <a href="https://dsh.market"><b>dsh.market</b></a> · <a href="https://awesome-dsh-plugin.com"><b>awesome-dsh-plugin.com</b></a> · <a href="https://whyihaveyou.github.io/dsh-suite/"><b>dsh-suite</b></a>
</div>

<div align="center">
  🌏 <a href="./README.md"><b>中文</b></a> · <a href="./README_EN.md">English</a>
</div>

## ✨ 功能一览

- **📋 服务器列表**：列出所有已配置的 MCP 服务器（`@deepseek-ai/dsh-mcp-client` 实例）——`serverName`、传输方式（`stdio` / `streamable-http`）、URL / 命令、启用状态、Loader 实时阶段、已注册工具数
- **➕ 新增 / ➖ 删除**：表单添加 MCP 服务器（支持 env / headers / args / cwd / 超时 / 重连），带格式与重名校验；一键删除
- **🔌 启用 / 停用**：只管理当前 profile 的行，优先走 DSH 官方 `pluginManager.setPluginEnabled()`；不可寻址时回退到当前 profile patch
- **🔄 重启**：禁用 + 重新启用，自动重连并重新同步工具；实时等待 Loader 阶段变化
- **💾 持久化**：写入**当前 profile**（`profiles/<profile>/cordis.patch.yml`），重启后保留；`~/.dsh/cordis.patch.yml` 的全局 home 行只读展示（可查看、不参与编辑/启停/导出）。路径区默认只显示当前 profile，仅当 home 层确实有 MCP 行（或覆盖了 profile 行）时才显示 home 路径。
- **🩺 健康检查**：每台服务器实时工具数与 Loader 阶段；失败/零工具给出提示
- **⚙️ 0.2.x 配置字段**：`cwd`、`toolCallTimeoutMs`、`failOnStartupError`、`maxInstructionBytes`、`reconnect.{enabled,initialDelayMs,maxDelayMs,maxAttempts}`
- **📦 备份 / 恢复**：JSON 导出 / 导入，合并新增、已存在自动跳过
- **🤖 模型工具**：宿主持久注册 4 个 `mcp_manager_*` 工具，模型可直接查询与操作 MCP 服务
- **🧠 技能管理**：**设置 → Skills** 聚合全局与每个活动会话作用域的技能，按来源分组（项目根 / 运行时 / 扩展根 / 用户根 / 预置根 / 插件提供）；项目根、用户根与插件技能都能真正停用（global + 每个 agent scope 的 rank-0 override provider），状态持久化到 `dsh-skill-manager.json`，HMR 即时生效
- **🌐 HTTP API**：`POST /dsh-mcp-manager/api`（JSON `{op, args}` → `{ok, ...}`），供客户端与脚本调用。仅接受 POST、必须携带 `x-dsh-plugin: dsh-mcp-manager` 请求头、校验同源 Origin（curl 等本地脚本无需 Origin）
- **🎨 与 DSH 默认插件一致**：页面宽度、字号、卡片、状态 chip、开关、搜索框与对话框沿用 `--dsw-alias-*` 主题 token；中英文本地化经 Client locale 服务注册；对话框支持 Escape / 遮罩关闭 / 焦点还原
- **📦 一键安装**：`dsh plugin --profile <profile> add` 一条命令装包 + 自动挂载（Windows / macOS / Linux）

## 🚀 安装

**前置**：DSH `>= 0.2.1-rc.2 < 0.3`，Node.js ≥ 20、pnpm ≥ 9。

### 方式一 · dsh 命令安装（推荐）

一条命令装包 + **自动挂载**（`dsh.bundle.patch` 机制，无需手动改任何配置文件）：

```sh
dsh plugin --profile desktop add @xxxyz/dsh-mcp-manager@latest
```

`desktop` 是 DeepSeek Desktop 的 profile；CLI 的 Web profile 用 `web`，其他 profile 换成对应名称。

装完**硬刷新浏览器**（Cmd/Ctrl+Shift+R）即可看到 **设置 → MCP 服务 / Skills**（DSH 对 client 改动热加载，无需重启；仅 host 半更新时需要重启 DSH）。

### 方式二 · 让 DSH 自己装

把下面这段提示词发给任意一个 DSH 会话：

```text
帮我安装 dsh-mcp-manager 插件（DSH MCP 服务管理器），步骤：
1. 执行 dsh plugin --profile desktop add @xxxyz/dsh-mcp-manager@latest
2. 完成后提醒我硬刷新浏览器（Cmd/Ctrl+Shift+R）
遇到报错先查 https://github.com/xxxyz/DeepSeekHarness-MCP-Manager README 的常见问题表。
```

**更新**

```sh
dsh plugin --profile desktop add @xxxyz/dsh-mcp-manager@latest
```

也可把 `~/.dsh/profiles/<profile>/package.json` 里的版本号改高后 `pnpm install`。改完**硬刷新浏览器**（Cmd/Ctrl+Shift+R）即可（client 改动无需重启 DSH）。

> **版本要求**：本包声明 `engines.dsh = ">=0.2.1-rc.2 <0.3.0"`。在更旧的 DSH（如 0.1.x）上会被启动检查拒绝挂载；在 0.3+ 上需要按新契约升级。

<details>
<summary><b>常见问题</b></summary>

| 现象 | 原因与解决 |
|---|---|
| 装完设置里没有「MCP 服务 / Skills」 | 硬刷新（Cmd/Ctrl+Shift+R）；仍没有就重启 DSH 一次。 |
| 提示 DSH 版本不兼容 | 本包面向 DSH 0.2.x。升级 DSH，或使用旧版插件。 |
| 页面出现**两个 MCP 页签 / 工具重复** | 双挂载：同时存在旧的 loader 行与新的 bundle 条目。删掉 `cordis.patch.yml` 里的旧 loader 行，或 `dsh.profile.bundles` 里的条目，重启 DSH。 |
| 切换/重启返回 `unaddressable` 或 `management-required` | 该行来自 bundle 或聚合层，DSH 不允许经 profile patch 修改；页面按只读展示。 |
| 页面里有一行标记“全局 home（只读）” | 该行来自 `~/.dsh/cordis.patch.yml`，优先级高于 profile。管理器只展示、不修改；要编辑请在该 profile 新增一份。 |
| `pluginManager` 报某行 “did not activate” | MCP 服务器本身连接失败（URL / 命令 / 凭证 / 网络）。查看该行 `loader: failed` 提示并检查服务端。 |
| 之前用旧方式装过，现在想升级 | 先 `dsh plugin --profile <profile> remove @xxxyz/dsh-mcp-manager`，再安装 3.0.0；新版 bundle 自带防双挂载 guard。 |
| 提示 `dsh: command not found` | 先安装 DSH；或直接用 `npx -y --package @deepseek-ai/dsh dsh plugin --profile desktop add @xxxyz/dsh-mcp-manager@latest`。 |
| `npm view` 报 404 | 国内镜像（npmmirror）同步有延迟：加 `--registry=https://registry.npmjs.org` 或稍等再试。 |
| 修改配置后未生效 | 当前 profile 的写入由 HMR 热应用；等待 1–2 秒。不可寻址的 bundle 行需要重启。 |

</details>

<details>
<summary><b>卸载</b></summary>

```sh
dsh plugin --profile <profile> remove @xxxyz/dsh-mcp-manager
```

然后重启 DSH。

</details>

## 📖 使用说明

打开 **设置 → MCP 服务**：

- **添加服务器**：填写 `serverName`（唯一，1–32 位 `[A-Za-z0-9_-]`）、传输方式及对应字段（`streamable-http` 填 URL / headers；`stdio` 填 command / args / env / cwd）。服务写入**当前 profile**，不需要选择级别。高级选项可设置超时、启动失败策略、说明字节上限与重连参数。
- 每张卡片显示实时状态、连接目标、Loader 阶段与工具数；可 **启用 / 停用**、**重启**、**编辑**、**删除**、**工具预览**。
- **备份 / 恢复**：一键导出 JSON，或粘贴 JSON 导入（合并新增，已存在自动跳过）。
- 页面底部显示正在编辑的补丁文件路径。

打开 **设置 → Skills**：

- **浏览 / 搜索**：聚合全局技能与每个活动会话的 preset 作用域技能，按来源分组（项目根 / 运行时 / 扩展根 / 用户根 / 预置根 / 插件提供），组内按 provider 折叠；搜索框实时过滤。
- **启用 / 停用**：一键切换任意技能。项目根、用户根与插件技能都通过 **每个 agent scope 的 rank-0 override provider** 真正生效；全局层同时保留 override，覆盖没有活动会话的读取。
- **持久化**：停用状态写入 `<profileDir>/dsh-skill-manager.json`，重启后保留；改动经 HMR 即时生效。

## ⚙️ 配置

插件自身在 loader 行中的配置（`Config` 由 Schemastery 校验）：

| 字段 | 说明 |
|---|---|
| `token` | **可选**访问令牌（写操作鉴权，纵深防御）。设置后写操作（增删改/启停/重启/导入导出/技能停用）须带 `x-dsh-token: <token>` 头；设置页提供令牌输入框（保存在浏览器 localStorage）。也可用环境变量 `DSH_MCP_MANAGER_TOKEN` 配置。默认关闭。 |

> **为什么需要 token？** 插件的 CSRF 防护只拦"跨站浏览器请求"——它假设 DSH web 只监听本机（`127.0.0.1`）。一旦你通过端口转发、`dsh-web-lan-access` 类插件或反向代理把端口暴露到局域网/公网，**任何能访问该端口的人都直接获得完整写权限**：可以新增/修改 MCP 服务器，而 `stdio` 服务的 `command` 字段可填任意可执行文件——等同于**远程任意代码执行**。token 就是为这种暴露场景加的最后一道闸：没有密钥就无法做任何写操作，即使端口被暴露也不能注入命令。本地单机使用不需要配置。
>
> **注意**：token 只保护写操作。`mcpm-list` / `mcpm-tools` / `skill-list` 等读接口仍开放，用于设置页渲染，其中 `mcpm-list` 会返回 `env` / `headers` 配置。若端口暴露且需要连读也鉴权，请在网络层（反向代理/防火墙/VPN）再加一道，或不要暴露 DSH 端口。

loader 行必须为 **`insert` 块**形式（DSH patch 方言中普通 `- id:` 行只是对已存在条目的覆盖，无法新增插件）：

```yaml
- insert:
    - id: dsh-mcp-manager
      name: '@xxxyz/dsh-mcp-manager'
      config:
        token: 你的访问令牌   # 可选：开启写操作鉴权
```

> 无需手动写这行——`dsh plugin add` 的 bundle patch 会自动插入（见 `cordis.patch.yml`）。

## 🏗️ 架构

- **宿主端**（`src/index.ts` → `lib/index.js`，0.2.x 命名导出 `name` / `inject` / `Config` / `apply`）：
  - 硬依赖 `timer` / `fs` / `tools`；`skills`、`agents`、`pluginManager`、`configEditor`、`webServer` 通过 `ctx.inject([...])` 可选接入，服务消失时注册自动清理。
  - MCP：只写当前 profile；profile 行优先用 `configEditor` 落盘、`pluginManager` 启停；`~/.dsh/cordis.patch.yml` 的 home 行只读展示（home 优先级更高，管理器不改写）。补齐 0.2.x 配置字段。
  - Skills：global provider + 每个 agent scope 的 rank-0 provider；`skill-list` 聚合 global、各 agent 作用域与用户技能目录。
  - 注册 4 个模型工具（`ctx.tools.register(defineTool(...))`）与精确路由 `POST /dsh-mcp-manager/api`（`ctx.effect` 作用域化清理）。
- **浏览器端**（`lib/client.js`，ModuleLoader CJS bundle，module id = 包名）：
  - `inject = ['slots','locale','timer']`；`ctx.locale.register('dsh.mcpManager', { zh, en })`。
  - 注册 **设置 → MCP 服务**（`settings.section`，order 16）与 **设置 → Skills**（order 17）。
  - 同源 `fetch('/dsh-mcp-manager/api')` 与宿主通信，不直接访问文件系统；样式只用 `--dsw-alias-*` token。
- **loader 行**：由 `dsh plugin add` 的 bundle patch 自动插入，`client-modules` 服务按包名匹配并下发客户端 bundle。

## 🛠️ 开发

```bash
npm install
npm run build        # tsc -p tsconfig.json → lib/index.js（宿主端）
npm test             # build + node --test（37 例）
npm run lint         # node --check lib/client.js && node --check lib/index.js
```

- 宿主插件源码：`src/index.ts`；浏览器 bundle：`lib/client.js`（手写，无需构建）
- 运行时依赖：`yaml`（文档级 YAML 编辑）与 `@deepseek-ai/schemastery`（Config）；`@deepseek-ai/dsh-tools` 由 DSH 运行时提供
- 测试夹具：`tests/helpers.mjs`（fake Cordis ctx）；`tests/client.test.mjs` 用 ReactDOMServer 做渲染冒烟
- 发布：`npm version patch && npm publish`（`prepublishOnly` 自动构建；scoped 包已配置 `publishConfig.access: public`）

## 许可证

MIT
