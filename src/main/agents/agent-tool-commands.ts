import type { CapabilityRegistry } from '../tool-control/capability-registry'
import type { ToolCommandContext, ToolCommandDispatcher } from '../tool-control/command-dispatcher'
import type { AgentApplication } from './agent-application'
import type { AgentManager } from './agent-manager'

interface AgentToolCommandOptions {
  application: AgentApplication
  capabilities: CapabilityRegistry
  commands: ToolCommandDispatcher
  manager: AgentManager
}

const identifier = (payload: Record<string, unknown>, key: string): string => {
  const value = payload[key]
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError(`Invalid ${key}`)
  }
  return value
}

const name = (payload: Record<string, unknown>): string => {
  const value = payload.name
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 80) {
    throw new TypeError('Invalid name')
  }
  return value
}

const assertAgentTarget = (
  context: ToolCommandContext,
  capabilities: CapabilityRegistry,
  targetId: string,
  scope: 'task' | 'workspace',
): void => {
  if (context.authorization.kind === 'external') return
  const binding = capabilities.resolve(context.authorization.capability)
  if (!binding || (scope === 'task' ? binding.taskId !== targetId : binding.workspaceId !== targetId)) {
    throw new TypeError(`Target is outside the current Agent ${scope}`)
  }
}

export const registerAgentToolCommands = ({
  application,
  capabilities,
  commands,
  manager,
}: AgentToolCommandOptions): void => {
  commands.register(
    'task.create',
    (payload: Record<string, unknown>, context: ToolCommandContext): Promise<AgentLaunch> => {
      const workspaceId = identifier(payload, 'workspaceId')
      assertAgentTarget(context, capabilities, workspaceId, 'workspace')
      return application.createTask(workspaceId, name(payload))
    },
  )
  commands.register('task.rename', (payload: Record<string, unknown>, context: ToolCommandContext): Task => {
    const taskId = identifier(payload, 'taskId')
    const visible = context.context.projects.some((project: ToolContextProject): boolean =>
      project.workspaces.some((workspace: ToolContextWorkspace): boolean =>
        workspace.tasks.some((task: ToolContextTask): boolean => task.id === taskId),
      ),
    )
    if (!visible) throw new TypeError('Target is outside the current Agent workspace')
    return application.renameTask(taskId, name(payload))
  })
  commands.register('agent.bind', (payload: Record<string, unknown>, context: ToolCommandContext): Task => {
    if (context.authorization.kind !== 'agent') {
      throw new TypeError('agent bind requires an Agent capability')
    }
    return manager.bind(context.authorization.capability, identifier(payload, 'sessionId'))
  })
  const taskOperation =
    (
      operation: (taskId: string) => Promise<object | null> | object | null,
    ): ((payload: Record<string, unknown>, context: ToolCommandContext) => Promise<object | null> | object | null) =>
    (payload: Record<string, unknown>, context: ToolCommandContext): Promise<object | null> | object | null => {
      const taskId = identifier(payload, 'taskId')
      assertAgentTarget(context, capabilities, taskId, 'task')
      return operation(taskId)
    }
  commands.register('agent.start', taskOperation(application.start))
  commands.register('agent.resume', taskOperation(application.resume))
  commands.register(
    'agent.stop',
    taskOperation((taskId: string): null => {
      application.stop(taskId)
      return null
    }),
  )
  commands.register('agent.fork', taskOperation(application.fork))
}
import type { AgentLaunch, Task } from '../../shared/agent-contract'
import type { ToolContextProject, ToolContextTask, ToolContextWorkspace } from '../../shared/tool-protocol'
