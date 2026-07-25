import type { ToolRequest, ToolResponse } from '../../shared/tool-protocol'
import type { ToolContext } from '../../shared/tool-protocol'

interface ContextCommand {
  executeAgent: (capability: string) => ToolContext | undefined
  executeExternal: (token: string) => ToolContext | undefined
}

export interface ToolCommandDispatcher {
  dispatch: (request: ToolRequest, connectionId: string) => Promise<ToolResponse>
}

export const createToolCommandDispatcher = (context: ContextCommand): ToolCommandDispatcher => ({
  dispatch: async (request: ToolRequest, _connectionId: string): Promise<ToolResponse> => {
    if (request.command !== 'context') {
      return {
        id: request.id,
        ok: false,
        error: { code: 'UNKNOWN_COMMAND', message: 'Unknown command' },
      }
    }
    const data =
      request.authorization.kind === 'external'
        ? context.executeExternal(request.authorization.token)
        : context.executeAgent(request.authorization.capability)
    return data
      ? { id: request.id, ok: true, data }
      : {
          id: request.id,
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Capability is invalid or expired' },
        }
  },
})
