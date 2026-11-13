/**
 * Web half of the MCP connection manager: one Settings → MCP page.
 *
 * The page talks to the Host half over the shared `/api` channel endpoints
 * (`mcp-manager.list`, `.save`, `.remove`, `.setEnabled`, `.test`). All
 * permissions and validation belong to the Host; this module renders state and
 * forwards user intent.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-mcp-manager',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'settings.mcp'
    const ENDPOINT_PREFIX = 'mcp-manager.'
    const POLL_MS = 5000

    const en = {
      nav: 'MCP',
      title: 'MCP connections',
      intro:
        'Connect Model Context Protocol servers to this Harness installation. Enabled servers apply immediately: their tools join every agent as mcp__<server>__<tool>.',
      add: 'Add server',
      refresh: 'Refresh',
      loading: 'Loading…',
      empty: 'No MCP servers configured yet. Add one to give agents its tools.',
      name: 'Server name',
      nameHint: 'Tool prefix: mcp__<server name>__<tool>. Letters, digits, "_" and "-" only, up to 32 characters.',
      transport: 'Transport',
      http: 'Streamable HTTP',
      stdio: 'Local command (stdio)',
      url: 'URL',
      urlHint: 'Endpoint of the MCP server, for example https://example.com/mcp',
      headers: 'HTTP headers',
      headersHint: 'One "Name: value" per line (optional).',
      command: 'Command',
      commandHint: 'Executable to start, for example npx or C:\\tools\\server.exe',
      args: 'Arguments',
      argsHint: 'One argument per line.',
      env: 'Environment',
      envHint: 'One "KEY=value" per line (optional).',
      cwd: 'Working directory',
      cwdHint: 'Optional absolute directory for the process.',
      timeout: 'Tool call timeout (ms)',
      enabled: 'Enabled',
      save: 'Save',
      cancel: 'Cancel',
      saving: 'Saving…',
      edit: 'Edit',
      remove: 'Delete',
      removeConfirm: 'Delete this connection?',
      test: 'Test',
      testing: 'Testing…',
      testOk: 'Connection succeeded',
      testFailed: 'Connection failed',
      statusConnected: 'Connected',
      statusConnecting: 'Connecting…',
      statusError: 'Error',
      statusDisabled: 'Disabled',
      statusStopped: 'Not connected',
      statusExternal: 'External configuration',
      toolsLabel: 'tools',
      externalTitle: 'Configured outside this plugin',
      externalHint:
        'These MCP rows come from the profile configuration or an installed bundle. They stay owned by that configuration: this page shows their live status and can enable or disable them.',
      externalBadge: 'external',
      externalReadonly: 'This row is owned by the profile configuration and cannot be toggled here.',
      importLabel: 'Import…',
      importTitle: 'Import MCP servers',
      importHint:
        'Servers configured in Cursor, Claude Desktop, or VS Code can be copied into this plugin. The other applications’ files are only read, never modified.',
      importEmpty: 'No MCP configuration files from other applications were found.',
      importMissing: 'file not found',
      importSelectAll: 'Select all',
      importRun: 'Import selected',
      importRunning: 'Importing…',
      importDone: 'Imported',
      importSkipped: 'skipped',
      importFailed: 'Import failed',
      refreshFailed: 'Could not load MCP connections',
      saveFailed: 'Could not save the connection',
      removeFailed: 'Could not delete the connection',
      toggleFailed: 'Could not change the connection state',
      testFailedAction: 'Could not test the connection',
      requiredName: 'Enter a server name.',
      requiredTarget: 'Enter a URL or a command.',
      mcpUnavailable: 'The MCP client plugin is unavailable in this profile, so no connection can start.',
      store: 'Definitions are stored in',
      errorLabel: 'Error',
      advanced: 'Advanced',
      addTitle: 'New MCP connection',
      editTitle: 'Edit MCP connection',
    }

    const ru = {
      nav: 'MCP',
      title: 'Подключения MCP',
      intro:
        'Подключите серверы Model Context Protocol к этой установке Harness. Включённые серверы применяются сразу: их инструменты становятся доступны агентам как mcp__<сервер>__<инструмент>.',
      add: 'Добавить сервер',
      refresh: 'Обновить',
      loading: 'Загрузка…',
      empty: 'Подключений MCP пока нет. Добавьте сервер, чтобы дать агенту его инструменты.',
      name: 'Имя сервера',
      nameHint: 'Префикс инструментов: mcp__<имя>__<инструмент>. Только латиница, цифры, «_» и «-», до 32 символов.',
      transport: 'Транспорт',
      http: 'Streamable HTTP',
      stdio: 'Локальная команда (stdio)',
      url: 'URL',
      urlHint: 'Адрес MCP-сервера, например https://example.com/mcp',
      headers: 'HTTP-заголовки',
      headersHint: 'По одному «Имя: значение» в строке (необязательно).',
      command: 'Команда',
      commandHint: 'Запускаемый файл, например npx или C:\\tools\\server.exe',
      args: 'Аргументы',
      argsHint: 'По одному аргументу в строке.',
      env: 'Переменные окружения',
      envHint: 'По одной «КЛЮЧ=значение» в строке (необязательно).',
      cwd: 'Рабочий каталог',
      cwdHint: 'Необязательный абсолютный каталог для процесса.',
      timeout: 'Таймаут вызова инструмента (мс)',
      enabled: 'Включено',
      save: 'Сохранить',
      cancel: 'Отмена',
      saving: 'Сохранение…',
      edit: 'Изменить',
      remove: 'Удалить',
      removeConfirm: 'Удалить это подключение?',
      test: 'Проверить',
      testing: 'Проверка…',
      testOk: 'Подключение работает',
      testFailed: 'Подключение не удалось',
      statusConnected: 'Подключено',
      statusConnecting: 'Подключение…',
      statusError: 'Ошибка',
      statusDisabled: 'Отключено',
      statusStopped: 'Не подключено',
      statusExternal: 'Внешняя конфигурация',
      toolsLabel: 'инструм.',
      externalTitle: 'Настроены вне плагина',
      externalHint:
        'Эти подключения MCP заданы конфигурацией профиля или установленным бандлом. Владелец строки — та конфигурация: здесь виден живой статус и доступно включение/отключение.',
      externalBadge: 'внешнее',
      externalReadonly: 'Строкой владеет конфигурация профиля, переключать её здесь нельзя.',
      importLabel: 'Импортировать…',
      importTitle: 'Импорт MCP-серверов',
      importHint:
        'Серверы, настроенные в Cursor, Claude Desktop или VS Code, можно скопировать в этот плагин. Файлы других приложений только читаются и не изменяются.',
      importEmpty: 'Файлы конфигурации MCP других приложений не найдены.',
      importMissing: 'файл не найден',
      importSelectAll: 'Выбрать все',
      importRun: 'Импортировать выбранные',
      importRunning: 'Импорт…',
      importDone: 'Импортировано',
      importSkipped: 'пропущено',
      importFailed: 'Не удалось импортировать',
      refreshFailed: 'Не удалось загрузить подключения MCP',
      saveFailed: 'Не удалось сохранить подключение',
      removeFailed: 'Не удалось удалить подключение',
      toggleFailed: 'Не удалось изменить состояние подключения',
      testFailedAction: 'Не удалось проверить подключение',
      requiredName: 'Укажите имя сервера.',
      requiredTarget: 'Укажите URL или команду.',
      mcpUnavailable: 'Плагин клиента MCP недоступен в этом профиле, подключение невозможно.',
      store: 'Определения хранятся в',
      errorLabel: 'Ошибка',
      advanced: 'Дополнительно',
      addTitle: 'Новое подключение MCP',
      editTitle: 'Изменить подключение MCP',
    }

    function messageOf(error) {
      if (error instanceof Error) return error.message
      return String(error)
    }

    async function callEndpoint(rpc, endpoint, payload) {
      const result = await rpc.call('/api', `${ENDPOINT_PREFIX}${endpoint}`, payload)
      if (result === undefined || result === null) throw new Error('No response from the Harness')
      if (!result.ok) {
        const message = result.error !== undefined && result.error !== null ? result.error.message : 'Request failed'
        throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
      }
      return result.value
    }

    function splitLines(text) {
      if (typeof text !== 'string') return []
      return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
    }

    function parsePairs(text, separator) {
      const result = {}
      for (const line of splitLines(text)) {
        const index = line.indexOf(separator)
        if (index <= 0) continue
        const key = line.slice(0, index).trim()
        const value = line.slice(index + 1).trim()
        if (key.length === 0) continue
        result[key] = value
      }
      return result
    }

    function mapToLines(map, separator) {
      if (map === undefined || map === null) return ''
      return Object.entries(map)
        .map(([key, value]) => `${key}${separator}${separator === ':' ? ' ' : ''}${value}`)
        .join('\n')
    }

    function draftFromServer(server) {
      return {
        serverName: server.serverName ?? '',
        transport: server.transport === 'stdio' ? 'stdio' : 'streamable-http',
        url: server.url ?? '',
        headers: mapToLines(server.headers, ':'),
        command: server.command ?? '',
        args: Array.isArray(server.args) ? server.args.join('\n') : '',
        env: mapToLines(server.env, '='),
        cwd: server.cwd ?? '',
        toolCallTimeoutMs: String(server.toolCallTimeoutMs ?? 60000),
        enabled: server.enabled !== false,
      }
    }

    const emptyDraft = {
      serverName: '',
      transport: 'streamable-http',
      url: '',
      headers: '',
      command: '',
      args: '',
      env: '',
      cwd: '',
      toolCallTimeoutMs: '60000',
      enabled: true,
    }

    function draftToServer(draft) {
      const server = {
        serverName: (draft.serverName ?? '').trim(),
        transport: draft.transport === 'stdio' ? 'stdio' : 'streamable-http',
        enabled: Boolean(draft.enabled),
        toolCallTimeoutMs: Number(draft.toolCallTimeoutMs) || 60000,
      }
      if (server.transport === 'streamable-http') {
        server.url = (draft.url ?? '').trim()
        server.headers = parsePairs(draft.headers, ':')
      } else {
        server.command = (draft.command ?? '').trim()
        server.args = splitLines(draft.args)
        server.env = parsePairs(draft.env, '=')
        server.cwd = (draft.cwd ?? '').trim()
      }
      return server
    }

    function draftFromListedServer(server) {
      return {
        ...draftFromServer(server),
      }
    }

    function StatusLine(props) {
      const { server, t } = props
      const phase = server.phase
      let dot = 'mcp-mgr-dot'
      if (phase === 'connected') dot += ' ok'
      else if (phase === 'error') dot += ' err'
      else if (phase === 'connecting') dot += ' warn'
      let label = t('statusStopped')
      if (phase === 'connected') label = t('statusConnected')
      else if (phase === 'connecting') label = t('statusConnecting')
      else if (phase === 'error') label = t('statusError')
      else if (phase === 'disabled') label = t('statusDisabled')
      else if (phase === 'external') label = t('statusExternal')
      const tools = Array.isArray(server.tools) ? server.tools : []
      return h(
        'div',
        { className: 'mcp-mgr-status' },
        h('span', { className: dot }),
        h('span', null, label),
        tools.length > 0 ? h('span', { className: 'mcp-mgr-muted' }, ` · ${tools.length} ${t('toolsLabel')}`) : null,
        server.error ? h('span', { className: 'mcp-mgr-error-text', title: server.error }, ` · ${server.error}`) : null,
      )
    }

    function TestResult(props) {
      const { state, t } = props
      if (state === undefined) return null
      if (state.state === 'running') return h('span', { className: 'mcp-mgr-muted' }, t('testing'))
      if (state.state === 'ok') {
        const tools = Array.isArray(state.tools) ? state.tools : []
        return h(
          'span',
          { className: 'mcp-mgr-ok' },
          t('testOk'),
          tools.length > 0 ? ` · ${tools.length} ${t('toolsLabel')}: ${tools.join(', ')}` : '',
        )
      }
      return h('span', { className: 'mcp-mgr-error-text' }, `${t('testFailed')}: ${state.error ?? ''}`)
    }

    function ServerRow(props) {
      const { server, t, busy, testState, onToggle, onEdit, onTest, onRemove } = props
      const [confirming, setConfirming] = React.useState(false)
      React.useEffect(() => {
        setConfirming(false)
      }, [server.id])
      return h(
        'div',
        { className: 'mcp-mgr-row' },
        h(
          'div',
          { className: 'mcp-mgr-row-main' },
          h(
            'div',
            { className: 'mcp-mgr-name-row' },
            h('span', { className: 'mcp-mgr-name' }, server.serverName),
            h('span', { className: 'mcp-mgr-transport' }, server.transport === 'stdio' ? t('stdio') : t('http')),
          ),
          h('div', { className: 'mcp-mgr-target', title: server.target }, server.target),
          h(StatusLine, { server, t }),
          h(TestResult, { state: testState, t }),
        ),
        h(
          'div',
          { className: 'mcp-mgr-row-actions' },
          h(
            'button',
            {
              type: 'button',
              role: 'switch',
              'aria-checked': server.enabled ? 'true' : 'false',
              'aria-label': t('enabled'),
              title: t('enabled'),
              className: `mcp-mgr-switch${server.enabled ? ' on' : ''}`,
              disabled: busy,
              onClick: () => onToggle(server),
            },
            h('span', { className: 'mcp-mgr-switch-knob' }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'mcp-mgr-btn',
              disabled: busy,
              onClick: () => onTest(server),
            },
            t('test'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'mcp-mgr-btn',
              disabled: busy,
              onClick: () => onEdit(server),
            },
            t('edit'),
          ),
          confirming
            ? h(
                React.Fragment,
                null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mcp-mgr-btn danger',
                    disabled: busy,
                    onClick: () => onRemove(server),
                  },
                  t('remove'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mcp-mgr-btn',
                    disabled: busy,
                    onClick: () => setConfirming(false),
                  },
                  t('cancel'),
                ),
              )
            : h(
                'button',
                {
                  type: 'button',
                  className: 'mcp-mgr-btn danger',
                  disabled: busy,
                  onClick: () => setConfirming(true),
                },
                t('remove'),
              ),
        ),
      )
    }

    function ExternalRow(props) {
      const { server, t, busy, onToggle } = props
      return h(
        'div',
        { className: 'mcp-mgr-row' },
        h(
          'div',
          { className: 'mcp-mgr-row-main' },
          h(
            'div',
            { className: 'mcp-mgr-name-row' },
            h('span', { className: 'mcp-mgr-name' }, server.serverName),
            h('span', { className: 'mcp-mgr-badge' }, t('externalBadge')),
            server.transport
              ? h('span', { className: 'mcp-mgr-transport' }, server.transport === 'stdio' ? t('stdio') : t('http'))
              : null,
          ),
          server.target ? h('div', { className: 'mcp-mgr-target', title: server.target }, server.target) : null,
          h(StatusLine, { server, t }),
        ),
        h(
          'div',
          { className: 'mcp-mgr-row-actions' },
          h(
            'button',
            {
              type: 'button',
              role: 'switch',
              'aria-checked': server.enabled ? 'true' : 'false',
              'aria-label': t('enabled'),
              title: server.toggleable ? t('enabled') : t('externalReadonly'),
              className: `mcp-mgr-switch${server.enabled ? ' on' : ''}`,
              disabled: busy || !server.toggleable,
              onClick: () => onToggle(server),
            },
            h('span', { className: 'mcp-mgr-switch-knob' }),
          ),
        ),
      )
    }

    function Field(props) {
      const { label, hint, children } = props
      return h(
        'label',
        { className: 'mcp-mgr-field' },
        h('span', { className: 'mcp-mgr-field-label' }, label),
        children,
        hint ? h('span', { className: 'mcp-mgr-hint' }, hint) : null,
      )
    }

    function ServerForm(props) {
      const { mode, draft, t, saving, error, onChange, onSubmit, onCancel } = props
      const isHttp = draft.transport !== 'stdio'
      const set = (field) => (event) => onChange(field, event.target.value)
      return h(
        'div',
        { className: 'mcp-mgr-form' },
        h('div', { className: 'mcp-mgr-form-title' }, mode === 'edit' ? t('editTitle') : t('addTitle')),
        error ? h('div', { className: 'mcp-mgr-banner err' }, error) : null,
        h(
          'div',
          { className: 'mcp-mgr-grid' },
          h(
            Field,
            { label: t('name'), hint: t('nameHint') },
            h('input', {
              className: 'mcp-mgr-input',
              value: draft.serverName,
              spellCheck: false,
              autoCapitalize: 'off',
              autoCorrect: 'off',
              placeholder: 'my-server',
              onChange: set('serverName'),
            }),
          ),
          h(
            Field,
            { label: t('transport') },
            h(
              'div',
              { className: 'mcp-mgr-seg' },
              h(
                'button',
                {
                  type: 'button',
                  className: isHttp ? 'on' : '',
                  onClick: () => onChange('transport', 'streamable-http'),
                },
                t('http'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: isHttp ? '' : 'on',
                  onClick: () => onChange('transport', 'stdio'),
                },
                t('stdio'),
              ),
            ),
          ),
        ),
        isHttp
          ? h(
              React.Fragment,
              null,
              h(
                Field,
                { label: t('url'), hint: t('urlHint') },
                h('input', {
                  className: 'mcp-mgr-input',
                  value: draft.url,
                  spellCheck: false,
                  placeholder: 'https://example.com/mcp',
                  onChange: set('url'),
                }),
              ),
              h(
                Field,
                { label: t('headers'), hint: t('headersHint') },
                h('textarea', {
                  className: 'mcp-mgr-input',
                  value: draft.headers,
                  spellCheck: false,
                  rows: 2,
                  onChange: set('headers'),
                }),
              ),
            )
          : h(
              React.Fragment,
              null,
              h(
                Field,
                { label: t('command'), hint: t('commandHint') },
                h('input', {
                  className: 'mcp-mgr-input',
                  value: draft.command,
                  spellCheck: false,
                  placeholder: 'npx',
                  onChange: set('command'),
                }),
              ),
              h(
                Field,
                { label: t('args'), hint: t('argsHint') },
                h('textarea', {
                  className: 'mcp-mgr-input',
                  value: draft.args,
                  spellCheck: false,
                  rows: 2,
                  onChange: set('args'),
                }),
              ),
              h(
                Field,
                { label: t('env'), hint: t('envHint') },
                h('textarea', {
                  className: 'mcp-mgr-input',
                  value: draft.env,
                  spellCheck: false,
                  rows: 2,
                  onChange: set('env'),
                }),
              ),
              h(
                Field,
                { label: t('cwd'), hint: t('cwdHint') },
                h('input', {
                  className: 'mcp-mgr-input',
                  value: draft.cwd,
                  spellCheck: false,
                  onChange: set('cwd'),
                }),
              ),
            ),
        h(
          'div',
          { className: 'mcp-mgr-grid' },
          h(
            Field,
            { label: t('timeout') },
            h('input', {
              className: 'mcp-mgr-input',
              value: draft.toolCallTimeoutMs,
              inputMode: 'numeric',
              onChange: set('toolCallTimeoutMs'),
            }),
          ),
          h(
            Field,
            { label: t('enabled') },
            h(
              'button',
              {
                type: 'button',
                role: 'switch',
                'aria-checked': draft.enabled ? 'true' : 'false',
                'aria-label': t('enabled'),
                className: `mcp-mgr-switch${draft.enabled ? ' on' : ''}`,
                onClick: () => onChange('enabled', !draft.enabled),
              },
              h('span', { className: 'mcp-mgr-switch-knob' }),
            ),
          ),
        ),
        h(
          'div',
          { className: 'mcp-mgr-form-actions' },
          h(
            'button',
            { type: 'button', className: 'mcp-mgr-btn primary', disabled: saving, onClick: onSubmit },
            saving ? t('saving') : t('save'),
          ),
          h('button', { type: 'button', className: 'mcp-mgr-btn', disabled: saving, onClick: onCancel }, t('cancel')),
        ),
      )
    }

    function NavIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 16
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M5.2 2.5v3.1M10.8 2.5v3.1' }),
        h('path', { d: 'M3.6 5.6h8.8v2.1a4.4 4.4 0 0 1-8.8 0Z' }),
        h('path', { d: 'M8 11.9v1.6' }),
      )
    }

    function Section(props) {
      const { rpc, t } = props
      const [snapshot, setSnapshot] = React.useState({ loading: true, error: null, data: null })
      const [editing, setEditing] = React.useState(null)
      const [draft, setDraft] = React.useState(emptyDraft)
      const [saving, setSaving] = React.useState(false)
      const [formError, setFormError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [busyId, setBusyId] = React.useState(null)
      const [externalBusy, setExternalBusy] = React.useState(null)
      const [importOpen, setImportOpen] = React.useState(false)
      const [importData, setImportData] = React.useState(null)
      const [importError, setImportError] = React.useState(null)
      const [importBusy, setImportBusy] = React.useState(false)
      const [importSelection, setImportSelection] = React.useState({})
      const [tests, setTests] = React.useState({})

      const load = React.useCallback(async () => {
        try {
          const data = await callEndpoint(rpc, 'list', {})
          setSnapshot((previous) => ({ loading: false, error: null, data }))
        } catch (error) {
          setSnapshot((previous) => ({ loading: false, error: messageOf(error), data: previous.data }))
        }
      }, [rpc])

      React.useEffect(() => {
        let stopped = false
        let timer
        const tick = () => {
          if (stopped) return
          load()
        }
        tick()
        timer = setInterval(tick, POLL_MS)
        return () => {
          stopped = true
          clearInterval(timer)
        }
      }, [load])

      const data = snapshot.data
      const servers = data !== null && Array.isArray(data.servers) ? data.servers : []
      const external = data !== null && Array.isArray(data.external) ? data.external : []

      const beginAdd = () => {
        setDraft({ ...emptyDraft })
        setFormError(null)
        setEditing({ mode: 'new' })
      }

      const beginEdit = (server) => {
        setDraft(draftFromListedServer(server))
        setFormError(null)
        setEditing({ mode: 'edit', server })
      }

      const closeForm = () => {
        setEditing(null)
        setFormError(null)
      }

      const applySnapshot = (next) => {
        setSnapshot({ loading: false, error: null, data: next })
      }

      const submit = async () => {
        if (editing === null) return
        const server = draftToServer(draft)
        if (server.serverName.length === 0) {
          setFormError(t('requiredName'))
          return
        }
        if (server.transport === 'streamable-http' && server.url.length === 0) {
          setFormError(t('requiredTarget'))
          return
        }
        if (server.transport === 'stdio' && server.command.length === 0) {
          setFormError(t('requiredTarget'))
          return
        }
        setSaving(true)
        setFormError(null)
        try {
          const payload = editing.mode === 'edit' ? { id: editing.server.id, server } : { server }
          const next = await callEndpoint(rpc, 'save', payload)
          applySnapshot(next)
          setEditing(null)
        } catch (error) {
          setFormError(`${t('saveFailed')}: ${messageOf(error)}`)
        } finally {
          setSaving(false)
        }
      }

      const toggle = async (server) => {
        setBusyId(server.id)
        setNotice(null)
        try {
          const next = await callEndpoint(rpc, 'setEnabled', { id: server.id, enabled: !server.enabled })
          applySnapshot(next)
        } catch (error) {
          setNotice({ kind: 'error', text: `${t('toggleFailed')}: ${messageOf(error)}` })
        } finally {
          setBusyId(null)
        }
      }

      const remove = async (server) => {
        setBusyId(server.id)
        setNotice(null)
        try {
          const next = await callEndpoint(rpc, 'remove', { id: server.id })
          applySnapshot(next)
        } catch (error) {
          setNotice({ kind: 'error', text: `${t('removeFailed')}: ${messageOf(error)}` })
        } finally {
          setBusyId(null)
        }
      }

      const runTest = async (server) => {
        setTests((previous) => ({ ...previous, [server.id]: { state: 'running' } }))
        try {
          const result = await callEndpoint(rpc, 'test', { server: draftToServer(draftFromListedServer(server)) })
          setTests((previous) => ({
            ...previous,
            [server.id]: result.ok
              ? { state: 'ok', tools: result.tools ?? [] }
              : { state: 'error', error: result.error ?? t('testFailedAction') },
          }))
        } catch (error) {
          setTests((previous) => ({ ...previous, [server.id]: { state: 'error', error: messageOf(error) } }))
        }
      }

      const toggleExternal = async (server) => {
        setExternalBusy(server.id)
        setNotice(null)
        try {
          const next = await callEndpoint(rpc, 'setExternalEnabled', { entryId: server.id, enabled: !server.enabled })
          applySnapshot(next)
        } catch (error) {
          setNotice({ kind: 'error', text: `${t('toggleFailed')}: ${messageOf(error)}` })
        } finally {
          setExternalBusy(null)
        }
      }

      const openImport = async () => {
        setImportOpen(true)
        setImportData(null)
        setImportError(null)
        setImportSelection({})
        try {
          const data = await callEndpoint(rpc, 'importScan', {})
          setImportData(data)
        } catch (error) {
          setImportError(messageOf(error))
        }
      }

      const toggleImport = (sourceId, name) => {
        setImportSelection((previous) => {
          const current = Array.isArray(previous[sourceId]) ? previous[sourceId] : []
          const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
          return { ...previous, [sourceId]: next }
        })
      }

      const toggleImportAll = (sourceId, names) => {
        setImportSelection((previous) => {
          const current = Array.isArray(previous[sourceId]) ? previous[sourceId] : []
          const allSelected = names.length > 0 && names.every((name) => current.includes(name))
          return { ...previous, [sourceId]: allSelected ? [] : [...names] }
        })
      }

      const runImport = async () => {
        if (importData === null) return
        setImportBusy(true)
        setImportError(null)
        const imported = []
        const skipped = []
        try {
          for (const source of importData.sources ?? []) {
            const names = Array.isArray(importSelection[source.id]) ? importSelection[source.id] : []
            if (names.length === 0) continue
            const result = await callEndpoint(rpc, 'import', { sourceId: source.id, names })
            imported.push(...(Array.isArray(result.imported) ? result.imported : []))
            skipped.push(...(Array.isArray(result.skipped) ? result.skipped : []))
            applySnapshot(result)
          }
          if (imported.length > 0) await load()
          setNotice({
            kind: skipped.length > 0 ? 'error' : 'ok',
            text: `${t('importDone')}: ${imported.length}${skipped.length > 0 ? ` · ${t('importSkipped')}: ${skipped.length}` : ''}`,
          })
          setImportOpen(false)
          setImportData(null)
        } catch (error) {
          setImportError(messageOf(error))
        } finally {
          setImportBusy(false)
        }
      }

      const renderImportSource = (source) => {
        if (source.available === false) {
          return h(
            'div',
            { className: 'mcp-mgr-import-source' },
            h(
              'div',
              { className: 'mcp-mgr-import-head' },
              h('span', { className: 'mcp-mgr-name' }, source.label),
              h('span', { className: 'mcp-mgr-muted' }, t('importMissing')),
            ),
            h('div', { className: 'mcp-mgr-store' }, source.path),
          )
        }
        const entries = Array.isArray(source.servers) ? source.servers : []
        const names = entries.filter((entry) => entry.error === undefined).map((entry) => entry.name)
        const selected = Array.isArray(importSelection[source.id]) ? importSelection[source.id] : []
        return h(
          'div',
          { className: 'mcp-mgr-import-source' },
          h(
            'div',
            { className: 'mcp-mgr-import-head' },
            h('span', { className: 'mcp-mgr-name' }, source.label),
            names.length > 0
              ? h(
                  'button',
                  { type: 'button', className: 'mcp-mgr-btn', onClick: () => toggleImportAll(source.id, names) },
                  t('importSelectAll'),
                )
              : null,
          ),
          h('div', { className: 'mcp-mgr-store' }, source.path),
          source.error !== undefined ? h('div', { className: 'mcp-mgr-error-text' }, source.error) : null,
          entries.map((entry) =>
            h(
              'label',
              { key: entry.name, className: 'mcp-mgr-import-row' },
              entry.error !== undefined
                ? null
                : h('input', {
                    type: 'checkbox',
                    checked: selected.includes(entry.name),
                    onChange: () => toggleImport(source.id, entry.name),
                  }),
              h('span', { className: 'mcp-mgr-import-name' }, entry.name),
              entry.error !== undefined
                ? h('span', { className: 'mcp-mgr-error-text' }, entry.error)
                : h('span', { className: 'mcp-mgr-muted' }, `${entry.transport === 'stdio' ? t('stdio') : t('http')} · ${entry.target}`),
            ),
          ),
        )
      }

      const unavailable = data !== null && data.mcpClient !== undefined && data.mcpClient !== null && data.mcpClient.available === false

      return h(
        'div',
        { className: 'mcp-mgr' },
        h(
          'div',
          { className: 'mcp-mgr-header' },
          h(
            'div',
            null,
            h('h2', { className: 'mcp-mgr-title' }, t('title')),
            h('p', { className: 'mcp-mgr-intro' }, t('intro')),
          ),
          h(
            'div',
            { className: 'mcp-mgr-header-actions' },
            h('button', { type: 'button', className: 'mcp-mgr-btn', onClick: () => load() }, t('refresh')),
            h(
              'button',
              { type: 'button', className: 'mcp-mgr-btn', onClick: () => (importOpen ? setImportOpen(false) : openImport()), disabled: editing !== null },
              t('importLabel'),
            ),
            h('button', { type: 'button', className: 'mcp-mgr-btn primary', onClick: beginAdd, disabled: editing !== null }, t('add')),
          ),
        ),
        unavailable
          ? h(
              'div',
              { className: 'mcp-mgr-banner err' },
              `${t('mcpUnavailable')}${data.mcpClient.error ? ` (${data.mcpClient.error})` : ''}`,
            )
          : null,
        snapshot.error !== null
          ? h('div', { className: 'mcp-mgr-banner err' }, `${t('refreshFailed')}: ${snapshot.error}`)
          : null,
        notice !== null ? h('div', { className: `mcp-mgr-banner ${notice.kind === 'error' ? 'err' : 'ok'}` }, notice.text) : null,
        importOpen
          ? h(
              'div',
              { className: 'mcp-mgr-form' },
              h('div', { className: 'mcp-mgr-form-title' }, t('importTitle')),
              h('div', { className: 'mcp-mgr-hint' }, t('importHint')),
              importError !== null
                ? h('div', { className: 'mcp-mgr-banner err' }, `${t('importFailed')}: ${importError}`)
                : null,
              importData === null
                ? h('div', { className: 'mcp-mgr-muted' }, t('loading'))
                : (importData.sources ?? []).every((source) => source.available === false)
                  ? h('div', { className: 'mcp-mgr-muted' }, t('importEmpty'))
                  : (importData.sources ?? []).map((source) => renderImportSource(source)),
              h(
                'div',
                { className: 'mcp-mgr-form-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mcp-mgr-btn primary',
                    disabled: importBusy || !Object.values(importSelection).some((names) => Array.isArray(names) && names.length > 0),
                    onClick: runImport,
                  },
                  importBusy ? t('importRunning') : t('importRun'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mcp-mgr-btn',
                    disabled: importBusy,
                    onClick: () => {
                      setImportOpen(false)
                      setImportData(null)
                      setImportError(null)
                    },
                  },
                  t('cancel'),
                ),
              ),
            )
          : null,
        editing !== null
          ? h(ServerForm, {
              mode: editing.mode,
              draft,
              t,
              saving,
              error: formError,
              onChange: (field, value) => setDraft((previous) => ({ ...previous, [field]: value })),
              onSubmit: submit,
              onCancel: closeForm,
            })
          : null,
        snapshot.loading && data === null ? h('div', { className: 'mcp-mgr-muted' }, t('loading')) : null,
        data !== null && servers.length === 0 && external.length === 0 && !snapshot.loading
          ? h('div', { className: 'mcp-mgr-empty' }, t('empty'))
          : null,
        h(
          'div',
          { className: 'mcp-mgr-list' },
          servers.map((server) =>
            h(ServerRow, {
              key: server.id,
              server,
              t,
              busy: busyId === server.id,
              testState: tests[server.id],
              onToggle: toggle,
              onEdit: beginEdit,
              onTest: runTest,
              onRemove: remove,
            }),
          ),
        ),
        external.length > 0
          ? h(
              'div',
              { className: 'mcp-mgr-external' },
              h('div', { className: 'mcp-mgr-external-title' }, t('externalTitle')),
              h('div', { className: 'mcp-mgr-hint' }, t('externalHint')),
              h(
                'div',
                { className: 'mcp-mgr-list' },
                external.map((server) =>
                  h(ExternalRow, {
                    key: server.id,
                    server,
                    t,
                    busy: externalBusy === server.id,
                    onToggle: toggleExternal,
                  }),
                ),
              ),
            )
          : null,
        data !== null && typeof data.storePath === 'string'
          ? h('div', { className: 'mcp-mgr-store' }, `${t('store')} ${data.storePath}`)
          : null,
      )
    }

    const css = `
.mcp-mgr { display: flex; flex-direction: column; gap: 14px; padding: 2px 2px 24px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.5; }
.mcp-mgr-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.mcp-mgr-header-actions { display: flex; gap: 8px; flex: none; }
.mcp-mgr-title { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
.mcp-mgr-intro { margin: 0; max-width: 72ch; color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.mcp-mgr-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.mcp-mgr-btn { font: inherit; font-size: 12.5px; line-height: 1.2; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; white-space: nowrap; }
.mcp-mgr-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.mcp-mgr-btn:disabled { opacity: .55; cursor: default; }
.mcp-mgr-btn.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); font-weight: 600; }
.mcp-mgr-btn.danger { color: var(--dsw-alias-state-error-primary); }
.mcp-mgr-list { display: flex; flex-direction: column; gap: 8px; }
.mcp-mgr-row { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.mcp-mgr-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.mcp-mgr-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mcp-mgr-name { font-weight: 600; font-size: 13px; }
.mcp-mgr-transport { font-size: 11px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 0 7px; }
.mcp-mgr-badge { font-size: 11px; color: var(--dsw-alias-label-secondary); border: 1px dashed var(--dsw-alias-border-l2); border-radius: 999px; padding: 0 7px; }
.mcp-mgr-external { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.mcp-mgr-external-title { font-weight: 600; font-size: 13px; margin-bottom: -4px; }
.mcp-mgr-import-source { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
.mcp-mgr-import-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mcp-mgr-import-row { display: flex; align-items: center; gap: 8px; font-size: 12px; min-width: 0; }
.mcp-mgr-import-row input[type="checkbox"] { accent-color: var(--dsw-alias-brand-primary); margin: 0; }
.mcp-mgr-import-name { font-weight: 500; white-space: nowrap; }
.mcp-mgr-target { color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; overflow-wrap: anywhere; }
.mcp-mgr-status { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); flex-wrap: wrap; }
.mcp-mgr-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); flex: none; }
.mcp-mgr-dot.ok { background: var(--dsw-alias-state-success-primary); }
.mcp-mgr-dot.err { background: var(--dsw-alias-state-error-primary); }
.mcp-mgr-dot.warn { background: var(--dsw-alias-state-warn-primary); }
.mcp-mgr-error-text { color: var(--dsw-alias-state-error-primary); font-size: 12px; overflow-wrap: anywhere; }
.mcp-mgr-ok { color: var(--dsw-alias-state-success-primary); font-size: 12px; }
.mcp-mgr-row-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.mcp-mgr-switch { position: relative; width: 32px; height: 18px; flex: none; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); padding: 0; cursor: pointer; transition: background .15s ease; }
.mcp-mgr-switch.on { background: var(--dsw-alias-brand-primary); border-color: transparent; }
.mcp-mgr-switch:disabled { opacity: .55; cursor: default; }
.mcp-mgr-switch-knob { position: absolute; top: 1px; left: 1px; width: 14px; height: 14px; border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform .15s ease; }
.mcp-mgr-switch.on .mcp-mgr-switch-knob { transform: translateX(14px); }
.mcp-mgr-form { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.mcp-mgr-form-title { font-weight: 600; font-size: 13px; }
.mcp-mgr-form-actions { display: flex; gap: 8px; }
.mcp-mgr-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: start; }
.mcp-mgr-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.mcp-mgr-field-label { font-size: 12px; font-weight: 500; }
.mcp-mgr-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.mcp-mgr-input { font: inherit; font-size: 12.5px; padding: 6px 9px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); outline: none; width: 100%; box-sizing: border-box; }
.mcp-mgr-input:focus { border-color: var(--dsw-alias-brand-primary); }
textarea.mcp-mgr-input { resize: vertical; min-height: 54px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.mcp-mgr-seg { display: inline-flex; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; overflow: hidden; }
.mcp-mgr-seg button { font: inherit; font-size: 12px; padding: 6px 10px; background: transparent; border: 0; color: var(--dsw-alias-label-secondary); cursor: pointer; white-space: nowrap; }
.mcp-mgr-seg button.on { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 600; }
.mcp-mgr-banner { padding: 8px 10px; border-radius: 8px; font-size: 12px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); overflow-wrap: anywhere; }
.mcp-mgr-banner.err { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.mcp-mgr-banner.ok { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
.mcp-mgr-empty { padding: 18px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; color: var(--dsw-alias-label-secondary); font-size: 12.5px; text-align: center; }
.mcp-mgr-store { color: var(--dsw-alias-label-secondary); font-size: 11.5px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
`

    const inject = ['slots', 'connection', 'locale']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, ru, zh: en }), 'dsh-plugin-mcp-manager: copy dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin', 'dsh-plugin-mcp-manager')
        style.textContent = css
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-plugin-mcp-manager: styles')
      const connection = ctx.get('connection')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'mcp',
            order: 25,
            label: () => t('nav'),
            inject: () => ({ rpc: connection.rpc, t }),
          },
          Section,
        ),
      )
      ctx.slots.inject('settings.section.icon', () =>
        ctx.slots.register({ name: 'settings.section.icon', id: 'mcp' }, NavIcon),
      )
    }

    return { inject, apply }
  },
})
