# dsh-mcp-manager（DSH MCP 服务管理器）

[中文](README.zh-CN.md) · [English](README.md)

![dsh-mcp-manager 设置页图例](show.png)

一个给 DeepSeek Harness (DSH) 用的**常驻 MCP 服务管理插件**——**loader 插件**（不是动态会话插件），安装后 DSH 重启、升级依然存在。

按 DSH 官方插件开发标准实现（参考官方文档：[第一个插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)、[开发一个工具](https://deepseek-harness.github.io/deepseek-harness/develop/basic/tool)）：

- **对象形态 Cordis 插件**（`export default { name, inject, apply }`）
- 必需服务在 `inject` 中声明——框架保证 `apply` 前已就绪，服务消失会自动重载插件（这是插件跨 DSH 升级存活的机制）
- 面向模型的能力用 **`ctx.tools.register(defineTool(...))`** 注册：`mcp_manager_list`、`mcp_manager_set_enabled`、`mcp_manager_restart`、`mcp_manager_add`
- 面向 UI 的能力用 **`webServer` 精确路由**（`POST /dsh-mcp-manager/api`），由客户端半区消费

功能入口：**设置 → MCP 管理**。

功能：

- 宿主半区管理 `@deepseek-ai/dsh-mcp-client` 行：
  - **项目级** → `~/.dsh/profiles/<profile>/cordis.patch.yml`
  - **全局** → `~/.dsh/cordis.patch.yml`
  - 新增 / 编辑 / 启用 / 禁用 / 重启 / 删除，工具数健康检查，JSON 导出/导入，按文件写锁
- 修改经 HMR 实时生效；重启 DSH 后由 Loader 自动加载

## 工作原理

| 部分 | 文件 | 作用 |
|---|---|---|
| 宿主插件源码 | `src/index.ts` | TypeScript 源码（官方文档的插件形态）；**`npm run build`**（tsc）编译 |
| 宿主插件（编译产物） | `lib/index.js`（`main`） | Cordis 对象插件：patch 文件 CRUD + 4 个模型工具 + `webServer` 精确路由 `/dsh-mcp-manager/api`（JSON `{op, args}` → `{ok, ...}`） |
| 客户端 bundle | `lib/client.js`（`exports["./client"]` + `dsh.client`） | 浏览器模块：注册设置页；通过 `fetch('/dsh-mcp-manager/api')` 调用宿主 |
| loader 行 | 追加到 profile 的 `cordis.patch.yml` | 组合宿主条目；client-modules 服务扫描启用的条目并下发客户端 bundle |

> **loader 行必须是 `insert` 块形式**：DSH 的 patch 方言（`applyEntryPatches`）把普通 `- id: x` 行当作"对已存在条目的配置覆盖"，目标不存在时会**静默跳过**——新增插件必须用 `- insert:` 形式（与插件自身管理 MCP 服务行一致）。

包本身**纯 JS、零依赖、跨平台**（路径分隔符运行时检测），Windows / macOS / Linux 均支持。构建（`npm run build`）需要 devDependencies（typescript、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@types/node`）；发布/安装的包**不需要**任何依赖。

## 安装（任选一种方式）

安装脚本会：

1. 复制包到 `<DSH主目录>/local-packages/dsh-mcp-manager`（真源备份，DSH 升级不会动它）；
2. 复制到 `<DSH主目录>/profiles/node_modules/dsh-mcp-manager`（**普通复制而非软链接**——软链接会让 Node ESM 按真实路径解析时找不到 `@deepseek-ai/dsh-tools`）；
3. 在 `profiles/<profile>/cordis.patch.yml` 追加 loader 行（insert 块，**幂等**，重复运行不会重复添加）。

### 方式 1：Windows（PowerShell）

```powershell
# 默认使用 ~/.dsh 和 web profile
.\dsh-mcp-manager\install.ps1

# 指定 DSH 主目录 / profile
.\dsh-mcp-manager\install.ps1 -DshHome D:\path\.dsh -Profile web

# 修复模式（见"DSH 升级后：--repair"）
.\dsh-mcp-manager\install.ps1 -Repair -Port 3080
```

### 方式 2：macOS / Linux（bash）

```bash
# 默认使用 ~/.dsh 和 web profile
./dsh-mcp-manager/install.sh

# 指定 DSH 主目录 / profile
./dsh-mcp-manager/install.sh --dsh-home /path/.dsh --profile web

# 修复模式
./dsh-mcp-manager/install.sh --repair --port 3080
```

> 若 `install.sh` 没有执行权限，先运行：`chmod +x dsh-mcp-manager/install.sh`

### 方式 3：任何平台直接运行（推荐，最通用）

```bash
node dsh-mcp-manager/install.mjs                       # 默认 ~/.dsh + web
node dsh-mcp-manager/install.mjs --dsh-home /path/.dsh --profile web
node dsh-mcp-manager/install.mjs --repair --port 3080  # 修复模式
```

### 参数说明

| 参数 | 说明 | 默认值 |
|---|---|---|
| `--dsh-home` / `-DshHome` | DSH 主目录（含 `profiles`、`settings.yaml` 的目录） | `$DSH_HOME` 环境变量，否则 `~/.dsh` |
| `--profile` / `-Profile` | 要安装到的 profile 名 | `web` |
| `--port` / `-Port` | 修复模式下探测 API 的端口（= DSH Web 端口） | `3080` |
| `--repair` / `-Repair` | 修复模式：重新部署 + 递增 loader 行 `config.version` 触发 HMR 重应用 + 轮询 API 直到恢复 | 无 |
| `--skip-patch` | 只复制包、不修改补丁文件 | 无 |

### 安装后验证

1. **重启 DSH**（宿主插件与客户端模块在启动时加载；`mcp_manager_*` 4 个工具也在重启后注册）。
2. 打开 **设置 → MCP 管理**，应能看到页面并管理现有 MCP 服务（如 stepfun）。

> 如果页面在安装前就已打开，先刷新浏览器（启动载荷在页面加载时构建）；仍不出现则重启 DSH。

## 卸载

```powershell
# Windows
.\dsh-mcp-manager\uninstall.ps1 [-DshHome <路径>] [-Profile <名>]

# macOS / Linux
./dsh-mcp-manager/uninstall.sh [--dsh-home <路径>] [--profile <名>]

# 任何平台
node dsh-mcp-manager/uninstall.mjs [--dsh-home <路径>] [--profile <名>]
```

然后重启 DSH。卸载会删除部署副本、`local-packages` 真源目录，并清理补丁里的 loader 行（补丁保持合法的顶层数组）。

## DSH 升级后：--repair

DSH 升级（或 HMR 状态异常）后若发现 **设置里没有"MCP 管理"** 或 **`mcp_manager_*` 工具消失**，运行一次修复命令即可：重新复制包、把 loader 行的 `config.version` 加一（触发 HMR 重新应用）、然后轮询 API 直到 `POST /dsh-mcp-manager/api` 返回 `{ok:true}`（默认等 30 秒）。

```bash
node dsh-mcp-manager/install.mjs --repair --port 3080
```

> 如果 30 秒后 API 仍未恢复，重启一次 DSH——loader 在启动时会重新导入最新代码。

## API 参考

所有操作均为 `POST /dsh-mcp-manager/api`，请求体 `{"op": "<op>", "args": {...}}`，同源。

| op | args | 结果 |
|---|---|---|
| `mcpm-list` | `{}` | `{ok, rows[], paths, errors[]}` |
| `mcpm-add` | `{serverName, transport, url\|command, args?, headers?, env?, level, enabled?}` | `{ok, row}` |
| `mcpm-edit` | `{id, level, ...fields}` | `{ok}` |
| `mcpm-set-enabled` | `{id, level, enabled}` | `{ok}` |
| `mcpm-restart` | `{id, level}` | `{ok}` |
| `mcpm-remove` | `{id, level}` | `{ok}` |
| `mcpm-export` | `{}` | `{ok, json, savedTo}` |
| `mcpm-import` | `{json}` | `{ok, added[], skipped[]}` |

## 模型工具

宿主上用 `ctx.tools.register(defineTool(...))` 注册（标准 `@deepseek-ai/dsh-tools`）：

| 工具 | 说明 |
|---|---|
| `mcp_manager_list` | 列出所有已配置的 MCP 服务（级别、启用状态、loader 实时状态、工具数） |
| `mcp_manager_set_enabled` | 启用 / 禁用某个服务（id, level, enabled） |
| `mcp_manager_restart` | 重启某个服务（id, level） |
| `mcp_manager_add` | 新增服务（serverName, transport, url\|command, …, level） |

## 注意事项 / 限制

- HTTP 路由在本机 Web 服务上**无鉴权**——仅适合本机单人使用，不要把 DSH 的 Web 端口暴露到公网。
- 托管行带 `# dsh-mcp-manager:server:<id>` 标记；loader 行是 `insert` 块添加的 `id: mcp-manager, name: dsh-mcp-manager`（普通 `- id:` 行在 DSH patch 方言里只是覆盖，不能新增条目）。
- 如果打开中的页面先于安装存在，需要刷新页面或重启 DSH（启动图在页面加载时构建）。

## 许可

[MIT](LICENSE)
