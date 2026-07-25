import { randomUUID } from 'node:crypto'
import { connect } from 'node:net'

import {
  parseToolResponse,
  parseToolContext,
  serializeToolResponse,
  toolMessageMaxBytes,
  toolProtocolVersion,
  type ToolRequest,
  type ToolResponse,
  type ToolContext,
} from '../shared/tool-protocol'

export interface ToolClientOptions {
  authorization: ToolRequest['authorization']
  command: string
  endpoint: string
  payload?: Record<string, unknown>
  timeoutMilliseconds?: number
}

const unavailable = (): ToolResponse => ({
  id: null,
  ok: false,
  error: { code: 'LITHE_NOT_RUNNING', message: 'Lithe is not running' },
})

export const requestTool = ({
  authorization,
  command,
  endpoint,
  payload,
  timeoutMilliseconds = 5_000,
}: ToolClientOptions): Promise<ToolResponse> =>
  new Promise((resolve: (value: ToolResponse) => void): void => {
    const socket = connect(endpoint)
    const request: ToolRequest = {
      version: toolProtocolVersion,
      id: randomUUID(),
      command,
      authorization,
      ...(payload ? { payload } : {}),
    }
    let buffer = Buffer.alloc(0)
    let settled = false

    const finish = (response: ToolResponse): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(response)
    }
    const timer = setTimeout(
      (): void =>
        finish({
          id: request.id,
          ok: false,
          error: { code: 'REQUEST_TIMEOUT', message: 'Lithe did not respond in time' },
        }),
      timeoutMilliseconds,
    )

    socket.once('connect', (): void => {
      socket.write(`${JSON.stringify(request)}\n`)
    })
    socket.on('data', (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.byteLength > toolMessageMaxBytes) {
        finish({
          id: request.id,
          ok: false,
          error: { code: 'INVALID_REQUEST', message: 'Response is too large' },
        })
        return
      }
      const newline = buffer.indexOf(0x0a)
      if (newline < 0) return
      try {
        const response = parseToolResponse(JSON.parse(buffer.subarray(0, newline).toString('utf8')))
        if (response.id !== request.id) throw new TypeError('Response identifier does not match request')
        finish(response)
      } catch {
        finish({
          id: request.id,
          ok: false,
          error: { code: 'INVALID_REQUEST', message: 'Lithe returned invalid JSON' },
        })
      }
    })
    socket.once('error', (error: NodeJS.ErrnoException): void => {
      if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED' || error.code === 'EPIPE') {
        finish(unavailable())
        return
      }
      finish({
        id: request.id,
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Unable to connect to Lithe' },
      })
    })
  })

export const requestContext = (
  options: Omit<ToolClientOptions, 'command' | 'payload'>,
): Promise<ToolResponse<ToolContext>> =>
  requestTool({ ...options, command: 'context' }).then((response): ToolResponse<ToolContext> => {
    if (!response.ok) return response
    return { ...response, data: parseToolContext(response.data) }
  })

export const responseToStdout = <T>(response: ToolResponse<T>): string => serializeToolResponse(response)
