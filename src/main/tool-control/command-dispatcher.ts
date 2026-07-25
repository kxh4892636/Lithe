import { parseToolJson, type ToolContext, type ToolRequest, type ToolResponse } from '../../shared/tool-protocol'

interface ContextCommand {
  executeAgent: (capability: string) => ToolContext | undefined
  executeExternal: (token: string) => ToolContext | undefined
}

export interface ToolCommandDispatcher {
  dispatch: (request: ToolRequest, connectionId: string) => Promise<ToolResponse>
  register: (command: string, handler: ToolCommandHandler) => void
}

export interface ToolCommandContext {
  authorization: ToolRequest['authorization']
  context: ToolContext
}

export type ToolCommandHandler = (
  payload: Record<string, unknown>,
  context: ToolCommandContext,
) => Promise<object | null> | object | null

export const createToolCommandDispatcher = (context: ContextCommand): ToolCommandDispatcher => {
  const handlers = new Map<string, ToolCommandHandler>()
  return {
    dispatch: async (request: ToolRequest, _connectionId: string): Promise<ToolResponse> => {
      const authorizedContext =
        request.authorization.kind === 'external'
          ? context.executeExternal(request.authorization.token)
          : context.executeAgent(request.authorization.capability)
      if (!authorizedContext) {
        return {
          id: request.id,
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Capability is invalid or expired' },
        }
      }
      if (request.command === 'context') return { id: request.id, ok: true, data: parseToolJson(authorizedContext) }
      const handler = handlers.get(request.command)
      if (!handler) {
        return {
          id: request.id,
          ok: false,
          error: { code: 'UNKNOWN_COMMAND', message: 'Unknown command' },
        }
      }
      try {
        const result = await handler(request.payload ?? {}, {
          authorization: request.authorization,
          context: authorizedContext,
        })
        const data = parseToolJson(JSON.parse(JSON.stringify(result ?? null)))
        return { id: request.id, ok: true, data }
      } catch (error: unknown) {
        return {
          id: request.id,
          ok: false,
          error: {
            code: 'INVALID_REQUEST',
            message: error instanceof Error ? error.message : 'Invalid command payload',
          },
        }
      }
    },
    register: (command: string, handler: ToolCommandHandler): void => {
      if (command === 'context') throw new TypeError('context is reserved')
      handlers.set(command, handler)
    },
  }
}
