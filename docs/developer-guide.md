# dsh-mcp-manager 开发文档

本仓库的开发 / 调试 / 发布指南，面向 DSH **0.2.1-rc.2** 的插件契约。需要改动源码或排查挂载问题的人从这里开始。

## 一、项目概览

`dsh-mcp-manager` 是 DSH 0.2.x 的双半 bundle 插件：

- **宿主半（host）**：`src/index.ts` → 编译产物 `lib/index.js`。命名导出 `name` / `inject` / `Config` / `apply`（函数形态 Cordis 插件）。
  - 注册 4 个模型工具与精确路由 `POST /dsh-mcp-manager/api`。
  - 管理**当前 profile** 的 `cordis.patch.yml` 中的 `@deepseek-ai/dsh-mcp-client` 行；home 层只读展示。
  - 管理 Skills 的停用状态：global provider + 每个 agent scope 的 rank-0 provider。
  - 优先使用 DSH 官方服务：`pluginManager`（实时 inventory / 启停）、`configEditor`（profile 级配置落盘）、`agents`（活动会话）、`skills`（技能注册表）、`webServer`（UI API）。
- **浏览器半（client）**：`lib/client.js`。手写 ModuleLoader CJS bundle，module id = 包名 `@xxxyz/dsh-mcp-manager`。注册 **设置 → MCP 服务**（`settings.section`，order 16）与 **设置 → Skills**（order 17），通过同源 `fetch('/dsh-mcp-manager/api')` 与宿主通信，不直接访问文件系统。

## 二、目录结构

```
.
├── src/index.ts                  # 宿主半源码（TypeScript）
├── lib/
│   ├── index.js                  # 宿主半编译产物（tsc 生成，入库）
│   └── client.js                 # 浏览器半（手写，无构建步骤）
├── locale/
│   ├── en.json                   # 插件展示元数据（meta.title/description）
│   └── zh.json
├── icon.svg                      # 插件管理器图标
├── tests/
│   ├── helpers.mjs               # fake Cordis ctx / HTTP 调用
│   ├── mcpm.test.mjs             # MCP CRUD、YAML、pluginManager/configEditor
│   ├── skills.test.mjs           # 技能列表、override、用户技能停用
│   ├── client.test.mjs           # bundle 契约 + ReactDOMServer 渲染冒烟
│   └── guard.test.mjs            # 双挂载 guard 短路顺序
├── docs/
│   ├── archive/2026-08-27-audit.md
│   └── plans/2026-10-20-dsh-0.2.1-modernization.md
├── cordis.patch.yml              # bundle patch：dsh plugin add 自动挂载
└── package.json                  # dsh.bundle.patch + dsh.client + engines.dsh
```

## 三、构建与测试

```bash
npm install
npm run build        # tsc -p tsconfig.json → lib/index.js
npm test             # build + node --test
npm run lint         # node --check lib/client.js && node --check lib/index.js
```

- 宿主半运行在 DSH 的 Node 进程；`yaml` 与 `@deepseek-ai/schemastery` 是运行时依赖。
- `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-agent` 等 DSH 包由安装时的运行时解析提供；它们在 `devDependencies` 中只为编译与测试解析。
- `lib/index.js` 是入库产物：改 `src/index.ts` 后必须 `npm run build` 并提交。
- `lib/client.js` 手写；改完 `node --check lib/client.js`。
- 测试夹具 `tests/helpers.mjs` 通过 `DSH_HOME` / `DSH_PROFILE_DIR` 把路径固定到临时目录，绝不要指向真实 profile。

## 四、宿主半

### 4.1 插件形态

```ts
export const name = 'dsh-mcp-manager'
export const inject = ['timer', 'fs', 'tools']
export const Config = z.object({ token: z.string().default('') })
export function apply(ctx, config) { ... }
```

- 硬依赖只有 `timer` / `fs` / `tools`。
- 其余服务用 `ctx.inject([...], child => ...)` 可选接入；服务消失时该 child fiber 的 `effect` / `on` 会自动清理。
- **不要**把 `skills` 等写进 `inject` 硬依赖：headless / SDK profile 可能没有它们，硬依赖会让插件永远 inactive。
- 访问可选服务时用 `child.get(name)` 或 `ctx.get(name)`，不要在未 inject 的 context 上写 `ctx.skills`（会抛 `cannot get property "skills" without inject`）。
- agent 作用域同理：`agent.ctx.get('skills')` 读取服务，但注册时必须通过 `agent.ctx.inject(['skills'], child => child.skills.registerProvider(...))`，让方法绑定到该作用域；直接调用 `service.registerProvider` 会注册到 global 层。

### 4.2 路径发现

`paths()` 的优先级：

1. `DSH_PROFILE_DIR` / `DSH_HOME` / `DSH_PROFILE` 环境变量（Desktop 与 CLI 启动时设置）。
2. `ctx.get('settings').prepareDocument()` 返回的 profile patch 路径。
3. `~/.dsh/profiles/{desktop,web,headless}` 探测与扫描。

不要让插件假设 profile 叫 `web`：DeepSeek Desktop 使用 `desktop`。

### 4.3 MCP 数据面

- **读取**：`parsePatchText` 解析 profile 与 home 两层的 `insert` 行和 override 行；override 按层顺序应用（profile → home）。
- **只写 profile**：新增、编辑、启停、重启、删除都只操作 `profiles/<profile>/cordis.patch.yml`。不存在“项目级/工作区级” MCP 配置层。
- **有效配置**：`configEditor.configuration()` 可用时，profile 行的 `inherited + override` 覆盖文件读取值。
- **实时状态**：`pluginManager.listPlugins()` 按 `patchId` / `entryId` 匹配；`enabled` + `fiberPhase` 直接展示。
- **新增**：向 profile 写入 `insert` 行（`yaml` 文档级编辑，保留注释与 `!!js`）。旧客户端传 `level: global/home` 会被拒绝。
- **编辑**：profile 行且 `entry.fiber` 存在时用 `configEditor.edit()`；否则改写 profile YAML。未知字段会保留。
- **启停 / 重启**：profile 行且 `patchId` 存在时用 `pluginManager.setPluginEnabled()`；不可寻址时回退到 profile YAML。
- **删除**：从 profile 删除 insert 行与同 id 的 override 行（包括 config override）。
- **home 只读**：`~/.dsh/cordis.patch.yml` 的 insert/override 只参与读取与展示，标记 `level: 'home'` + `readOnlyReason: 'home'`；home 覆盖 profile 行时该 profile 行标记 `readOnlyReason: 'overridden-by-home'`。两类行都不允许编辑/启停/重启/删除，也不进入导出。路径区默认只显示当前 profile；仅当 home 层确实有 MCP 行或覆盖了 profile 行时，才显示 home 路径。
- **字段**：`serverName` / `transport` / url / command / args / env / headers / cwd / `toolCallTimeoutMs` / `failOnStartupError` / `maxInstructionBytes` / `reconnect.*`。

> **为什么不做 home 写入**：DSH 的 patch 顺序是 `bundle → profile → home → 命令行覆盖`，home 优先级更高，而 `pluginManager` / `configEditor` 只写 profile。插件再写 home 会产生“管理了但被覆盖”的状态，且绕过官方生命周期。跨 profile 共享应使用一个只 insert MCP 行的 bundle，或导出/导入。

> YAML 文档级编辑的约定：所有写入先读完整文档，解析失败直接返回错误；不静默截断。`createNode` 前把顶层 sequence 设为 block style，避免生成 flow 风格。

### 4.4 Skills 数据面

- 状态文件：`<profileDir>/dsh-skill-manager.json`，`{ version: 1, disabledSkills: string[] }`。
- **global provider**：`ctx.inject(['skills'], child => child.effect(() => child.skills.registerProvider(...)))`，rank 0。
- **每个 agent scope 的 provider**：`agent/created` 与 `agents.list()` 时调用 `agentCtx.inject(['skills'], child => child.effect(() => child.skills.registerProvider(...)))`；`scopeOf` 的符号是 `@deepseek-ai/dsh-scope` 的模块内 `Symbol('dsh.scope')`，不要 import 该包来比较（可能解析到第二份副本，符号不相等）。`scopeKeyOf(ctx)` 通过遍历原型链上的 `Symbol('dsh.scope')` 读取 scope。
- **列表聚合**：global `skills.snapshot({})` + 每个 agent view 的 `snapshot({ scope })` + 用户技能目录（`~/.dsh/skills`、`~/.agents/skills`）。按名字去重，优先非 override 定义。
- **来源分组**：按 DSH `source` 分为项目根（`project-*`）、运行时（`runtime`）、扩展根（`custom` = `customSkillDirs`）、用户根（`user-*`）、预置根（`bundled` = `bundledSkillDir`）、插件提供（其他 provider）。`source` 只表示扫描根类型，不代表作者或归属；判断归属要看 `path` + `provider`（例如 `agent-experience` 由 `dsh-agent-preset` 包提供，但挂载为 `custom` 根）。
- **停用**：写入状态 + override 定义，invalidate 所有 provider。禁用用户技能不需要改写 `SKILL.md`。
- **恢复**：`skills/change` 时 `ensureRestored()` 懒重放；provider 候选的 `rank: 0`、`invocation: { modelInvocable: false, userInvocable: false }`。

### 4.5 HTTP API

`POST /dsh-mcp-manager/api`，请求体 `{ op, args }`，响应 `{ ok, ... }`。

- 仅 POST。
- 必须带 `x-dsh-plugin: dsh-mcp-manager`。
- `Origin` 与 `webServer.getOrigin()` 比较；不可用时回退到 host 比较。
- 可选 token：`config.token` 或 `DSH_MCP_MANAGER_TOKEN`；写操作集合见 `WRITE_OPS`。
- token 只保护写操作；`mcpm-list` / `mcpm-tools` / `skill-list` 保持开放以便设置页渲染，其中 `mcpm-list` 会返回 `env` / `headers`。端口暴露场景应在网络层再加鉴权。
- 1 MiB 请求体上限。
- 所有文件写入经 `withWriteLock` 串行化。

### 4.6 模型工具

`ctx.tools.register(defineTool({...}))`，注册 4 个：

- `mcp_manager_list`
- `mcp_manager_set_enabled`
- `mcp_manager_restart`
- `mcp_manager_add`

工具描述面向模型；参数 DSL 用 `defineTool` 的 `parameters` 形式。新增字段时同步更新 `mcp_manager_add` 的参数。

## 五、浏览器半

- module id = 包名；`exports.inject = ['slots','locale','timer']`；`exports.apply(ctx)`。
- `ctx.locale.register('dsh.mcpManager', { zh, en })`；组件通过槽位 `locale: NS` 获得 `t`。
- 两个 `settings.section` 注册，`label: () => t('mcpNav')` / `t('skillNav')`。
- 样式只用 `--dsw-alias-*` token（带 fallback）；不要 import `@deepseek-ai/dsh-client-ui-primitives`（官方 practices 明确禁止普通 JS 插件加载 Harness Client 包）。
- 对话框：`role="dialog"`、`aria-modal`、Escape、遮罩关闭、初始焦点与关闭后焦点还原。
- 开关：`role="switch"` + `aria-checked`。
- 与宿主通信一律 `fetch('/dsh-mcp-manager/api')`，带 `x-dsh-plugin` 头；token 从 localStorage 读取。
- `tests/client.test.mjs` 用 `vm` 加载 bundle，验证 module id / inject / locale 字典 / 两个槽位，并用 ReactDOMServer 渲染初始状态。

## 六、双挂载 guard（cordis.patch.yml）

```yaml
- insert:
    - id: dsh-mcp-manager
      name: '@xxxyz/dsh-mcp-manager'
      disabled: !!js "[...ctx.loader.entries()].some((e) => e.options.id !== 'dsh-mcp-manager' && (e.options.name === 'dsh-mcp-manager' || e.options.name === '@xxxyz/dsh-mcp-manager') && !e.disabled)"
```

- 用途：已有启用的旧挂载（旧 `mcp-manager` 行或聚合包）时本行退让，避免 `/dsh-mcp-manager/api` 重复路由导致整棵插件树启动失败。
- **短路顺序是硬约束**：`!e.disabled` 必须最后。`Entry.disabled` 是无缓存 getter，若先读自身会重入表达式 → `Maximum call stack size exceeded`。
- `tests/guard.test.mjs` 用会抛错的 `disabled` getter 锁死顺序；改 `cordis.patch.yml` 必须跑测试。

## 七、本地安装 / 调试

本机使用 `plugin_manager` 安装工作区目录（link 模式）：

```text
plugin_manager action=install_bundle target=F:\path\to\dsh-mcp-manager
```

或 CLI：

```text
npm run build
dsh plugin --profile desktop add F:\path\to\dsh-mcp-manager
```

- `install_bundle` 返回 `application`：`applied` 表示已激活；`restart-required` / `overridden` / `failed` 需要分别处理。
- 验证入口：`cordis_inspect_query` Host `Config.listConfigs` 查 `@xxxyz/dsh-mcp-manager`；Client `Slots.listSubTree` 查 `settings.section` 的 `mcp-manager` / `skill-manager`。
- 验证 API：`POST http://127.0.0.1:<port>/dsh-mcp-manager/api`，Header `x-dsh-plugin: dsh-mcp-manager`，Body `{"op":"mcpm-list","args":{}}`。
- Host 半改动后，HMR 可能不会重载已加载的模块；用 `plugin_manager set_plugin` 关/开一次，或重启 DSH。
- Client 半改动需要硬刷新浏览器；`pnpm run dev:web` 不是本插件的一部分。

## 八、发布流程

```bash
npm test
npm version <新版本号>
git push origin main --tags
npm publish --registry=https://registry.npmjs.org
```

发布后：

- 本机 profile 若用 link/tarball，改回 registry 版本再 `pnpm install`。
- `pnpm 11 minimumReleaseAge` 可能让 `@latest` 静默回退到旧版本；把新版本加入 `~/.dsh/profiles/<profile>/pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`（带版本号的 OR 范围）。
- pnpm packument 缓存可能保留旧 dist-tags；删除 `%LOCALAPPDATA%\pnpm-cache\...\@xxxyz\dsh-mcp-manager.jsonl` 再试。
- 版本要求：`engines.dsh = ">=0.2.1-rc.2 <0.3.0"`；不要把 `engines.dsh` 去掉后只留 `peerDependencies` 的旧范围，否则 DSH 0.2.1 会判定不兼容。

## 九、维护注意

- **Windows PowerShell 写文件会带 BOM**：改 JSON 用 Node（`fs.writeFileSync`）或编辑器保存为 UTF-8 无 BOM。
- **不要手写 `ctx.config`**：entry 配置是 Cordis 调 `apply(ctx, config)` 的第二参数；`ctx.config` 未 inject 会抛错。
- **scope 符号不要跨包比较**：`@deepseek-ai/dsh-scope` 的 `Symbol('dsh.scope')` 是模块内符号；插件里用 `scopeKeyOf()` 读 context 自身。
- **样式 token**：只用 `--dsw-alias-*`；新增颜色先查 `cordis_inspect_query` Client `Theme.listTokens`。
- **文档约定**：`README.md` 中文主文档、`README_EN.md` 英文；当前仓库不再附带旧版截图，发布前请用 3.0 UI 重新生成一张再放回 README 与 `files`。
