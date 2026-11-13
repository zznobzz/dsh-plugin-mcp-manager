/**
 * Minimal Model Context Protocol server used to verify the MCP connection
 * manager end to end: newline-delimited JSON-RPC over stdio, one `echo` tool.
 *
 * Usage: node test/mcp-demo-server.mjs
 */
import { createInterface } from 'node:readline'

const input = createInterface({ input: process.stdin, crlfDelay: Infinity })

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const TOOLS = [
  {
    name: 'echo',
    description: 'Echo the supplied text back to the caller.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo.' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
]

input.on('line', (line) => {
  const trimmed = line.trim()
  if (trimmed.length === 0) return
  let message
  try {
    message = JSON.parse(trimmed)
  } catch {
    return
  }
  if (message.method === undefined) return
  if (message.id === undefined) return
  switch (message.method) {
    case 'initialize': {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'mcp-demo', version: '1.0.0' },
        },
      })
      return
    }
    case 'tools/list': {
      send({ jsonrpc: '2.0', id: message.id, result: { tools: TOOLS } })
      return
    }
    case 'tools/call': {
      const text = message.params?.arguments?.text
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: { content: [{ type: 'text', text: `echo: ${typeof text === 'string' ? text : ''}` }] },
      })
      return
    }
    case 'ping': {
      send({ jsonrpc: '2.0', id: message.id, result: {} })
      return
    }
    default: {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `method not found: ${message.method}` } })
    }
  }
})
