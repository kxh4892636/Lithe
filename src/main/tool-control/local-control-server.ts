import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, rmSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { dirname } from 'node:path'

import {
  parseToolRequest,
  serializeToolResponse,
  toolMessageMaxBytes,
  type ToolResponse,
} from '../../shared/tool-protocol'
import type { ToolCommandDispatcher } from './command-dispatcher'

interface LocalControlServerOptions {
  dispatcher: ToolCommandDispatcher
  endpoint: string
  onDisconnect?: (connectionId: string) => void
  onSocketError?: (error: Error) => void
  platform?: NodeJS.Platform
}

export interface LocalControlServer {
  close: () => Promise<void>
  listen: () => Promise<void>
}

const failure = (
  code: 'INTERNAL_ERROR' | 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'UNKNOWN_COMMAND',
  message: string,
  id: string | null = null,
): ToolResponse => ({ id, ok: false, error: { code, message } })

const closeServer = (server: Server): Promise<void> =>
  new Promise<void>((resolve: () => void): void => {
    server.close((): void => resolve())
  })

interface ConnectionHandlerOptions {
  dispatcher: ToolCommandDispatcher
  onDisconnect: (connectionId: string) => void
  onSocketError: (error: Error) => void
  sockets: Set<Socket>
}

const createConnectionHandler =
  ({ dispatcher, onDisconnect, onSocketError, sockets }: ConnectionHandlerOptions): ((socket: Socket) => void) =>
  (socket: Socket): void => {
    const connectionId = randomUUID()
    sockets.add(socket)
    let buffer = Buffer.alloc(0)
    let answered = false
    let processing = false

    const answer = (response: ToolResponse): void => {
      if (answered || socket.destroyed) return
      answered = true
      const serialized = serializeToolResponse(response)
      socket.end(
        Buffer.byteLength(serialized, 'utf8') <= toolMessageMaxBytes
          ? serialized
          : serializeToolResponse(failure('INTERNAL_ERROR', 'Response is too large', response.id)),
      )
    }

    socket.on('data', (chunk: Buffer): void => {
      if (answered || processing) return
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.byteLength > toolMessageMaxBytes) {
        answer(failure('INVALID_REQUEST', 'Request is too large'))
        return
      }
      const newline = buffer.indexOf(0x0a)
      if (newline < 0) return
      try {
        const request = parseToolRequest(JSON.parse(buffer.subarray(0, newline).toString('utf8')) as unknown)
        processing = true
        void dispatcher
          .dispatch(request, connectionId)
          .then(answer)
          .catch((): void => answer(failure('INTERNAL_ERROR', 'Command failed', request.id)))
      } catch {
        answer(failure('INVALID_REQUEST', 'Invalid request'))
      }
    })
    socket.on('error', onSocketError)
    socket.on('close', (): void => {
      sockets.delete(socket)
      onDisconnect(connectionId)
    })
    socket.setTimeout(185_000, (): void => {
      socket.destroy()
    })
  }

export const createLocalControlServer = ({
  dispatcher,
  endpoint,
  onDisconnect = (): void => undefined,
  onSocketError = (): void => undefined,
  platform = process.platform,
}: LocalControlServerOptions): LocalControlServer => {
  let server: Server | undefined
  const sockets = new Set<Socket>()
  const handleConnection = createConnectionHandler({
    dispatcher,
    onDisconnect,
    onSocketError,
    sockets,
  })

  return {
    listen: async (): Promise<void> => {
      if (server) return
      if (platform !== 'win32') {
        mkdirSync(dirname(endpoint), { recursive: true, mode: 0o700 })
        chmodSync(dirname(endpoint), 0o700)
        rmSync(endpoint, { force: true })
      }
      server = createServer(handleConnection)
      server.maxConnections = 32
      try {
        await new Promise<void>((resolve: () => void, reject: (reason?: unknown) => void): void => {
          server?.once('error', reject)
          server?.listen(endpoint, (): void => {
            server?.removeListener('error', reject)
            try {
              if (platform !== 'win32') chmodSync(endpoint, 0o600)
              resolve()
            } catch (error: unknown) {
              reject(error)
            }
          })
        })
      } catch (error: unknown) {
        const failedServer = server
        server = undefined
        if (failedServer) await closeServer(failedServer)
        if (platform !== 'win32') rmSync(endpoint, { force: true })
        throw error
      }
    },
    close: async (): Promise<void> => {
      for (const socket of sockets) socket.destroy()
      if (server) {
        const closing = server
        server = undefined
        await closeServer(closing)
      }
      if (platform !== 'win32') rmSync(endpoint, { force: true })
    },
  }
}
