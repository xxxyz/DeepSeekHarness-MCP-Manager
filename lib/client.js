// dsh-mcp-manager — durable client half (web bundle, ModuleLoader CJS format).
// Registers the "MCP 管理" settings page. Talks to the host half through the
// exact-path HTTP route /dsh-mcp-manager/api (same origin) instead of the
// dynamic-only host.call channel.
const factory = (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    const CSS =
      '.mcpm-wrap{font-size:13px;line-height:1.6;display:flex;flex-direction:column;gap:14px;padding:4px 2px;color:inherit}' +
      '.mcpm-wrap h2{margin:0;font-size:16px}' +
      '.mcpm-sub{opacity:.75;font-size:12px}' +
      '.mcpm-msg{padding:8px 10px;border-radius:6px;font-size:12px}' +
      '.mcpm-msg.ok{background:rgba(46,160,67,.15);border:1px solid rgba(46,160,67,.4)}' +
      '.mcpm-msg.err{background:rgba(248,81,73,.15);border:1px solid rgba(248,81,73,.4)}' +
      '.mcpm-msg.info{background:rgba(88,166,255,.15);border:1px solid rgba(88,166,255,.5)}' +
      '.mcpm-path{font-family:monospace;font-size:11px;opacity:.7;word-break:break-all}' +
      '.mcpm-btn{font-size:12px;padding:3px 10px;border-radius:5px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;cursor:pointer;white-space:nowrap}' +
      '.mcpm-btn:disabled{opacity:.5;cursor:default}' +
      '.mcpm-btn.primary{border-color:rgba(88,166,255,.7)}' +
      '.mcpm-btn.danger{border-color:rgba(248,81,73,.7)}' +
      '.mcpm-backup{display:flex;flex-direction:column;gap:8px;border:1px dashed rgba(128,128,128,.45);border-radius:8px;padding:10px 12px}' +
      '.mcpm-backup .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '.mcpm-json{width:100%;box-sizing:border-box;font-family:monospace;font-size:11px;min-height:70px;background:transparent;color:inherit;border:1px solid rgba(128,128,128,.4);border-radius:5px;padding:6px;white-space:pre;overflow:auto}' +
      '.mcpm-report{font-family:monospace;font-size:11px;opacity:.85;word-break:break-all}' +
      '.mcpm-warn{font-size:11px;color:rgba(248,81,73,.95)}' +
      '.mcpm-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;border:1px solid rgba(128,128,128,.35);border-radius:8px;padding:12px}' +
      '.mcpm-form h3{margin:0;grid-column:1/-1;font-size:13px}' +
      '.mcpm-form label{display:flex;flex-direction:column;gap:3px;font-size:12px}' +
      '.mcpm-form .full{grid-column:1/-1}' +
      '.mcpm-form input,.mcpm-form select,.mcpm-form textarea{font-size:12px;padding:4px 6px;border-radius:5px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit}' +
      '.mcpm-form textarea{font-family:monospace;resize:vertical;min-height:44px}' +
      '.mcpm-row{border:1px solid rgba(128,128,128,.35);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}' +
      '.mcpm-row-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.mcpm-name{font-weight:600}' +
      '.mcpm-chip{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid rgba(128,128,128,.5);white-space:nowrap}' +
      '.mcpm-chip.on{background:rgba(46,160,67,.18);border-color:rgba(46,160,67,.55)}' +
      '.mcpm-chip.off{background:rgba(128,128,128,.15)}' +
      '.mcpm-chip.live{background:rgba(88,166,255,.15);border-color:rgba(88,166,255,.5)}' +
      '.mcpm-chip.bad{background:rgba(248,81,73,.18);border-color:rgba(248,81,73,.6)}' +
      '.mcpm-chip.warn{background:rgba(219,154,4,.18);border-color:rgba(219,154,4,.6)}' +
      '.mcpm-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}' +
      '.mcpm-detail{font-family:monospace;font-size:11px;opacity:.75;word-break:break-all}' +
      '.mcpm-mask{position:fixed;inset:0;background:transparent;display:flex;align-items:center;justify-content:center;z-index:99999}' +
      '.mcpm-dialog{background:color-mix(in srgb, currentColor 8%, transparent);backdrop-filter:blur(14px) saturate(1.2);border:1px solid rgba(128,128,128,.5);border-radius:10px;padding:16px 18px;min-width:300px;max-width:440px;box-shadow:0 10px 34px rgba(0,0,0,.35);color:inherit}' +
      '.mcpm-dialog-title{font-size:14px;font-weight:600;margin-bottom:8px}' +
      '.mcpm-dialog-body{font-size:12px;opacity:.88;line-height:1.7;margin-bottom:16px;word-break:break-all}' +
      '.mcpm-dialog-actions{display:flex;justify-content:flex-end;gap:8px}' +
      '.skm-search{font-size:12px;padding:5px 8px;border-radius:6px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;width:100%;box-sizing:border-box}' +
      '.skm-group-title{font-size:12px;font-weight:600;opacity:.85;margin-top:4px;padding-bottom:2px;border-bottom:1px solid rgba(128,128,128,.25)}' +
      '.skm-provider-title{font-size:12px;font-weight:600;cursor:pointer;user-select:none;margin-top:4px;opacity:.9}' +
      '.mcpm-version{margin-left:8px;font-size:11px;font-weight:500;opacity:.55;letter-spacing:.3px;vertical-align:middle}' +
      '.mcpm-token{display:flex;align-items:center;gap:8px;font-size:12px;opacity:.85}' +
      '.mcpm-token input{font-size:12px;padding:3px 6px;border-radius:5px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;flex:1;max-width:260px}'

    function ensureCss() {
      if (typeof document === 'undefined') return
      const id = 'dsh-mcp-manager'
      if (document.querySelector('style[data-plugin-css="' + id + '"]')) return
      const tag = document.createElement('style')
      tag.dataset.plugin = id
      tag.dataset.pluginCss = id
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // Optional access token for write ops (host config.token or
    // DSH_MCP_MANAGER_TOKEN). Kept in localStorage so the user enters it once;
    // sent as `x-dsh-token` on every request (host ignores it when unset).
    let TOKEN = ''
    try { TOKEN = window.localStorage.getItem('dsh-mcp-manager-token') || '' } catch (e) { /* storage unavailable */ }
    function getToken() { return TOKEN }
    function setToken(v) {
      TOKEN = String(v || '').trim()
      try { if (TOKEN) window.localStorage.setItem('dsh-mcp-manager-token', TOKEN); else window.localStorage.removeItem('dsh-mcp-manager-token') } catch (e) { /* ignore */ }
    }

    function apiCall(op, args) {
      // `x-dsh-plugin` is the cross-site (CSRF) gate header the host half
      // requires on every request; a cross-origin page cannot attach it
      // without a CORS preflight that this route never answers.
      const headers = { 'content-type': 'application/json', 'x-dsh-plugin': 'dsh-mcp-manager' }
      if (TOKEN) headers['x-dsh-token'] = TOKEN
      return fetch('/dsh-mcp-manager/api', {
        method: 'POST',
        headers,
        body: JSON.stringify({ op, args: args || {} }),
      }).then((r) => r.json()).catch((e) => ({ ok: false, error: String((e && e.message) || e) }))
    }

    // Small version badge shown next to each settings-page title; reads the
    // package version from the host (plugin-version op) so it always matches
    // the installed release.
    function VersionBadge() {
      const [v, setV] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        apiCall('plugin-version', {}).then((r) => { if (alive && r && r.ok) setV(r.version) }).catch(() => {})
        return () => { alive = false }
      }, [])
      return v ? React.createElement('span', { className: 'mcpm-version' }, 'v' + v) : null
    }

    // Optional access-token row: shown on both settings pages; only needed
    // when the host has token auth enabled (write ops would 401 otherwise).
    function TokenRow() {
      const [val, setVal] = React.useState(getToken())
      return React.createElement('label', { className: 'mcpm-token' },
        '访问令牌（可选，写操作鉴权）',
        React.createElement('input', { value: val, onChange: (e) => { setVal(e.target.value); setToken(e.target.value) }, placeholder: '留空 = 不鉴权' }))
    }

    module.exports = {
      name: 'dsh-mcp-manager-client',
      inject: ['timer'],
      apply(ctx) {
        ensureCss()
        const slots = ctx.get('slots')
        if (slots === undefined) return

        const LEVEL_LABEL = { project: '项目级', global: '全局', loader: '已加载(loader)' }
        const emptyForm = () => ({ serverName: '', transport: 'streamable-http', url: '', command: '', args: '', headers: '', env: '', level: 'project' })
        const kvToLines = (obj) => (obj ? Object.keys(obj).map((k) => k + '=' + obj[k]).join('\n') : '')

        function MCPPage() {
          const [state, setState] = React.useState({ loading: true, error: null, rows: [], paths: null, errors: [] })
          const [formOpen, setFormOpen] = React.useState(false)
          const [editing, setEditing] = React.useState(null)
          const [busy, setBusy] = React.useState(null)
          const [msg, setMsg] = React.useState(null)
          const [form, setForm] = React.useState(emptyForm())
          const [restartInfo, setRestartInfo] = React.useState(null)
          const [tick, setTick] = React.useState(0)
          const [backup, setBackup] = React.useState(null)
          const [importText, setImportText] = React.useState('')
          const [confirmRow, setConfirmRow] = React.useState(null)

          const refresh = () => {
            apiCall('mcpm-list', {}).then((res) => {
              setState({ loading: false, error: res && res.ok ? null : ((res && res.error) || '加载失败'), rows: (res && res.rows) || [], paths: (res && res.paths) || null, errors: (res && res.errors) || [] })
            }).catch((e) => setState({ loading: false, error: String((e && e.message) || e), rows: [], paths: null, errors: [] }))
          }

          React.useEffect(() => { refresh() }, [])
          React.useEffect(() => ctx.interval(() => setTick((t) => t + 1), 1000), [])
          React.useEffect(() => ctx.interval(() => refresh(), 3000), [])
          React.useEffect(() => {
            if (!msg) return
            const d = ctx.timeout(() => setMsg(null), 3000)
            return d
          }, [msg])

          const run = (method, args, label, onOk) => {
            setMsg(null)
            setBusy(label)
            apiCall(method, args).then((res) => {
              if (res && res.ok) { setMsg({ kind: 'ok', text: '操作成功' }); refresh(); if (onOk) onOk() }
              else setMsg({ kind: 'err', text: (res && res.error) || '操作失败' })
            }).catch((e) => setMsg({ kind: 'err', text: String((e && e.message) || e) })).then(() => { setBusy(null); setRestartInfo(null) })
          }

          const doExport = () => {
            setMsg(null)
            apiCall('mcpm-export', {}).then((res) => {
              if (res && res.ok) { setBackup({ mode: 'export', json: res.json, savedTo: res.savedTo }); setMsg({ kind: 'ok', text: '已导出' }) }
              else setMsg({ kind: 'err', text: (res && res.error) || '导出失败' })
            }).catch((e) => setMsg({ kind: 'err', text: String((e && e.message) || e) }))
          }
          const doImport = () => {
            setMsg(null)
            apiCall('mcpm-import', { json: importText }).then((res) => {
              if (res && res.ok) {
                setBackup({ mode: 'import', added: res.added || [], skipped: res.skipped || [] })
                setImportText('')
                setMsg({ kind: 'ok', text: '导入完成：新增 ' + (res.added || []).length + '，跳过 ' + (res.skipped || []).length })
                refresh()
              } else setMsg({ kind: 'err', text: (res && res.error) || '导入失败' })
            }).catch((e) => setMsg({ kind: 'err', text: String((e && e.message) || e) }))
          }

          const setF = (k) => (ev) => setForm(Object.assign({}, form, { [k]: ev.target.value }))

          const openAdd = () => { setEditing(null); setForm(emptyForm()); setFormOpen(true) }
          const openEdit = (row) => {
            setEditing({ id: row.id, level: row.level })
            setForm({
              serverName: row.serverName || '',
              transport: row.transport === 'stdio' ? 'stdio' : 'streamable-http',
              url: row.url || '',
              command: row.command || '',
              args: (row.args || []).join('\n'),
              headers: kvToLines(row.headers),
              env: kvToLines(row.env),
              level: row.level === 'global' ? 'global' : 'project',
            })
            setFormOpen(true)
          }
          const cancelForm = () => { setFormOpen(false); setEditing(null) }

          const submitForm = () => {
            const payload = Object.assign({}, form)
            if (payload.transport === 'stdio') { payload.url = ''; payload.headers = '' }
            else { payload.command = ''; payload.args = ''; payload.env = '' }
            const onOk = () => { setFormOpen(false); setEditing(null) }
            if (editing) run('mcpm-edit', Object.assign({ id: editing.id }, payload), 'form', onOk)
            else run('mcpm-add', payload, 'form', onOk)
          }

          const rowsLocked = formOpen || busy !== null
          const toggleRow = (row) => run('mcpm-set-enabled', { id: row.id, level: row.level, enabled: row.disabled }, row.id + ':toggle')
          const restartRow = (row) => {
            setTick(0)
            setRestartInfo({ id: row.id, name: row.serverName, startedAt: Date.now() })
            run('mcpm-restart', { id: row.id, level: row.level }, row.id + ':restart')
          }
          const removeRow = (row) => setConfirmRow(row)
          const confirmDelete = () => {
            const row = confirmRow
            setConfirmRow(null)
            if (row) run('mcpm-remove', { id: row.id, level: row.level }, row.id + ':remove')
          }

          const rows = state.rows || []
          const maskKv = (obj) => {
            if (!obj) return null
            return Object.keys(obj).map((k) => k + ': ' + String(obj[k]).replace(/^(.{4}).*$/, '$1****')).join('  ')
          }

          const liveChip = (row) => {
            if (!row.live) return null
            const phase = row.live.phase
            if (phase === 'failed') {
              return React.createElement('span', { className: 'mcpm-chip bad' }, 'loader: 失败')
            }
            if (!row.live.enabled) {
              return React.createElement('span', { className: 'mcpm-chip live' }, 'loader: off')
            }
            if (phase && phase !== 'active') {
              return React.createElement('span', { className: 'mcpm-chip live' }, 'loader: on · ' + phase)
            }
            const tc = typeof row.toolCount === 'number' ? row.toolCount : null
            const cls = tc === 0 ? 'mcpm-chip warn' : 'mcpm-chip live'
            return React.createElement('span', { className: cls }, 'loader: on · active' + (tc === null ? '' : ' · ' + tc + ' 工具'))
          }
          const liveHint = (row) => {
            if (!row.live) return null
            if (row.live.phase === 'failed') {
              return React.createElement('div', { className: 'mcpm-warn' }, '⚠ loader 启动失败：请检查 URL / 命令 / 凭证 / 网络，然后点“重启”重试')
            }
            if (row.live.phase === 'active' && typeof row.toolCount === 'number' && row.toolCount === 0) {
              return React.createElement('div', { className: 'mcpm-warn' }, '⚠ 已连接但未注册任何工具：服务端可能未就绪或工具列表为空')
            }
            return null
          }

          return React.createElement('div', { className: 'mcpm-wrap' },
            React.createElement('h2', null, 'MCP 服务管理', React.createElement(VersionBadge, null)),
            React.createElement(TokenRow, null),
            React.createElement('div', { className: 'mcpm-sub' },
              '管理 dsh-mcp-client 服务：写入 项目级(web profile) / 全局(home) 的 cordis.patch.yml，经 HMR 实时生效；重启 DSH 后由 Loader 自动加载。'),
            restartInfo && React.createElement('div', { className: 'mcpm-msg info' },
              '重启中… ' + restartInfo.name + '（已等待 ' + Math.floor((Date.now() - restartInfo.startedAt) / 1000) + ' 秒，完成后自动刷新）'),
            msg && React.createElement('div', { className: 'mcpm-msg ' + msg.kind }, msg.text),
            state.error && React.createElement('div', { className: 'mcpm-msg err' }, state.error),
            state.errors && state.errors.length > 0 && React.createElement('div', { className: 'mcpm-msg err' }, '读取补丁告警: ' + state.errors.join('; ')),
            state.paths && React.createElement('div', { className: 'mcpm-path' },
              '项目级: ' + state.paths.project + '\n全局: ' + state.paths.global),
            React.createElement('div', { className: 'mcpm-backup' },
              React.createElement('div', { className: 'row' },
                React.createElement('span', { className: 'mcpm-sub' }, '备份 / 恢复'),
                React.createElement('button', { className: 'mcpm-btn', disabled: busy !== null, onClick: doExport }, '导出配置'),
                React.createElement('button', { className: 'mcpm-btn', disabled: busy !== null, onClick: () => { setBackup({ mode: 'import', added: [], skipped: [] }); setImportText('') } }, '导入配置')),
              backup && backup.mode === 'export' && React.createElement('div', null,
                React.createElement('div', { className: 'mcpm-report' }, '已同时保存到: ' + (backup.savedTo || '（未落盘）')),
                React.createElement('textarea', { className: 'mcpm-json', readOnly: true, value: backup.json })),
              backup && backup.mode === 'import' && React.createElement('div', null,
                React.createElement('textarea', { className: 'mcpm-json', placeholder: '粘贴导出的 JSON（数组或 { rows: [...] }）', value: importText, onChange: (ev) => setImportText(ev.target.value) }),
                React.createElement('div', { className: 'row' },
                  React.createElement('button', { className: 'mcpm-btn primary', disabled: busy !== null || !importText.trim(), onClick: doImport }, '执行导入'),
                  React.createElement('span', { className: 'mcpm-report' }, '新增: ' + (backup.added || []).join(', ') + '   跳过: ' + (backup.skipped || []).map((s) => s.id + '(' + s.reason + ')').join(', ')))),
              (!backup || backup.mode === 'export') && React.createElement('div', { className: 'mcpm-sub' }, '提示：导入会合并新增，已存在的条目自动跳过；先“导出配置”可获得模板。')),
            React.createElement('div', null,
              React.createElement('button', { className: 'mcpm-btn primary', onClick: () => (formOpen ? cancelForm() : openAdd()) },
                formOpen ? '收起表单' : '+ 新增 MCP 服务')),
            formOpen && React.createElement('div', { className: 'mcpm-form' },
              React.createElement('h3', null, editing ? '编辑 MCP 服务：' + editing.id : '新增 MCP 服务'),
              React.createElement('label', null, '服务名称 serverName（唯一，1-32 位）', React.createElement('input', { value: form.serverName, onChange: setF('serverName'), placeholder: 'e.g. github' })),
              React.createElement('label', null, '传输方式', React.createElement('select', { value: form.transport, onChange: setF('transport') },
                React.createElement('option', { value: 'streamable-http' }, 'streamable-http'),
                React.createElement('option', { value: 'stdio' }, 'stdio'))),
              React.createElement('label', { className: 'full' }, '级别', React.createElement('select', { value: form.level, onChange: setF('level') },
                React.createElement('option', { value: 'project' }, '项目级（本 profile：profiles/web/cordis.patch.yml）'),
                React.createElement('option', { value: 'global' }, '全局（所有 profile：~/.dsh/cordis.patch.yml）'))),
              form.transport === 'streamable-http'
                ? React.createElement('label', { className: 'full' }, '服务 URL', React.createElement('input', { value: form.url, onChange: setF('url'), placeholder: 'https://host/mcp' }))
                : React.createElement('label', { className: 'full' }, '启动命令', React.createElement('input', { value: form.command, onChange: setF('command'), placeholder: 'npx -y @modelcontextprotocol/server-github' })),
              form.transport === 'stdio' && React.createElement('label', { className: 'full' }, '参数（空格/换行分隔）', React.createElement('textarea', { value: form.args, onChange: setF('args'), placeholder: '-y\n@modelcontextprotocol/server-github' })),
              form.transport === 'stdio' && React.createElement('label', { className: 'full' }, '环境变量（每行 key=value）', React.createElement('textarea', { value: form.env, onChange: setF('env'), placeholder: 'GITHUB_TOKEN=xxx' })),
              form.transport === 'streamable-http' && React.createElement('label', { className: 'full' }, '请求头（每行 key=value）', React.createElement('textarea', { value: form.headers, onChange: setF('headers'), placeholder: 'Authorization=Bearer xxx' })),
              React.createElement('label', { className: 'full' }, ' ',
                React.createElement('div', { style: { display: 'flex', gap: '8px' } },
                  React.createElement('button', { className: 'mcpm-btn primary', disabled: busy === 'form', onClick: submitForm }, editing ? '保存' : '添加'),
                  React.createElement('button', { className: 'mcpm-btn', onClick: cancelForm }, '取消')))),
            state.loading
              ? React.createElement('div', { className: 'mcpm-sub' }, '加载中…')
              : rows.length === 0
                ? React.createElement('div', { className: 'mcpm-sub' }, '暂无 MCP 服务。点击“+ 新增 MCP 服务”添加。')
                : rows.map((row) => React.createElement('div', { key: row.id, className: 'mcpm-row' },
                    React.createElement('div', { className: 'mcpm-row-head' },
                      React.createElement('span', { className: 'mcpm-name' }, row.serverName),
                      React.createElement('span', { className: 'mcpm-chip ' + (row.disabled ? 'off' : 'on') }, row.disabled ? '已禁用' : '已启用'),
                      React.createElement('span', { className: 'mcpm-chip' }, LEVEL_LABEL[row.level] || row.level),
                      liveChip(row),
                      !row.managed && row.level !== 'loader' && React.createElement('span', { className: 'mcpm-chip off' }, '手动添加')),
                    liveHint(row),
                    React.createElement('div', { className: 'mcpm-detail' },
                      'id: ' + row.id + ' · ' + (row.transport || '?') + (row.url ? ' · ' + row.url : '') + (row.command ? ' · ' + row.command + ((row.args && row.args.length) ? ' ' + row.args.join(' ') : '') : '')),
                    (row.headers || row.env) && React.createElement('div', { className: 'mcpm-detail' },
                      (row.headers ? 'headers: ' + maskKv(row.headers) + '  ' : '') + (row.env ? 'env: ' + Object.keys(row.env).map((k) => k + ': ****').join('  ') : '')),
                    React.createElement('div', { className: 'mcpm-row-actions' },
                      row.level !== 'loader' && React.createElement('button', { className: 'mcpm-btn', disabled: rowsLocked, onClick: () => openEdit(row) }, '编辑'),
                      React.createElement('button', { className: 'mcpm-btn', disabled: rowsLocked, onClick: () => toggleRow(row) }, row.disabled ? '启用' : '禁用'),
                      React.createElement('button', { className: 'mcpm-btn', disabled: rowsLocked, onClick: () => restartRow(row) }, '重启'),
                      row.level !== 'loader' && React.createElement('button', { className: 'mcpm-btn danger', disabled: rowsLocked, onClick: () => removeRow(row) }, '删除')))),
            confirmRow && React.createElement('div', { className: 'mcpm-mask', onClick: () => setConfirmRow(null) },
              React.createElement('div', { className: 'mcpm-dialog', onClick: (ev) => ev.stopPropagation() },
                React.createElement('div', { className: 'mcpm-dialog-title' }, '删除 MCP 服务'),
                React.createElement('div', { className: 'mcpm-dialog-body' },
                  '确定要删除“' + confirmRow.serverName + '”吗？\n删除后该服务的配置将从补丁文件中移除，相关工具立即下线，此操作不可撤销。'),
                React.createElement('div', { className: 'mcpm-dialog-actions' },
                  React.createElement('button', { className: 'mcpm-btn', onClick: () => setConfirmRow(null) }, '取消'),
                  React.createElement('button', { className: 'mcpm-btn danger', onClick: confirmDelete }, '删除'))))
          )
        }

        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'mcp-manager', order: 16, label: 'MCP 管理' },
          () => React.createElement(MCPPage)
        ))

        // Grouping: the registry's built-in providers are "filesystem"
        // (project/user/custom/bundled roots) and "runtime" (register());
        // any other provider name means a plugin-provided skill
        // (e.g. superpowers-dsh). skmLevelOf is mutually exclusive.
        function skmLevelOf(s) {
          if (s.source === 'project-dsh' || s.source === 'project-agents') return '项目级'
          if (s.source === 'runtime') return '运行时'
          if (s.source === 'user-dsh' || s.source === 'user-agents') return '用户级'
          if (s.source === 'bundled') return '内置'
          if (s.source === 'custom' && s.provider === 'filesystem') return '自定义'
          return '插件自带'
        }
        const SKM_GROUPS = ['项目级', '运行时', '自定义', '用户级', '内置', '插件自带']
        function SkillPage() {
          const [state, setState] = React.useState({ loading: true, error: null, skills: [] })
          const [q, setQ] = React.useState('')
          const [busy, setBusy] = React.useState(null)
          const [msg, setMsg] = React.useState(null)
          const [hidden, setHidden] = React.useState({})
          const toggleGroup = (key) => setHidden((h) => ({ ...h, [key]: !h[key] }))
          const refresh = () => {
            apiCall('skill-list', {}).then((res) => {
              setState({ loading: false, error: res && res.ok ? null : ((res && res.error) || '加载失败'), skills: (res && res.skills) || [] })
            }).catch((e) => setState({ loading: false, error: String((e && e.message) || e), skills: [] }))
          }
          React.useEffect(() => { refresh() }, [])
          React.useEffect(() => ctx.interval(() => refresh(), 5000), [])
          React.useEffect(() => { if (!msg) return; return ctx.timeout(() => setMsg(null), 3000) }, [msg])
          const toggle = (skill) => {
            const enabled = skill.provider === 'dsh-mcp-manager-override'
            setBusy(skill.name)
            apiCall('skill-toggle', { name: skill.name, enabled }).then((res) => {
              if (res && res.ok) { setMsg({ kind: 'ok', text: (enabled ? '已启用 ' : '已禁用 ') + skill.name }); refresh() }
              else setMsg({ kind: 'err', text: (res && res.error) || '操作失败' })
            }).catch((e) => setMsg({ kind: 'err', text: String((e && e.message) || e) })).then(() => setBusy(null))
          }
          const query = q.trim().toLowerCase()
          const visible = state.skills.filter((s) => !query || (s.name + ' ' + (s.description || '')).toLowerCase().includes(query))
          return React.createElement('div', { className: 'mcpm-wrap' },
            React.createElement('h2', null, 'Skills 管理', React.createElement(VersionBadge, null)),
            React.createElement(TokenRow, null),
            React.createElement('div', { className: 'mcpm-sub' }, '查看与启停 DSH 技能（按层级分组，禁用即时生效，无需重启）'),
            msg && React.createElement('div', { className: 'mcpm-msg ' + msg.kind }, msg.text),
            React.createElement('input', { className: 'skm-search', placeholder: '搜索技能名称或描述…', value: q, onChange: (e) => setQ(e.target.value) }),
            state.loading ? React.createElement('div', { className: 'mcpm-sub' }, '加载中…') :
            state.error ? React.createElement('div', { className: 'mcpm-msg err' }, state.error) :
            SKM_GROUPS.map((key) => {
              const items = visible.filter((s) => skmLevelOf(s) === key)
              if (!items.length) return null
              // within a level, sub-group by provider (collapsible)
              const byProvider = {}
              items.forEach((s) => { const p = s.provider || 'unknown'; (byProvider[p] = byProvider[p] || []).push(s) })
              const providerKeys = Object.keys(byProvider).sort()
              return React.createElement(React.Fragment, { key },
                React.createElement('div', { className: 'skm-group-title' }, key + '（' + items.length + '）'),
                providerKeys.map((pk) => {
                  const pItems = byProvider[pk]
                  const collapsed = !query && !!hidden[pk]
                  return React.createElement(React.Fragment, { key: pk },
                    React.createElement('div', { className: 'skm-provider-title', onClick: () => toggleGroup(pk), title: '点击折叠/展开' },
                      (collapsed ? '▸ ' : '▾ ') + pk + '（' + pItems.length + '）'),
                    collapsed ? null : pItems.map((s) => {
                      const overridden = s.provider === 'dsh-mcp-manager-override'
                      const available = !!(s.invocation && s.invocation.modelInvocable)
                      // User-level filesystem skills are view-only: they live in
                      // the scoped layer which a global-layer override cannot
                      // shadow, and the plugin sandbox blocks writing their
                      // SKILL.md — so no enable/disable button is offered.
                      const userLevel = s.source === 'user-dsh' || s.source === 'user-agents'
                      return React.createElement('div', { className: 'mcpm-row', key: s.name },
                        React.createElement('div', { className: 'mcpm-row-head' },
                          React.createElement('span', { className: 'mcpm-name' }, s.name),
                          React.createElement('span', { className: 'mcpm-chip ' + (available ? 'on' : 'off') }, available ? '可用' : '禁用'),
                          overridden && React.createElement('span', { className: 'mcpm-chip warn' }, '手动禁用'),
                          React.createElement('span', { className: 'mcpm-chip live' }, s.provider)),
                        React.createElement('div', { className: 'mcpm-sub' }, s.description || ''),
                        React.createElement('div', { className: 'mcpm-row-actions' },
                          userLevel
                            ? React.createElement('span', { className: 'mcpm-note' }, '仅查看（由 DSH 文件系统管理）')
                            : React.createElement('button', { className: 'mcpm-btn', disabled: busy === s.name, onClick: () => toggle(s) }, overridden ? '启用' : '禁用')))
                    }))
                }))
            }))
        }

        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'skill-manager', order: 17, label: 'Skills 管理' },
          () => React.createElement(SkillPage)
        ))
      },
    }
    return module.exports
  }

  // Register the client bundle under both names: the official CLI mounts the
  // bundle under the loader entry id `dsh-mcp-manager` (cordis.patch.yml
  // insert row), and the scoped npm package is `@xxxyz/dsh-mcp-manager`. The
  // boot graph row id must match the id the bundle registers, so both are
  // registered — the unused one is inert.
  window.__ModuleLoader__.load({ id: 'dsh-mcp-manager', factory })
  window.__ModuleLoader__.load({ id: '@xxxyz/dsh-mcp-manager', factory })
