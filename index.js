/**
 * MCP connection manager for the DeepSeek Harness desktop profile.
 *
 * Owns the list of MCP servers shown in Settings → MCP, mounts one
 * `@deepseek-ai/dsh-mcp-client` instance per enabled server, reports live
 * status and tool counts, and exposes the same operations to the agent through
 * the `mcp_connections` tool. Definitions live in a plugin-owned JSON file
 * (`$DSH_HOME/plugins/mcp-manager/servers.json`); saved changes apply
 * immediately, without restarting the Harness.
 *
 * The module deliberately uses only Node built-ins plus the dynamic
 * `@deepseek-ai/dsh-mcp-client` import, so it stays valid in profiles where the
 * shipped packages resolve from the DSH installation.
 *
 * @module dsh-plugin-mcp-manager
 */
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-manager'
/** Services required by this plugin. */
export const inject = ['tools']

/** Endpoint-name prefix shared with the Web half (`/api/mcp-manager.<endpoint>`). */
const ENDPOINT_PREFIX = 'mcp-manager.'
/** Shipped bridge package that owns one MCP server connection per instance. */
const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'
/** Relative path of the bridge module inside a DSH installation tree. */
const MCP_CLIENT_ENTRY = join('node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js')
/** `serverName` contract enforced by `@deepseek-ai/dsh-mcp-client`. */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
/** Store format version; bump when the persisted shape changes. */
const STORE_VERSION = 1
const DEFAULT_TOOL_TIMEOUT_MS = 60000
const MAX_TOOL_TIMEOUT_MS = 600000
/** Deadline for one "Test connection" probe. */
const PROBE_TIMEOUT_MS = 20000
/** Reconnect policy handed to every managed connection. */
const RECONNECT = Object.freeze({ enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 })
const MAX_INSTRUCTION_BYTES = 32768

/** A caller mistake: reported as `bad-request`, never as an internal failure. */
class BadRequest extends Error {}

/** Resolve `$DSH_HOME` the way the Harness does, without importing a shipped package. */
function homeDirectory() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  return join(homedir(), '.dsh')
}

/** Absolute path of the plugin-owned connection store. */
function storeFilePath() {
  return join(homeDirectory(), 'plugins', 'mcp-manager', 'servers.json')
}

/**
 * Specifiers to try for the bridge module, in order.
 *
 * The Loader resolves the package names in its own YAML rows, so a plugin that
 * mounts one more instance of a shipped plugin at runtime also needs the
 * installation's own paths: a bare specifier works when the running Host maps
 * shipped packages, and the installation paths cover the Electron desktop
 * (packed and unpacked) and CLI layouts.
 */
function mcpClientCandidates() {
  const candidates = [MCP_CLIENT_PACKAGE]
  const roots = []
  const resources = typeof process.resourcesPath === 'string' ? process.resourcesPath : undefined
  const execDir = typeof process.execPath === 'string' ? dirname(process.execPath) : undefined
  if (resources !== undefined) {
    roots.push(join(resources, 'app.asar', 'dsh'))
    roots.push(join(resources, 'app.asar.unpacked', 'dsh'))
  }
  if (execDir !== undefined) {
    roots.push(join(execDir, 'resources', 'app.asar', 'dsh'))
    roots.push(join(execDir, 'app.asar', 'dsh'))
    roots.push(execDir)
  }
  for (const envName of ['DSH_APP_ROOT', 'DSH_INSTALL_DIR', 'DSH_RUNTIME_DIR']) {
    const value = process.env[envName]
    if (typeof value === 'string' && value.length > 0) roots.push(value)
  }
  for (const root of roots) candidates.push(pathToFileURL(join(root, MCP_CLIENT_ENTRY)).href)
  return candidates
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Flatten an error and its `cause` chain into one readable diagnostic. */
function errorMessage(error, depth = 0) {
  if (error instanceof Error) {
    const cause = error.cause
    const suffix = depth < 3 && cause instanceof Error ? `: ${errorMessage(cause, depth + 1)}` : ''
    return `${error.message}${suffix}`
  }
  return String(error)
}

/** Read a string-to-string mapping such as env or headers. */
function readStringMap(value, field) {
  if (value === undefined || value === null) return {}
  if (!isRecord(value)) throw new BadRequest(`${field} must be an object of strings`)
  const result = {}
  for (const [key, entry] of Object.entries(value)) {
    if (taboo(key)) continue
    if (typeof entry !== 'string') throw new BadRequest(`${field}.${key} must be a string`)
    result[key] = entry
  }
  return result
}

function taboo(key) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype'
}

/**
 * Validate and normalize one connection definition.
 *
 * @param input - Raw definition from the Web form, the agent tool, or the store.
 * @param existing - Replaced definition when this is an update.
 * @param keepId - Persisted definitions keep their stored id.
 * @returns The canonical definition persisted by this plugin.
 */
function normalizeServerInput(input, existing, keepId = false) {
  if (!isRecord(input)) throw new BadRequest('server must be an object')
  const transport = input.transport
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    throw new BadRequest('server.transport must be "stdio" or "streamable-http"')
  }
  const serverName = typeof input.serverName === 'string' ? input.serverName.trim() : ''
  if (!SERVER_NAME_PATTERN.test(serverName)) {
    throw new BadRequest('server.serverName must match ^[A-Za-z0-9_-]{1,32}$ — it prefixes every tool name')
  }
  const timeout = input.toolCallTimeoutMs === undefined ? (existing?.toolCallTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS) : Number(input.toolCallTimeoutMs)
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_TOOL_TIMEOUT_MS) {
    throw new BadRequest(`server.toolCallTimeoutMs must be an integer between 1 and ${MAX_TOOL_TIMEOUT_MS}`)
  }
  let id
  if (keepId && typeof input.id === 'string' && input.id.length > 0) id = input.id
  else id = existing?.id ?? randomUUID()
  const enabled = input.enabled === undefined ? (existing?.enabled ?? true) : Boolean(input.enabled)
  const base = { id, serverName, transport, enabled, toolCallTimeoutMs: timeout }
  if (transport === 'streamable-http') {
    const url = typeof input.url === 'string' ? input.url.trim() : ''
    if (url.length === 0) throw new BadRequest('server.url is required for the streamable-http transport')
    let parsed
    try {
      parsed = new URL(url)
    } catch (_error) {
      throw new BadRequest('server.url must be a valid absolute URL')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequest('server.url must start with http:// or https://')
    }
    base.url = url
    base.headers = readStringMap(input.headers, 'server.headers')
    return base
  }
  const command = typeof input.command === 'string' ? input.command.trim() : ''
  if (command.length === 0) throw new BadRequest('server.command is required for the stdio transport')
  const args = input.args === undefined ? [] : input.args
  if (!Array.isArray(args) || args.some((entry) => typeof entry !== 'string')) {
    throw new BadRequest('server.args must be an array of strings')
  }
  base.command = command
  base.args = [...args]
  base.env = readStringMap(input.env, 'server.env')
  base.cwd = typeof input.cwd === 'string' ? input.cwd.trim() : ''
  return base
}

/** The config object one `@deepseek-ai/dsh-mcp-client` instance receives. */
function toMcpConfig(server) {
  const config = {
    serverName: server.serverName,
    transport: server.transport,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: true,
    maxInstructionBytes: MAX_INSTRUCTION_BYTES,
    reconnect: { ...RECONNECT },
  }
  if (server.transport === 'streamable-http') {
    config.url = server.url
    config.headers = { ...server.headers }
  } else {
    config.command = server.command
    config.args = [...server.args]
    config.env = { ...server.env }
    config.cwd = server.cwd
  }
  return config
}

/** The public, persisted shape of one connection. */
function publicServer(server) {
  const shape = {
    id: server.id,
    serverName: server.serverName,
    transport: server.transport,
    enabled: server.enabled,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
  }
  if (server.transport === 'streamable-http') {
    shape.url = server.url
    shape.headers = { ...server.headers }
  } else {
    shape.command = server.command
    shape.args = [...server.args]
    shape.env = { ...server.env }
    shape.cwd = server.cwd
  }
  return shape
}

/** Human-readable target of a connection, for one-line summaries. */
export function targetOf(server) {
  if (server.transport === 'streamable-http') return server.url
  return [server.command, ...server.args].join(' ')
}

function sameConnection(left, right) {
  return JSON.stringify(toMcpConfig(left)) === JSON.stringify(toMcpConfig(right))
}

/** `/api/<method>` RPC route: decode the shared channel envelope, answer likewise. */
function routeFor(endpoint, handler) {
  const method = `${ENDPOINT_PREFIX}${endpoint}`
  return {
    path: `/api/${method}`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 })
      }
      let body
      try {
        body = await request.json()
      } catch (_error) {
        return new Response('body is not JSON', { status: 400 })
      }
      if (!isRecord(body) || body.type !== 'client-request' || typeof body.rpcId !== 'string' || typeof body.method !== 'string') {
        const rpcId = isRecord(body) && typeof body.rpcId === 'string' ? body.rpcId : 'invalid-request'
        return Response.json({
          type: 'server-response',
          rpcId,
          result: failureFor(new BadRequest('invalid client-request message')),
        })
      }
      if (body.method !== method) {
        return Response.json({
          type: 'server-response',
          rpcId: body.rpcId,
          result: failureFor(new BadRequest(`method ${JSON.stringify(body.method)} does not match endpoint ${JSON.stringify(method)}`)),
        })
      }
      let result
      try {
        result = { ok: true, value: await handler(isRecord(body.payload) ? body.payload : {}) }
      } catch (error) {
        result = failureFor(error)
      }
      return Response.json({ type: 'server-response', rpcId: body.rpcId, result })
    },
  }
}

function failureFor(error) {
  const message = errorMessage(error)
  return {
    ok: false,
    error: {
      code: error instanceof BadRequest ? 'bad-request' : 'internal',
      message,
      details: {},
    },
  }
}

/** Text projection of one tool result, shared by every `mcp_connections` action. */
function renderToolResult(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch (_error) {
    return String(value)
  }
}

export async function apply(ctx) {
  const state = {
    servers: [],
    statuses: new Map(),
    mounts: new Map(),
    mcp: undefined,
    mcpError: undefined,
    loaded: undefined,
    queue: Promise.resolve(),
  }

  async function loadMcpClient() {
    if (state.mcp !== undefined) return state.mcp
    const failures = []
    for (const specifier of mcpClientCandidates()) {
      try {
        const module = await import(specifier)
        if (typeof module?.apply !== 'function') throw new Error('module does not export apply()')
        state.mcp = module
        state.mcpError = undefined
        return module
      } catch (error) {
        failures.push(`${specifier}: ${errorMessage(error)}`)
      }
    }
    state.mcp = null
    state.mcpError = `Cannot load ${MCP_CLIENT_PACKAGE} (${failures.join(' | ')})`
    throw new Error(state.mcpError)
  }

  async function loadStore() {
    const path = storeFilePath()
    let text
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw new Error(`Cannot read ${path}: ${errorMessage(error)}`)
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (_error) {
      throw new Error(`${path} is not valid JSON; fix or remove the file`)
    }
    const raw = isRecord(parsed) && Array.isArray(parsed.servers) ? parsed.servers : []
    const accepted = []
    for (const entry of raw) {
      try {
        accepted.push(normalizeServerInput(entry, undefined, true))
      } catch (error) {
        ctx.logger.warn(`mcp-manager: ignoring stored connection: ${errorMessage(error)}`)
      }
    }
    state.servers = accepted
  }

  async function ensureLoaded() {
    if (state.loaded === undefined) state.loaded = loadStore()
    await state.loaded
  }

  async function persist() {
    const path = storeFilePath()
    await mkdir(dirname(path), { recursive: true })
    const payload = { version: STORE_VERSION, servers: state.servers.map(publicServer) }
    const temporary = `${path}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, path)
    try {
      await chmod(path, 0o600)
    } catch (_error) {
      /* Best effort: Windows without POSIX modes. */
    }
  }

  /** Serialize store mutations so a fast second save cannot clobber the first. */
  function exclusive(operation) {
    const next = state.queue.catch(() => {}).then(operation)
    state.queue = next.then(
      () => {},
      () => {},
    )
    return next
  }

  function disposeScope(scope) {
    if (scope === undefined || scope === null) return
    const candidates = [() => scope.dispose?.(), () => scope.fiber?.dispose?.()]
    for (const candidate of candidates) {
      try {
        candidate()
        return
      } catch (_error) {
        /* try the next disposal shape */
      }
    }
  }

  function toolNamesOf(serverName) {
    const prefix = `mcp__${serverName}__`
    try {
      return ctx.tools
        .definitions()
        .map((definition) => definition.name)
        .filter((toolName) => toolName.startsWith(prefix))
        .sort()
    } catch (_error) {
      return []
    }
  }

  function mount(server) {
    const status = { phase: 'connecting', error: undefined }
    state.statuses.set(server.id, status)
    const record = { server, scope: undefined }
    const plugin = {
      name: `mcp-manager:${server.serverName}`,
      inject: ['tools'],
      apply: async (childCtx, config) => {
        let bridge
        try {
          bridge = await loadMcpClient()
        } catch (error) {
          status.phase = 'error'
          status.error = errorMessage(error)
          ctx.logger.warn(`mcp-manager: ${server.serverName}: ${status.error}`)
          return
        }
        try {
          await bridge.apply(childCtx, config)
          status.phase = 'connected'
          status.error = undefined
          ctx.logger.info(`mcp-manager: ${server.serverName} connected`)
        } catch (error) {
          status.phase = 'error'
          status.error = errorMessage(error)
          ctx.logger.warn(`mcp-manager: ${server.serverName} failed: ${status.error}`)
        }
      },
    }
    try {
      record.scope = ctx.plugin(plugin, toMcpConfig(server))
    } catch (error) {
      status.phase = 'error'
      status.error = errorMessage(error)
      ctx.logger.warn(`mcp-manager: ${server.serverName} could not start: ${status.error}`)
    }
    state.mounts.set(server.id, record)
  }

  function unmount(id) {
    const record = state.mounts.get(id)
    if (record === undefined) return
    state.mounts.delete(id)
    state.statuses.delete(id)
    disposeScope(record.scope)
  }

  /** Bring live connections in line with the saved definitions. */
  function reconcile() {
    const wanted = new Map(state.servers.map((server) => [server.id, server]))
    for (const id of [...state.mounts.keys()]) {
      const server = wanted.get(id)
      if (server === undefined || !server.enabled) {
        unmount(id)
        continue
      }
      const record = state.mounts.get(id)
      if (record !== undefined && !sameConnection(record.server, server)) unmount(id)
    }
    for (const server of state.servers) {
      if (state.mounts.has(server.id)) continue
      if (!server.enabled) {
        state.statuses.set(server.id, { phase: 'disabled', error: undefined })
        continue
      }
      mount(server)
    }
  }

  function describe(server) {
    const mounted = state.mounts.get(server.id)
    const status = state.statuses.get(server.id)
    const tools = mounted === undefined ? [] : toolNamesOf(server.serverName)
    let phase = 'disabled'
    if (server.enabled) {
      if (mounted === undefined) phase = 'stopped'
      else if (status?.phase === 'error') phase = 'error'
      else if (status?.phase === 'connected') phase = 'connected'
      else phase = 'connecting'
    }
    const shape = {
      ...publicServer(server),
      target: targetOf(server),
      phase,
      tools,
    }
    if (typeof status?.error === 'string') shape.error = status.error
    return shape
  }

  function snapshot() {
    return {
      storePath: storeFilePath(),
      mcpClient: state.mcp === null ? { available: false, error: state.mcpError } : { available: true },
      servers: state.servers.map(describe),
    }
  }

  async function list() {
    await ensureLoaded()
    return snapshot()
  }

  async function save(input) {
    return exclusive(async () => {
      await ensureLoaded()
      const id = typeof input.id === 'string' && input.id.length > 0 ? input.id : undefined
      const existing = id === undefined ? undefined : state.servers.find((server) => server.id === id)
      if (id !== undefined && existing === undefined) throw new BadRequest(`Unknown MCP connection "${id}"`)
      const definition = isRecord(input.server) ? input.server : input
      const server = normalizeServerInput(definition, existing)
      const clash = state.servers.find((other) => other.id !== server.id && other.serverName === server.serverName)
      if (clash !== undefined) throw new BadRequest(`Server name "${server.serverName}" is already used by "${clash.id}"`)
      if (existing === undefined) state.servers = [...state.servers, server]
      else state.servers = state.servers.map((other) => (other.id === server.id ? server : other))
      await persist()
      reconcile()
      const result = snapshot()
      result.savedId = server.id
      return result
    })
  }

  async function remove(id) {
    return exclusive(async () => {
      await ensureLoaded()
      if (typeof id !== 'string' || id.length === 0) throw new BadRequest('id is required')
      const existing = state.servers.find((server) => server.id === id)
      if (existing === undefined) throw new BadRequest(`Unknown MCP connection "${id}"`)
      unmount(id)
      state.servers = state.servers.filter((server) => server.id !== id)
      await persist()
      return snapshot()
    })
  }

  async function setEnabled(id, enabled) {
    return exclusive(async () => {
      await ensureLoaded()
      if (typeof id !== 'string' || id.length === 0) throw new BadRequest('id is required')
      if (typeof enabled !== 'boolean') throw new BadRequest('enabled must be a boolean')
      const existing = state.servers.find((server) => server.id === id)
      if (existing === undefined) throw new BadRequest(`Unknown MCP connection "${id}"`)
      const next = { ...existing, enabled }
      state.servers = state.servers.map((server) => (server.id === id ? next : server))
      await persist()
      reconcile()
      return snapshot()
    })
  }

  /** Connect a draft connection once, report its tool list, and tear it down. */
  async function test(input) {
    const draft = isRecord(input.server) ? input.server : input
    const candidate = normalizeServerInput(draft, undefined)
    const bridge = await loadMcpClient()
    const probeName = `probe_${randomUUID().replace(/-/g, '').slice(0, 20)}`
    const config = toMcpConfig({ ...candidate, serverName: probeName })
    let settle
    const settled = new Promise((resolve) => {
      settle = resolve
    })
    const plugin = {
      name: 'mcp-manager:probe',
      inject: ['tools'],
      apply: async (childCtx) => {
        try {
          await bridge.apply(childCtx, config)
          settle({ ok: true })
        } catch (error) {
          settle({ ok: false, error: errorMessage(error) })
        }
      },
    }
    const scope = ctx.plugin(plugin)
    let timer
    const timedOut = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: `Timed out after ${PROBE_TIMEOUT_MS} ms` }), PROBE_TIMEOUT_MS)
    })
    let result
    try {
      result = await Promise.race([settled, timedOut])
      if (result.ok) {
        const prefix = `mcp__${probeName}__`
        result.tools = toolNamesOf(probeName).map((toolName) => toolName.slice(prefix.length))
      }
    } finally {
      clearTimeout(timer)
      disposeScope(scope)
    }
    return result
  }

  const endpoints = {
    list: () => list(),
    save: (payload) => save(payload),
    remove: (payload) => remove(payload.id),
    setEnabled: (payload) => setEnabled(payload.id, payload.enabled),
    test: (payload) => test(payload),
  }

  ctx.inject(['connection'], (scope) => {
    const connection = scope.get('connection')
    for (const endpoint of Object.keys(endpoints)) {
      const route = routeFor(endpoint, endpoints[endpoint])
      scope.effect(() => connection.fetch.register(route), `mcp-manager: /api/${ENDPOINT_PREFIX}${endpoint} route`)
    }
  })

  const toolDefinition = {
    name: 'mcp_connections',
    description:
      'Manage the Model Context Protocol (MCP) server connections of this Harness installation — the same list shown in Settings → MCP. ' +
      'Actions: "list" returns every configured connection with its live status and tool names; "add" creates one (pass `server`); ' +
      '"update" replaces one (pass `id` and `server`); "remove" deletes one (pass `id`); "enable"/"disable" toggle one (pass `id`); ' +
      '"test" connects a draft `server` once and reports the tools it exposes. A connection definition is ' +
      '`{ serverName, transport: "streamable-http" | "stdio", url? | command?/args?/env?/cwd?, headers?, toolCallTimeoutMs?, enabled? }`; ' +
      '`serverName` becomes the tool-name prefix `mcp__<serverName>__<tool>`. Saved changes apply immediately.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add', 'update', 'remove', 'enable', 'disable', 'test'],
          description: 'Operation to perform.',
        },
        id: {
          type: 'string',
          description: 'Connection id from "list"; required for update, remove, enable, and disable.',
        },
        server: {
          type: 'object',
          additionalProperties: true,
          description:
            'Connection definition for add, update, and test: { serverName, transport, url?, headers?, command?, args?, env?, cwd?, toolCallTimeoutMs?, enabled? }.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderToolResult(value) }],
    },
    execute: async (args) => {
      const action = isRecord(args) ? args.action : undefined
      switch (action) {
        case 'list':
          return list()
        case 'add':
          return save({ server: args.server })
        case 'update': {
          if (typeof args.id !== 'string' || args.id.length === 0) throw new Error('id is required for update')
          return save({ id: args.id, server: args.server })
        }
        case 'remove': {
          if (typeof args.id !== 'string' || args.id.length === 0) throw new Error('id is required for remove')
          return remove(args.id)
        }
        case 'enable':
        case 'disable': {
          if (typeof args.id !== 'string' || args.id.length === 0) throw new Error(`id is required for ${action}`)
          return setEnabled(args.id, action === 'enable')
        }
        case 'test':
          return test({ server: args.server })
        default:
          throw new Error(`Unknown action ${JSON.stringify(action)}; use list, add, update, remove, enable, disable, or test`)
      }
    },
  }

  ctx.effect(() => ctx.tools.register(toolDefinition), 'mcp-manager: mcp_connections tool')
  ctx.effect(
    () => () => {
      for (const id of [...state.mounts.keys()]) unmount(id)
    },
    'mcp-manager: mounted connections',
  )

  try {
    await ensureLoaded()
    reconcile()
  } catch (error) {
    state.loaded = Promise.resolve()
    ctx.logger.error(`mcp-manager: cannot load stored connections: ${errorMessage(error)}`)
  }
}
