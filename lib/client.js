// dsh-mcp-manager — browser half for DeepSeek Harness 0.2.x.
//
// Registers two Settings sections. The module id equals the package name so
// `dsh-client-modules` attaches this browser half to the loader row that names
// the package. Visible text goes through the Client locale service; styles use
// the shared `--dsw-alias-*` theme tokens so light/dark and host redesigns keep
// working.
//
// The page talks to the host half through the same-origin HTTP route
// /dsh-mcp-manager/api; it never touches the filesystem directly.

window.__ModuleLoader__.load({
  id: '@xxxyz/dsh-mcp-manager',
  factory(require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useRef, useState } = React

    const NS = 'dsh.mcpManager'

    const zh = {
      mcpNav: 'MCP 服务',
      mcpTitle: 'MCP 服务管理',
      mcpSubtitle: '管理当前 profile 的 @deepseek-ai/dsh-mcp-client 服务：新增、编辑、启停、重启，并查看已注册工具。全局 home 层的行只读展示。',
      searchServers: '搜索服务名称、id 或地址…',
      addServer: '新增服务',
      refresh: '刷新',
      paths: '补丁文件',
      profilePath: '当前 profile',
      homePath: '全局 home（只读）',
      backup: '备份与恢复',
      exportConfig: '导出配置',
      importConfig: '导入配置',
      exportHint: '导出当前 profile 的 MCP 服务为 JSON；全局 home 层只读，不参与导出。导入只新增，已存在的名称或 id 会跳过。',
      importJson: '粘贴导出的 JSON（数组或 { rows: [...] }）',
      runImport: '执行导入',
      copy: '复制',
      copied: '已复制',
      close: '关闭',
      cancel: '取消',
      save: '保存',
      add: '添加',
      edit: '编辑',
      delete: '删除',
      restart: '重启',
      enabled: '已启用',
      disabled: '已禁用',
      readOnly: '只读',
      levelProfile: '当前 profile',
      levelHome: '全局 home（只读）',
      levelLoader: '其他层（只读）',
      readOnlyHome: '该服务来自全局 home 层，只能查看；请在当前 profile 新增一份以编辑。',
      readOnlyOverridden: '该行被全局 home 层覆盖，修改不会生效；请在 home 层处理。',
      readOnlyOther: '该服务由其他 bundle 或层级提供，无法在这里修改。',
      liveOn: '已加载',
      liveOff: '未加载',
      liveFailed: '加载失败',
      liveActive: '运行中',
      tools: '工具',
      transport: '传输',
      serverName: '服务名称 serverName',
      url: '服务 URL',
      command: '启动命令',
      args: '参数（每行一个）',
      env: '环境变量（每行 key=value）',
      headers: '请求头（每行 key=value）',
      cwd: '工作目录（可选）',
      advanced: '高级选项',
      toolCallTimeout: '单次工具调用超时（毫秒，默认 60000）',
      failOnStartup: '初次连接失败时拒绝加载',
      maxInstructionBytes: '服务说明最大字节数（默认 32768）',
      reconnect: '自动重连',
      reconnectEnabled: '连接断开后自动重连',
      reconnectInitial: '首次重连延迟（毫秒，默认 500）',
      reconnectMaxDelay: '重连延迟上限（毫秒，默认 30000）',
      reconnectMaxAttempts: '连续失败次数上限（默认 10）',
      confirmDeleteTitle: '删除 MCP 服务',
      confirmDeleteBody: '删除后该服务的配置会从补丁文件中移除，相关工具立即下线。此操作不可撤销。',
      confirmDelete: '确认删除',
      toolPreviewTitle: '工具预览',
      toolPreviewEmpty: '该服务暂无已注册工具',
      noParams: '无参数',
      formAddTitle: '新增 MCP 服务',
      formEditTitle: '编辑 MCP 服务',
      noServers: '暂无 MCP 服务',
      noServersHint: '点击“新增服务”添加第一个 MCP 服务器。',
      noMatches: '没有匹配的服务',
      loading: '加载中…',
      loadFailed: '加载失败',
      operationFailed: '操作失败',
      operationOk: '操作成功',
      importDone: '导入完成',
      token: '访问令牌（可选）',
      tokenHint: '仅在宿主配置了 config.token 或 DSH_MCP_MANAGER_TOKEN 时需要；保存在本机浏览器。',
      tokenPlaceholder: '留空表示不鉴权',
      version: '版本',
      serverNameHint: '1–32 位字母、数字、下划线或短横线',
      restarting: '重启中…',
      failedHint: '请检查地址、命令、凭证与网络，然后重试。',
      zeroToolsHint: '已连接但未注册任何工具。',
      skillNav: 'Skills',
      skillTitle: 'Skills 管理',
      skillSubtitle: '查看并按来源分组管理 DSH 技能。禁用对当前与后续会话立即生效，状态保存在当前 profile。',
      searchSkills: '搜索技能名称、描述或来源…',
      skillGroupProject: '项目根',
      skillGroupRuntime: '运行时',
      skillGroupCustom: '扩展根',
      skillGroupUser: '用户根',
      skillGroupBundled: '预置根',
      skillGroupPlugin: '插件提供',
      skillEnabled: '可用',
      skillDisabled: '已禁用',
      skillSource: '来源',
      skillProvider: '提供方',
      skillUser: '用户技能',
      noSkills: '暂无技能',
      noSkillMatches: '没有匹配的技能',
      skillToggleFailed: '切换技能状态失败',
      skillAgents: '当前活动会话',
      skillDisableHint: '禁用会同时作用于全局与各活动会话的作用域。',
      unavailable: '暂不可用',
      errorPrefix: '错误',
    }

    const en = {
      mcpNav: 'MCP servers',
      mcpTitle: 'MCP server management',
      mcpSubtitle: 'Manage @deepseek-ai/dsh-mcp-client entries in the current profile: add, edit, enable, restart, and inspect registered tools. Rows from the global home layer are shown read-only.',
      searchServers: 'Search server name, id, or address…',
      addServer: 'Add server',
      refresh: 'Refresh',
      paths: 'Patch files',
      profilePath: 'Current profile',
      homePath: 'Global home (read-only)',
      backup: 'Backup and restore',
      exportConfig: 'Export',
      importConfig: 'Import',
      exportHint: 'Exports the current profile’s MCP servers as JSON. The global home layer is read-only and not exported. Import only adds entries; an existing name or id is skipped.',
      importJson: 'Paste exported JSON (an array or { rows: [...] })',
      runImport: 'Import',
      copy: 'Copy',
      copied: 'Copied',
      close: 'Close',
      cancel: 'Cancel',
      save: 'Save',
      add: 'Add',
      edit: 'Edit',
      delete: 'Delete',
      restart: 'Restart',
      enabled: 'Enabled',
      disabled: 'Disabled',
      readOnly: 'Read-only',
      levelProfile: 'Current profile',
      levelHome: 'Global home (read-only)',
      levelLoader: 'Other layer (read-only)',
      readOnlyHome: 'This server comes from the global home layer and is view-only. Add a copy in the current profile to edit it.',
      readOnlyOverridden: 'This row is overridden by the global home layer; changes here would not take effect.',
      readOnlyOther: 'This server comes from another bundle or layer and cannot be changed here.',
      liveOn: 'Loaded',
      liveOff: 'Not loaded',
      liveFailed: 'Load failed',
      liveActive: 'Active',
      tools: 'Tools',
      transport: 'Transport',
      serverName: 'Server name',
      url: 'Server URL',
      command: 'Command',
      args: 'Arguments (one per line)',
      env: 'Environment (key=value per line)',
      headers: 'Headers (key=value per line)',
      cwd: 'Working directory (optional)',
      advanced: 'Advanced',
      toolCallTimeout: 'Per-call timeout (ms, default 60000)',
      failOnStartup: 'Reject activation when the initial connection fails',
      maxInstructionBytes: 'Maximum instruction bytes (default 32768)',
      reconnect: 'Reconnection',
      reconnectEnabled: 'Reconnect after the connection drops',
      reconnectInitial: 'First reconnect delay (ms, default 500)',
      reconnectMaxDelay: 'Reconnect delay ceiling (ms, default 30000)',
      reconnectMaxAttempts: 'Consecutive failure limit (default 10)',
      confirmDeleteTitle: 'Delete MCP server',
      confirmDeleteBody: 'Its configuration is removed from the patch file and its tools go offline immediately. This cannot be undone.',
      confirmDelete: 'Delete',
      toolPreviewTitle: 'Tool preview',
      toolPreviewEmpty: 'This server has no registered tools',
      noParams: 'No parameters',
      formAddTitle: 'Add MCP server',
      formEditTitle: 'Edit MCP server',
      noServers: 'No MCP servers',
      noServersHint: 'Select “Add server” to add the first MCP server.',
      noMatches: 'No matching servers',
      loading: 'Loading…',
      loadFailed: 'Failed to load',
      operationFailed: 'Operation failed',
      operationOk: 'Done',
      importDone: 'Import finished',
      token: 'Access token (optional)',
      tokenHint: 'Needed only when the host sets config.token or DSH_MCP_MANAGER_TOKEN; stored in this browser.',
      tokenPlaceholder: 'Leave blank for no auth',
      version: 'Version',
      serverNameHint: '1–32 letters, digits, underscores, or hyphens',
      restarting: 'Restarting…',
      failedHint: 'Check the address, command, credentials, and network, then retry.',
      zeroToolsHint: 'Connected but no tools are registered.',
      skillNav: 'Skills',
      skillTitle: 'Skill management',
      skillSubtitle: 'Browse skills grouped by source and disable them. Changes apply to current and future sessions; state lives in the current profile.',
      searchSkills: 'Search skill name, description, or source…',
      skillGroupProject: 'Project root',
      skillGroupRuntime: 'Runtime',
      skillGroupCustom: 'Custom root',
      skillGroupUser: 'User root',
      skillGroupBundled: 'Bundled root',
      skillGroupPlugin: 'Plugin-provided',
      skillEnabled: 'Available',
      skillDisabled: 'Disabled',
      skillSource: 'Source',
      skillProvider: 'Provider',
      skillUser: 'User skill',
      noSkills: 'No skills',
      noSkillMatches: 'No matching skills',
      skillToggleFailed: 'Failed to change the skill state',
      skillAgents: 'Active sessions',
      skillDisableHint: 'Disabling applies to the global registry and every active session scope.',
      unavailable: 'Unavailable',
      errorPrefix: 'Error',
    }

    // ---------------------------------------------------------------------
    // Styles — shared theme tokens only; literal colors appear only as
    // fallbacks for a host that does not define a token.
    // ---------------------------------------------------------------------
    const CSS = [
      '.mcpm-page{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;color:var(--dsw-alias-label-primary,inherit);font-size:13px;line-height:20px}',
      '.mcpm-head{display:flex;flex-direction:column;gap:4px}',
      '.mcpm-title{margin:0;font-size:16px;line-height:24px;font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.mcpm-sub{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280));font-size:13px;line-height:20px;margin:0}',
      '.mcpm-version{font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280));position:relative;top:1px}',
      '.mcpm-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.mcpm-search{position:relative;flex:1 1 220px;min-width:180px;display:flex;align-items:center}',
      '.mcpm-search>svg{position:absolute;left:11px;pointer-events:none;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280))}',
      '.mcpm-search input{width:100%;height:36px;box-sizing:border-box;padding:0 12px 0 34px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-layer-1,transparent);border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,rgba(128,128,128,.4)));border-radius:var(--dsw-radius-md,8px);outline:none}',
      '.mcpm-search input::placeholder{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280))}',
      '.mcpm-search input:focus-visible{border-color:var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4d8dff));box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4d8dff)) 18%,transparent)}',
      '.mcpm-btn{font:inherit;font-size:12px;line-height:18px;height:30px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;cursor:pointer;color:var(--dsw-alias-label-primary,inherit);background:transparent;border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,rgba(128,128,128,.45)));border-radius:var(--dsw-radius-sm,6px)}',
      '.mcpm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,rgba(128,128,128,.1)))}',
      '.mcpm-btn:disabled{opacity:.5;cursor:default}',
      '.mcpm-btn.primary{color:var(--dsw-alias-label-on-brand,#fff);background:var(--dsw-alias-brand-primary,#2350c7);border-color:transparent}',
      '.mcpm-btn.primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2350c7) 88%,var(--dsw-alias-label-primary,#000))}',
      '.mcpm-btn.danger{color:var(--dsw-alias-state-error-primary,#d33);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d33) 55%,transparent)}',
      '.mcpm-btn.ghost{border-color:transparent}',
      '.mcpm-icon-btn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,inherit);font-size:18px;line-height:1;cursor:pointer}',
      '.mcpm-icon-btn:hover{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,rgba(128,128,128,.12)))}',
      '.mcpm-banner{padding:8px 10px;border-radius:var(--dsw-radius-md,8px);font-size:12px;line-height:18px;border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,rgba(128,128,128,.4)));background:var(--dsw-alias-bg-layer-1,transparent);word-break:break-word}',
      '.mcpm-banner.ok{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2ea043) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2ea043) 12%,transparent)}',
      '.mcpm-banner.err{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d33) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d33) 12%,transparent)}',
      '.mcpm-banner.info{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#2350c7) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2350c7) 10%,transparent)}',
      '.mcpm-paths{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280))}',
      '.mcpm-paths summary{cursor:pointer;color:var(--dsw-alias-label-secondary,inherit);font-size:12px}',
      '.mcpm-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;word-break:break-all}',
      '.mcpm-group{display:flex;flex-direction:column;gap:8px}',
      '.mcpm-group-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,inherit);padding-bottom:4px;border-bottom:.5px solid var(--dsw-alias-border-l1,var(--dsw-alias-border-l2,rgba(128,128,128,.25)))}',
      '.mcpm-list{display:flex;flex-direction:column;gap:10px}',
      '.mcpm-card{border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1,var(--dsw-alias-border-l2,rgba(128,128,128,.35))));border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1,transparent));padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0}',
      '.mcpm-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}',
      '.mcpm-name{font-weight:600;font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
      '.mcpm-skill-name{font-weight:400}',
      '.mcpm-chip{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,rgba(128,128,128,.4)));font-size:11px;line-height:18px;white-space:nowrap;color:var(--dsw-alias-label-secondary,inherit);background:transparent}',
      '.mcpm-chip.on{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2ea043) 55%,transparent);color:var(--dsw-alias-state-success-primary,#2ea043);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2ea043) 12%,transparent)}',
      '.mcpm-chip.off{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280));background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08)))}',
      '.mcpm-chip.live{color:var(--dsw-alias-brand-primary,#2350c7);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#2350c7) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2350c7) 10%,transparent)}',
      '.mcpm-chip.warn{color:var(--dsw-alias-state-warn-primary,#a16207);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#a16207) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#a16207) 12%,transparent)}',
      '.mcpm-chip.bad{color:var(--dsw-alias-state-error-primary,#d33);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d33) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d33) 12%,transparent)}',
      '.mcpm-detail{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280));word-break:break-all}',
      '.mcpm-warn{font-size:11px;line-height:17px;color:var(--dsw-alias-state-warn-primary,#a16207)}',
      '.mcpm-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
      '.mcpm-empty{border:.5px dashed var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,rgba(128,128,128,.4)));border-radius:var(--dsw-radius-xl,12px);padding:22px 16px;text-align:center;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280));font-size:12px;line-height:19px}',
      '.mcpm-empty strong{display:block;color:var(--dsw-alias-label-primary,inherit);font-size:13px;margin-bottom:2px}',
      '.mcpm-switch{position:relative;flex:none;width:36px;height:20px;padding:0;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,rgba(128,128,128,.5)));background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,rgba(128,128,128,.2)));cursor:pointer;transition:background .15s ease,border-color .15s ease}',
      '.mcpm-switch .mcpm-switch-thumb{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-bg-base,#fff);box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary,#000) 25%,transparent);transition:transform .15s ease}',
      '.mcpm-switch.on{background:var(--dsw-alias-brand-primary,#2350c7);border-color:transparent}',
      '.mcpm-switch.on .mcpm-switch-thumb{transform:translateX(16px)}',
      '.mcpm-switch:disabled{opacity:.5;cursor:default}',
      '.mcpm-dialog-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--dsw-alias-bg-mask-drop,color-mix(in srgb,var(--dsw-alias-label-primary,#000) 32%,transparent))}',
      '.mcpm-dialog{width:min(560px,calc(100vw - 32px));max-height:min(80vh,760px);display:flex;flex-direction:column;min-width:0;border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,rgba(128,128,128,.4)));border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,inherit);box-shadow:0 18px 48px color-mix(in srgb,var(--dsw-alias-label-primary,#000) 22%,transparent);overflow:hidden}',
      '.mcpm-dialog.wide{width:min(680px,calc(100vw - 32px))}',
      '.mcpm-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1,var(--dsw-alias-border-l2,rgba(128,128,128,.25)))}',
      '.mcpm-dialog-head h3{margin:0;font-size:14px;line-height:21px;font-weight:600}',
      '.mcpm-dialog-body{padding:14px 16px 16px;overflow:auto;display:flex;flex-direction:column;gap:10px;min-height:0}',
      '.mcpm-dialog-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding-top:2px}',
      '.mcpm-field{display:flex;flex-direction:column;gap:4px;font-size:12px;line-height:18px;min-width:0}',
      '.mcpm-field>span{color:var(--dsw-alias-label-secondary,inherit)}',
      '.mcpm-field input,.mcpm-field select,.mcpm-field textarea{font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-layer-1,transparent);border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,rgba(128,128,128,.45)));border-radius:var(--dsw-radius-sm,6px);padding:6px 8px;outline:none;min-width:0}',
      '.mcpm-field textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:17px;min-height:64px;resize:vertical}',
      '.mcpm-textarea{width:100%;box-sizing:border-box;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:17px;min-height:120px;padding:8px;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-layer-1,transparent);border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1,rgba(128,128,128,.45)));border-radius:var(--dsw-radius-sm,6px);outline:none;resize:vertical}',
      '.mcpm-field input:focus-visible,.mcpm-field select:focus-visible,.mcpm-field textarea:focus-visible{border-color:var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4d8dff));box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4d8dff)) 18%,transparent)}',
      '.mcpm-field-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280))}',
      '.mcpm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}',
      '.mcpm-grid .full{grid-column:1/-1}',
      '.mcpm-check{display:flex;align-items:center;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit)}',
      '.mcpm-check input{accent-color:var(--dsw-alias-brand-primary,#2350c7)}',
      '.mcpm-details{border:.5px solid var(--dsw-alias-border-l1,var(--dsw-alias-border-l2,rgba(128,128,128,.3)));border-radius:var(--dsw-radius-md,8px);padding:8px 10px}',
      '.mcpm-details summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary,inherit);user-select:none}',
      '.mcpm-details[open] summary{margin-bottom:8px}',
      '.mcpm-token{max-width:420px}',
      '.mcpm-tool-list{display:flex;flex-direction:column;gap:8px}',
      '.mcpm-tool{border:.5px solid var(--dsw-alias-border-l1,var(--dsw-alias-border-l2,rgba(128,128,128,.3)));border-radius:var(--dsw-radius-md,8px);padding:8px 10px;display:flex;flex-direction:column;gap:3px}',
      '.mcpm-tool-name{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:600;word-break:break-all}',
      '.mcpm-param{display:flex;gap:8px;font-size:11px;line-height:17px;align-items:baseline;color:var(--dsw-alias-label-secondary,inherit)}',
      '.mcpm-param-key{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:600;min-width:84px;word-break:break-all}',
      '.mcpm-param-type{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280));min-width:56px}',
      '.mcpm-provider-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;user-select:none;padding:2px 0}',
      '.mcpm-note{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#6b7280))}',
      '@media (max-width:640px){.mcpm-grid{grid-template-columns:minmax(0,1fr)}.mcpm-page{max-width:none}}',
    ].join('')

    const CSS_ID = 'dsh-mcp-manager'
    function ensureCss() {
      if (typeof document === 'undefined') return
      // HMR can re-run apply without a page reload. Replace the previous tag so
      // style changes (and removed rules) take effect instead of being ignored.
      for (const old of document.querySelectorAll('style[data-plugin="' + CSS_ID + '"]')) old.remove()
      const tag = document.createElement('style')
      tag.dataset.plugin = CSS_ID
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ---------------------------------------------------------------------
    // Host API
    // ---------------------------------------------------------------------
    const TOKEN_KEY = 'dsh-mcp-manager-token'
    let token = ''
    try {
      token = window.localStorage.getItem(TOKEN_KEY) || ''
    } catch {
      /* storage unavailable */
    }
    function getToken() {
      return token
    }
    function setToken(value) {
      token = String(value || '').trim()
      try {
        if (token) window.localStorage.setItem(TOKEN_KEY, token)
        else window.localStorage.removeItem(TOKEN_KEY)
      } catch {
        /* ignore */
      }
    }

    function api(op, args) {
      const headers = { 'content-type': 'application/json', 'x-dsh-plugin': 'dsh-mcp-manager' }
      if (token) headers['x-dsh-token'] = token
      return fetch('/dsh-mcp-manager/api', {
        method: 'POST',
        headers,
        body: JSON.stringify({ op, args: args || {} }),
      })
        .then((response) => response.json())
        .catch((error) => ({ ok: false, error: String((error && error.message) || error) }))
    }

    // ---------------------------------------------------------------------
    // Small UI primitives (plain markup + theme tokens, no Harness imports)
    // ---------------------------------------------------------------------
    function IconSearch() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('circle', { cx: 7, cy: 7, r: 5, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M10.7 10.7 14 14', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }))
    }

    function Button(props) {
      const { variant, children, ...rest } = props
      return h('button', { type: 'button', className: 'mcpm-btn' + (variant ? ' ' + variant : ''), ...rest }, children)
    }

    function Switch(props) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': props.checked ? 'true' : 'false',
        'aria-label': props.label || '',
        title: props.title || props.label || '',
        className: 'mcpm-switch' + (props.checked ? ' on' : ''),
        disabled: !!props.disabled,
        onClick: () => props.onChange(!props.checked),
      }, h('span', { className: 'mcpm-switch-thumb' }))
    }

    function SearchInput(props) {
      return h('div', { className: 'mcpm-search' },
        h(IconSearch, null),
        h('input', {
          type: 'search',
          value: props.value,
          placeholder: props.placeholder,
          'aria-label': props.placeholder,
          onChange: (event) => props.onChange(event.target.value),
        }))
    }

    function Field(props) {
      return h('label', { className: 'mcpm-field' + (props.full ? ' full' : '') },
        h('span', null, props.label),
        props.children,
        props.hint ? h('span', { className: 'mcpm-field-hint' }, props.hint) : null)
    }

    function Modal(props) {
      const ref = useRef(null)
      const closeRef = useRef(props.onClose)
      closeRef.current = props.onClose
      useEffect(() => {
        const previous = typeof document !== 'undefined' ? document.activeElement : null
        const node = ref.current
        if (node) {
          const body = node.querySelector('.mcpm-dialog-body')
          const focusable = (body && body.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])'))
            || node.querySelector('button:not([disabled])')
          if (focusable && focusable.focus) focusable.focus()
        }
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            closeRef.current()
          }
        }
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('keydown', onKey, true)
          if (previous && previous.focus) previous.focus()
        }
      }, [])
      return h('div', {
        className: 'mcpm-dialog-backdrop',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) closeRef.current()
        },
      }, h('div', {
        ref,
        className: 'mcpm-dialog' + (props.wide ? ' wide' : ''),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': props.title,
      },
      h('div', { className: 'mcpm-dialog-head' },
        h('h3', null, props.title),
        h('button', { type: 'button', className: 'mcpm-icon-btn', 'aria-label': props.closeLabel || 'Close', onClick: props.onClose }, '×')),
      h('div', { className: 'mcpm-dialog-body' }, props.children)))
    }

    function Empty(props) {
      return h('div', { className: 'mcpm-empty' },
        h('strong', null, props.title),
        props.hint ? h('span', null, props.hint) : null)
    }

    function usePoll(ctx, fn, delay, enabled = true) {
      const ref = useRef(fn)
      ref.current = fn
      useEffect(() => {
        if (!enabled) return undefined
        return ctx.interval(() => {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          ref.current()
        }, delay)
      }, [ctx, delay, enabled])
    }

    function VersionBadge() {
      const [version, setVersion] = useState('')
      useEffect(() => {
        let alive = true
        api('plugin-version', {}).then((result) => {
          if (alive && result && result.ok) setVersion(result.version)
        })
        return () => {
          alive = false
        }
      }, [])
      return version ? h('span', { className: 'mcpm-version' }, 'v' + version) : null
    }

    function TokenField(props) {
      const [value, setValue] = useState(getToken())
      return h('label', { className: 'mcpm-field mcpm-token' },
        h('span', null, props.t('token')),
        h('input', {
          type: 'password',
          value,
          placeholder: props.t('tokenPlaceholder'),
          autoComplete: 'off',
          onChange: (event) => {
            setValue(event.target.value)
            setToken(event.target.value)
          },
        }),
        h('span', { className: 'mcpm-field-hint' }, props.t('tokenHint')))
    }

    function LevelChip(props) {
      if (props.level === 'home') return h('span', { className: 'mcpm-chip off' }, props.t('levelHome'))
      if (props.level === 'loader') return h('span', { className: 'mcpm-chip off' }, props.t('levelLoader'))
      return null
    }

    function LiveChip(props) {
      const live = props.live
      if (!live) return null
      if (live.phase === 'failed') return h('span', { className: 'mcpm-chip bad' }, props.t('liveFailed'))
      if (!live.enabled) return h('span', { className: 'mcpm-chip live' }, props.t('liveOff'))
      if (live.phase && live.phase !== 'active') return h('span', { className: 'mcpm-chip live' }, live.phase)
      return h('span', { className: 'mcpm-chip on' }, props.t('liveActive'))
    }

    // ---------------------------------------------------------------------
    // MCP page
    // ---------------------------------------------------------------------
    function emptyForm() {
      return {
        serverName: '',
        transport: 'streamable-http',
        url: '',
        command: '',
        args: '',
        env: '',
        headers: '',
        cwd: '',
        toolCallTimeoutMs: '',
        failOnStartupError: false,
        maxInstructionBytes: '',
        reconnectEnabled: true,
        reconnectInitialDelayMs: '',
        reconnectMaxDelayMs: '',
        reconnectMaxAttempts: '',
      }
    }

    function kvLines(value) {
      if (!value) return ''
      return Object.keys(value).map((key) => key + '=' + value[key]).join('\n')
    }

    function maskKv(value) {
      if (!value) return ''
      return Object.keys(value).map((key) => key + ': ****').join('  ')
    }

    function formFromRow(row) {
      const reconnect = row.reconnect || {}
      return {
        serverName: row.serverName || '',
        transport: row.transport === 'stdio' ? 'stdio' : 'streamable-http',
        url: row.url || '',
        command: row.command || '',
        args: (row.args || []).join('\n'),
        env: kvLines(row.env),
        headers: kvLines(row.headers),
        cwd: row.cwd || '',
        toolCallTimeoutMs: row.toolCallTimeoutMs ? String(row.toolCallTimeoutMs) : '',
        failOnStartupError: row.failOnStartupError === true,
        maxInstructionBytes: row.maxInstructionBytes ? String(row.maxInstructionBytes) : '',
        reconnectEnabled: reconnect.enabled !== false,
        reconnectInitialDelayMs: reconnect.initialDelayMs ? String(reconnect.initialDelayMs) : '',
        reconnectMaxDelayMs: reconnect.maxDelayMs ? String(reconnect.maxDelayMs) : '',
        reconnectMaxAttempts: reconnect.maxAttempts ? String(reconnect.maxAttempts) : '',
      }
    }

    function payloadFromForm(form, editing) {
      const payload = {
        serverName: form.serverName,
        transport: form.transport,
        url: form.url,
        command: form.command,
        args: form.args,
        env: form.env,
        headers: form.headers,
        cwd: form.cwd,
        failOnStartupError: form.failOnStartupError === true,
      }
      if (form.toolCallTimeoutMs !== '') payload.toolCallTimeoutMs = Number(form.toolCallTimeoutMs)
      if (form.maxInstructionBytes !== '') payload.maxInstructionBytes = Number(form.maxInstructionBytes)
      const reconnect = {}
      if (form.reconnectEnabled === false) reconnect.enabled = false
      if (form.reconnectInitialDelayMs !== '') reconnect.initialDelayMs = Number(form.reconnectInitialDelayMs)
      if (form.reconnectMaxDelayMs !== '') reconnect.maxDelayMs = Number(form.reconnectMaxDelayMs)
      if (form.reconnectMaxAttempts !== '') reconnect.maxAttempts = Number(form.reconnectMaxAttempts)
      if (Object.keys(reconnect).length > 0) payload.reconnect = reconnect
      if (editing) payload.id = editing.id
      return payload
    }

    function ToolPreviewList(props) {
      const { tools, t } = props
      if (!tools || tools.length === 0) return h('div', { className: 'mcpm-sub' }, t('toolPreviewEmpty'))
      return h('div', { className: 'mcpm-tool-list' }, tools.map((tool) => h('div', { className: 'mcpm-tool', key: tool.name },
        h('div', { className: 'mcpm-tool-name' }, tool.name),
        h('div', { className: 'mcpm-sub' }, tool.description || ''),
        (tool.parameters || []).length === 0
          ? h('div', { className: 'mcpm-note' }, t('noParams'))
          : (tool.parameters || []).map((param) => h('div', { className: 'mcpm-param', key: param.key },
              h('span', { className: 'mcpm-param-key' }, param.key + (param.required ? ' *' : '')),
              h('span', { className: 'mcpm-param-type' }, param.type || 'any'),
              h('span', null, param.description || ''))))))
    }

    function McpPage(props) {
      const { ctx, t } = props
      const [state, setState] = useState({ loading: true, error: null, rows: [], paths: null, errors: [] })
      const [query, setQuery] = useState('')
      const [formOpen, setFormOpen] = useState(false)
      const [editing, setEditing] = useState(null)
      const [form, setForm] = useState(emptyForm())
      const [busy, setBusy] = useState('')
      const [notice, setNotice] = useState(null)
      const [confirmRow, setConfirmRow] = useState(null)
      const [toolPreview, setToolPreview] = useState(null)
      const [toolError, setToolError] = useState('')
      const [backup, setBackup] = useState(null)
      const [importText, setImportText] = useState('')

      const refresh = () => {
        api('mcpm-list', {}).then((result) => {
          setState({
            loading: false,
            error: result && result.ok ? null : (result && result.error) || t('loadFailed'),
            rows: (result && result.rows) || [],
            paths: (result && result.paths) || null,
            errors: (result && result.errors) || [],
          })
        })
      }

      useEffect(() => {
        refresh()
      }, [])
      usePoll(ctx, refresh, 4000)
      useEffect(() => {
        if (!notice) return undefined
        return ctx.timeout(() => setNotice(null), 3200)
      }, [notice])

      const run = (op, args, label, onOk) => {
        setBusy(label)
        setNotice(null)
        return api(op, args).then((result) => {
          if (result && result.ok) {
            setNotice({ kind: 'ok', text: result.warning ? result.warning : t('operationOk') })
            refresh()
            if (onOk) onOk()
          } else {
            setNotice({ kind: 'err', text: (result && result.error) || t('operationFailed') })
          }
          return result
        }).finally(() => setBusy(''))
      }

      const rows = useMemo(() => {
        const q = query.trim().toLowerCase()
        return (state.rows || []).filter((row) => {
          if (!q) return true
          return [row.id, row.serverName, row.url, row.command, row.transport, row.level]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        })
      }, [state.rows, query])

      const grouped = useMemo(() => ({
        profile: rows.filter((row) => row.level === 'profile'),
        home: rows.filter((row) => row.level === 'home'),
        loader: rows.filter((row) => row.level === 'loader'),
      }), [rows])

      const openAdd = () => {
        setEditing(null)
        setForm(emptyForm())
        setFormOpen(true)
      }
      const openEdit = (row) => {
        setEditing({ id: row.id })
        setForm(formFromRow(row))
        setFormOpen(true)
      }
      const closeForm = () => {
        setFormOpen(false)
        setEditing(null)
      }
      const setField = (key) => (event) => {
        const value = event && event.target && event.target.type === 'checkbox' ? event.target.checked : event.target.value
        setForm((current) => ({ ...current, [key]: value }))
      }
      const submit = () => {
        const payload = payloadFromForm(form, editing)
        run(editing ? 'mcpm-edit' : 'mcpm-add', payload, 'form', closeForm)
      }
      const toggleRow = (row) => {
        const enabled = row.live ? !row.live.enabled : row.disabled
        run('mcpm-set-enabled', { id: row.id, enabled }, 'toggle:' + row.id)
      }
      const restartRow = (row) => run('mcpm-restart', { id: row.id }, 'restart:' + row.id)
      const deleteRow = () => {
        const row = confirmRow
        setConfirmRow(null)
        if (row) run('mcpm-remove', { id: row.id }, 'remove:' + row.id)
      }
      const preview = (row) => {
        setToolPreview({ serverName: row.serverName, tools: [] })
        setToolError('')
        api('mcpm-tools', { serverName: row.serverName }).then((result) => {
          if (result && result.ok) setToolPreview({ serverName: row.serverName, tools: result.tools || [] })
          else setToolError((result && result.error) || t('operationFailed'))
        })
      }
      const exportConfig = () => {
        api('mcpm-export', {}).then((result) => {
          if (result && result.ok) {
            setBackup({ mode: 'export', json: result.json, savedTo: result.savedTo })
            setNotice({ kind: 'ok', text: t('operationOk') })
          } else setNotice({ kind: 'err', text: (result && result.error) || t('operationFailed') })
        })
      }
      const importConfig = () => {
        run('mcpm-import', { json: importText }, 'import', () => {
          setImportText('')
          setBackup(null)
        })
      }
      const copyExport = () => {
        if (!backup || !backup.json) return
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(backup.json).then(() => setNotice({ kind: 'ok', text: t('copied') }))
        }
      }

      const readOnlyText = (row) => row.readOnlyReason === 'home'
        ? t('readOnlyHome')
        : row.readOnlyReason === 'overridden-by-home'
          ? t('readOnlyOverridden')
          : t('readOnlyOther')

      const rowCard = (row) => {
        const checked = row.live ? row.live.enabled : !row.disabled
        const readOnly = row.readOnly === true
        const target = row.transport === 'stdio'
          ? [row.command, ...(row.args || [])].filter(Boolean).join(' ')
          : row.url || ''
        return h('div', { className: 'mcpm-card', key: row.id + ':' + row.level },
          h('div', { className: 'mcpm-card-head' },
            h(Switch, {
              checked,
              disabled: readOnly || busy !== '',
              label: row.serverName,
              title: readOnly ? readOnlyText(row) : checked ? t('enabled') : t('disabled'),
              onChange: () => toggleRow(row),
            }),
            h('span', { className: 'mcpm-name', title: row.id }, row.serverName),
            h('span', { className: 'mcpm-chip ' + (checked ? 'on' : 'off') }, checked ? t('enabled') : t('disabled')),
            h(LevelChip, { level: row.level, t }),
            row.transport ? h('span', { className: 'mcpm-chip' }, row.transport) : null,
            h(LiveChip, { live: row.live, t }),
            readOnly ? h('span', { className: 'mcpm-chip off', title: readOnlyText(row) }, t('readOnly')) : null,
            h('span', { className: 'mcpm-chip' }, t('tools') + ' · ' + (row.toolCount || 0))),
          h('div', { className: 'mcpm-detail' },
            'id: ' + row.id + (target ? ' · ' + target : '') + (row.cwd ? ' · cwd: ' + row.cwd : '')),
          readOnly ? h('div', { className: 'mcpm-note' }, readOnlyText(row)) : null,
          (row.headers || row.env) ? h('div', { className: 'mcpm-detail' },
            row.headers ? 'headers: ' + maskKv(row.headers) + '  ' : '',
            row.env ? 'env: ' + Object.keys(row.env).map((key) => key + ': ****').join('  ') : '') : null,
          row.live && row.live.phase === 'failed' ? h('div', { className: 'mcpm-warn' }, t('failedHint')) : null,
          row.live && row.live.phase === 'active' && row.toolCount === 0 ? h('div', { className: 'mcpm-warn' }, t('zeroToolsHint')) : null,
          h('div', { className: 'mcpm-row-actions' },
            !readOnly ? h(Button, { onClick: () => openEdit(row), disabled: busy !== '' }, t('edit')) : null,
            !readOnly ? h(Button, { onClick: () => restartRow(row), disabled: busy !== '' }, busy === 'restart:' + row.id ? t('restarting') : t('restart')) : null,
            row.toolCount > 0 ? h(Button, { onClick: () => preview(row) }, t('tools') + ' (' + row.toolCount + ')') : null,
            !readOnly ? h(Button, { variant: 'danger', onClick: () => setConfirmRow(row), disabled: busy !== '' }, t('delete')) : null))
      }

      const toolPreviewBody = !toolPreview
        ? null
        : h(ToolPreviewList, { tools: toolPreview.tools || [], t })

      const group = (key, label, list) => list.length === 0 ? null : h('div', { className: 'mcpm-group', key },
        h('div', { className: 'mcpm-group-title' }, label, h('span', { className: 'mcpm-chip off' }, String(list.length))),
        h('div', { className: 'mcpm-list' }, list.map(rowCard)))

      const showHomePath = !!(state.paths && state.paths.homeExists && (state.rows || []).some((row) => row.level === 'home' || row.readOnlyReason === 'overridden-by-home'))

      return h('div', { className: 'mcpm-page' },
        h('div', { className: 'mcpm-head' },
          h('h2', { className: 'mcpm-title' }, t('mcpTitle'), h(VersionBadge, null)),
          h('p', { className: 'mcpm-sub' }, t('mcpSubtitle'))),
        state.paths ? h('details', { className: 'mcpm-paths' },
          h('summary', null, t('paths')),
          h('div', null, t('profilePath') + (state.paths.profileName ? ' · ' + state.paths.profileName : '') + ': ', h('span', { className: 'mcpm-code' }, state.paths.profile)),
          showHomePath ? h('div', null, t('homePath') + ': ', h('span', { className: 'mcpm-code' }, state.paths.home)) : null) : null,
        h('div', { className: 'mcpm-toolbar' },
          h(SearchInput, { value: query, onChange: setQuery, placeholder: t('searchServers') }),
          h(Button, { onClick: refresh, disabled: busy !== '' }, t('refresh')),
          h(Button, { variant: 'primary', onClick: openAdd }, t('addServer'))),
        notice ? h('div', { className: 'mcpm-banner ' + notice.kind }, notice.text) : null,
        state.error ? h('div', { className: 'mcpm-banner err' }, state.error) : null,
        state.errors && state.errors.length > 0 ? h('div', { className: 'mcpm-banner err' }, state.errors.join('; ')) : null,
        h('details', { className: 'mcpm-details' },
          h('summary', null, t('backup')),
          h('div', { className: 'mcpm-sub', style: { margin: '6px 0 8px' } }, t('exportHint')),
          h('div', { className: 'mcpm-row-actions' },
            h(Button, { onClick: exportConfig }, t('exportConfig')),
            h(Button, { onClick: () => { setBackup({ mode: 'import' }); setImportText('') } }, t('importConfig'))),
          backup && backup.mode === 'export' ? h('div', null,
            backup.savedTo ? h('div', { className: 'mcpm-note' }, backup.savedTo) : null,
            h('textarea', { className: 'mcpm-textarea', style: { marginTop: '8px' }, readOnly: true, value: backup.json }),
            h('div', { className: 'mcpm-row-actions' }, h(Button, { onClick: copyExport }, t('copy')))) : null,
          backup && backup.mode === 'import' ? h('div', null,
            h('textarea', {
              className: 'mcpm-textarea',
              style: { marginTop: '8px' },
              placeholder: t('importJson'),
              value: importText,
              onChange: (event) => setImportText(event.target.value),
            }),
            h('div', { className: 'mcpm-row-actions' },
              h(Button, { variant: 'primary', onClick: importConfig, disabled: !importText.trim() || busy !== '' }, t('runImport')),
              h(Button, { onClick: () => setBackup(null) }, t('cancel')))) : null),
        state.loading
          ? h('div', { className: 'mcpm-sub' }, t('loading'))
          : rows.length === 0
            ? h(Empty, { title: state.rows.length === 0 ? t('noServers') : t('noMatches'), hint: state.rows.length === 0 ? t('noServersHint') : '' })
            : [group('profile', t('levelProfile'), grouped.profile), group('home', t('levelHome'), grouped.home), group('loader', t('levelLoader'), grouped.loader)],
        h('details', { className: 'mcpm-details' },
          h('summary', null, t('token')),
          h('div', { style: { marginTop: '8px' } }, h(TokenField, { t }))),
        formOpen ? h(Modal, { title: editing ? t('formEditTitle') : t('formAddTitle'), closeLabel: t('close'), onClose: closeForm },
          h('div', { className: 'mcpm-grid' },
            h(Field, { label: t('serverName'), hint: t('serverNameHint') },
              h('input', { value: form.serverName, onChange: setField('serverName'), placeholder: 'github' })),
            h(Field, { label: t('transport') },
              h('select', { value: form.transport, onChange: setField('transport') },
                h('option', { value: 'streamable-http' }, 'streamable-http'),
                h('option', { value: 'stdio' }, 'stdio'))),
            form.transport === 'streamable-http'
              ? h(Field, { label: t('url'), full: true }, h('input', { value: form.url, onChange: setField('url'), placeholder: 'https://host/mcp' }))
              : h(Field, { label: t('command'), full: true }, h('input', { value: form.command, onChange: setField('command'), placeholder: 'npx -y @modelcontextprotocol/server-github' })),
            form.transport === 'stdio'
              ? h(Field, { label: t('args'), full: true }, h('textarea', { value: form.args, onChange: setField('args'), placeholder: '-y\n@modelcontextprotocol/server-github' }))
              : null,
            form.transport === 'stdio'
              ? h(Field, { label: t('env'), full: true }, h('textarea', { value: form.env, onChange: setField('env'), placeholder: 'GITHUB_TOKEN=xxx' }))
              : h(Field, { label: t('headers'), full: true }, h('textarea', { value: form.headers, onChange: setField('headers'), placeholder: 'Authorization=Bearer xxx' })),
            form.transport === 'stdio'
              ? h(Field, { label: t('cwd'), full: true }, h('input', { value: form.cwd, onChange: setField('cwd'), placeholder: 'F:\\work\\server' }))
              : null),
          h('details', { className: 'mcpm-details' },
            h('summary', null, t('advanced')),
            h('div', { className: 'mcpm-grid', style: { marginTop: '8px' } },
              h(Field, { label: t('toolCallTimeout') }, h('input', { type: 'number', value: form.toolCallTimeoutMs, onChange: setField('toolCallTimeoutMs'), min: 1 })),
              h(Field, { label: t('maxInstructionBytes') }, h('input', { type: 'number', value: form.maxInstructionBytes, onChange: setField('maxInstructionBytes'), min: 1 })),
              h('label', { className: 'mcpm-check full' },
                h('input', { type: 'checkbox', checked: form.failOnStartupError, onChange: setField('failOnStartupError') }),
                t('failOnStartup')),
              h('div', { className: 'mcpm-sub full' }, t('reconnect')),
              h('label', { className: 'mcpm-check full' },
                h('input', { type: 'checkbox', checked: form.reconnectEnabled, onChange: setField('reconnectEnabled') }),
                t('reconnectEnabled')),
              h(Field, { label: t('reconnectInitial') }, h('input', { type: 'number', value: form.reconnectInitialDelayMs, onChange: setField('reconnectInitialDelayMs'), min: 1 })),
              h(Field, { label: t('reconnectMaxDelay') }, h('input', { type: 'number', value: form.reconnectMaxDelayMs, onChange: setField('reconnectMaxDelayMs'), min: 1 })),
              h(Field, { label: t('reconnectMaxAttempts') }, h('input', { type: 'number', value: form.reconnectMaxAttempts, onChange: setField('reconnectMaxAttempts'), min: 1 })))),
          h('div', { className: 'mcpm-dialog-actions' },
            h(Button, { onClick: closeForm }, t('cancel')),
            h(Button, { variant: 'primary', onClick: submit, disabled: busy === 'form' }, editing ? t('save') : t('add')))) : null,
        confirmRow ? h(Modal, { title: t('confirmDeleteTitle'), closeLabel: t('close'), onClose: () => setConfirmRow(null) },
          h('p', { className: 'mcpm-sub' }, t('confirmDeleteBody')),
          h('div', { className: 'mcpm-code' }, confirmRow.id + ' · ' + confirmRow.serverName),
          h('div', { className: 'mcpm-dialog-actions' },
            h(Button, { onClick: () => setConfirmRow(null) }, t('cancel')),
            h(Button, { variant: 'danger', onClick: deleteRow }, t('confirmDelete')))) : null,
        toolPreview ? h(Modal, { title: t('toolPreviewTitle') + ': ' + toolPreview.serverName, closeLabel: t('close'), onClose: () => setToolPreview(null), wide: true },
          toolError ? h('div', { className: 'mcpm-banner err' }, toolError) : null,
          toolPreviewBody,
          h('div', { className: 'mcpm-dialog-actions' }, h(Button, { onClick: () => setToolPreview(null) }, t('close')))) : null)
    }

    // ---------------------------------------------------------------------
    // Skills page
    // ---------------------------------------------------------------------
    const SKILL_GROUPS = ['project', 'runtime', 'custom', 'user', 'bundled', 'plugin']
    const SKILL_GROUP_KEYS = {
      project: 'skillGroupProject',
      runtime: 'skillGroupRuntime',
      custom: 'skillGroupCustom',
      user: 'skillGroupUser',
      bundled: 'skillGroupBundled',
      plugin: 'skillGroupPlugin',
    }

    function skillGroupOf(skill) {
      if (skill.source === 'project-dsh' || skill.source === 'project-agents') return 'project'
      if (skill.source === 'runtime') return 'runtime'
      if (skill.source === 'user-dsh' || skill.source === 'user-agents') return 'user'
      if (skill.source === 'bundled') return 'bundled'
      if (skill.source === 'custom' && skill.provider === 'filesystem') return 'custom'
      return 'plugin'
    }

    function SkillPage(props) {
      const { ctx, t } = props
      const [state, setState] = useState({ loading: true, error: null, skills: [], agents: 0 })
      const [query, setQuery] = useState('')
      const [busy, setBusy] = useState('')
      const [notice, setNotice] = useState(null)
      const [collapsed, setCollapsed] = useState({})

      const refresh = () => {
        api('skill-list', {}).then((result) => {
          setState({
            loading: false,
            error: result && result.ok ? null : (result && result.error) || t('loadFailed'),
            skills: (result && result.skills) || [],
            agents: (result && result.agents) || 0,
          })
        })
      }

      useEffect(() => {
        refresh()
      }, [])
      usePoll(ctx, refresh, 5000)
      useEffect(() => {
        if (!notice) return undefined
        return ctx.timeout(() => setNotice(null), 3200)
      }, [notice])

      const toggle = (skill) => {
        setBusy(skill.name)
        setNotice(null)
        api('skill-toggle', { name: skill.name, enabled: skill.disabled }).then((result) => {
          if (result && result.ok) {
            setNotice({ kind: 'ok', text: t('operationOk') })
            refresh()
          } else {
            setNotice({ kind: 'err', text: (result && result.error) || t('skillToggleFailed') })
          }
        }).finally(() => setBusy(''))
      }

      const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return (state.skills || []).filter((skill) => {
          if (!q) return true
          return [skill.name, skill.description, skill.provider, skill.source]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        })
      }, [state.skills, query])

      const renderSkill = (skill) => h('div', { className: 'mcpm-card', key: skill.name },
        h('div', { className: 'mcpm-card-head' },
          h(Switch, {
            checked: !skill.disabled,
            disabled: busy !== '',
            label: skill.name,
            title: skill.disabled ? t('skillDisabled') : t('skillEnabled'),
            onChange: () => toggle(skill),
          }),
          h('span', { className: 'mcpm-name mcpm-skill-name', title: skill.name }, skill.name),
          h('span', { className: 'mcpm-chip ' + (skill.disabled ? 'off' : 'on') }, skill.disabled ? t('skillDisabled') : t('skillEnabled')),
          h('span', { className: 'mcpm-chip' }, skill.source || ''),
          skill.userLevel ? h('span', { className: 'mcpm-chip warn' }, t('skillUser')) : null),
        h('div', { className: 'mcpm-sub' }, skill.description || ''),
        h('div', { className: 'mcpm-note' }, t('skillProvider') + ': ' + (skill.provider || '?')))

      const group = (key) => {
        const items = filtered.filter((skill) => skillGroupOf(skill) === key)
        if (items.length === 0) return null
        const providers = Object.create(null)
        for (const skill of items) {
          const provider = skill.provider || 'unknown'
          ;(providers[provider] = providers[provider] || []).push(skill)
        }
        const providerKeys = Object.keys(providers).sort()
        return h('div', { className: 'mcpm-group', key },
          h('div', { className: 'mcpm-group-title' }, t(SKILL_GROUP_KEYS[key]), h('span', { className: 'mcpm-chip off' }, String(items.length))),
          h('div', { className: 'mcpm-list' }, providerKeys.map((provider) => {
            const id = key + ':' + provider
            const isCollapsed = !query && !!collapsed[id]
            return h('div', { key: provider },
              h('div', {
                className: 'mcpm-provider-title',
                onClick: () => setCollapsed((current) => ({ ...current, [id]: !current[id] })),
                title: t('skillProvider') + ': ' + provider,
              }, (isCollapsed ? '▸ ' : '▾ ') + provider + ' (' + providers[provider].length + ')'),
              isCollapsed ? null : h('div', { className: 'mcpm-list' }, providers[provider].map(renderSkill)))
          })))
      }

      return h('div', { className: 'mcpm-page' },
        h('div', { className: 'mcpm-head' },
          h('h2', { className: 'mcpm-title' }, t('skillTitle'), h(VersionBadge, null)),
          h('p', { className: 'mcpm-sub' }, t('skillSubtitle'))),
        h('div', { className: 'mcpm-toolbar' },
          h(SearchInput, { value: query, onChange: setQuery, placeholder: t('searchSkills') }),
          h(Button, { onClick: refresh, disabled: busy !== '' }, t('refresh')),
          state.agents > 0 ? h('span', { className: 'mcpm-note' }, t('skillAgents') + ': ' + state.agents) : null),
        notice ? h('div', { className: 'mcpm-banner ' + notice.kind }, notice.text) : null,
        state.error ? h('div', { className: 'mcpm-banner err' }, state.error) : null,
        h('div', { className: 'mcpm-note' }, t('skillDisableHint')),
        state.loading
          ? h('div', { className: 'mcpm-sub' }, t('loading'))
          : filtered.length === 0
            ? h(Empty, { title: state.skills.length === 0 ? t('noSkills') : t('noSkillMatches') })
            : SKILL_GROUPS.map(group),
        h('details', { className: 'mcpm-details' },
          h('summary', null, t('token')),
          h('div', { style: { marginTop: '8px' } }, h(TokenField, { t }))))
    }

    // ---------------------------------------------------------------------
    // Registration
    // ---------------------------------------------------------------------
    exports.inject = ['slots', 'locale', 'timer']
    exports.apply = function apply(ctx) {
      ensureCss()
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-mcp-manager: dictionaries')

      ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'mcp-manager',
        order: 16,
        label: () => t('mcpNav'),
        locale: NS,
      }, (props) => h(McpPage, { ctx, t: props && props.t ? props.t : t }))), 'dsh-mcp-manager: MCP page')

      ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'skill-manager',
        order: 17,
        label: () => t('skillNav'),
        locale: NS,
      }, (props) => h(SkillPage, { ctx, t: props && props.t ? props.t : t }))), 'dsh-mcp-manager: Skills page')
    }

    return module.exports
  },
})
