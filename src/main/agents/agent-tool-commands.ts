import type { TaskStateService } from '../tasks/task-state-service'
import type { CapabilityRegistry } from '../tool-control/capability-registry'
import {
  ToolCommandError,
  type ToolCommandContext,
  type ToolCommandDispatcher,
} from '../tool-control/command-dispatcher'
import type { AgentApplication } from './agent-application'
import type { AgentManager } from './agent-manager'

interface AgentToolCommandOptions {
  application: AgentApplication
  capabilities: CapabilityRegistry
  commands: ToolCommandDispatcher
  deleteTask?: (task: Task) => Promise<void>
  isTaskVisible?: (taskId: string) => boolean
  manager: AgentManager
  onBackgroundLaunch?: (launch: AgentLaunch, afterTaskId?: string) => void
  requestDeleteApproval?: (context: ToolCommandContext, task: Task) => Promise<'approved' | 'rejected' | 'timed-out'>
  states?: TaskStateService
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
  deleteTask = async (): Promise<void> => undefined,
  isTaskVisible = (): boolean => false,
  manager,
  onBackgroundLaunch = (): void => undefined,
  requestDeleteApproval = async (): Promise<'rejected'> => 'rejected',
  states,
}: AgentToolCommandOptions): void => {
  commands.register(
    'task.create',
    async (payload: Record<string, unknown>, context: ToolCommandContext): Promise<AgentLaunch> => {
      const workspaceId =
        typeof payload.workspaceId === 'string'
          ? identifier(payload, 'workspaceId')
          : context.authorization.kind === 'agent'
            ? capabilities.resolve(context.authorization.capability)?.workspaceId
            : null
      if (context.authorization.kind === 'agent' && !workspaceId) {
        throw new TypeError('Capability is invalid or expired')
      }
      if (workspaceId) assertAgentTarget(context, capabilities, workspaceId, 'workspace')
      const adapterId = payload.adapterId === undefined ? undefined : identifier(payload, 'adapterId')
      const launch = await application.createTask(workspaceId ?? null, name(payload), adapterId)
      onBackgroundLaunch(launch)
      return launch
    },
  )
  commands.register('task.rename', (payload: Record<string, unknown>, context: ToolCommandContext): Task => {
    const taskId = identifier(payload, 'taskId')
    const visible =
      context.context.projects.some((project: ToolContextProject): boolean =>
        project.workspaces.some((workspace: ToolContextWorkspace): boolean =>
          workspace.tasks.some((task: ToolContextTask): boolean => task.id === taskId),
        ),
      ) ||
      context.context.scratchWorkspaces.some((workspace: ToolContextWorkspace): boolean =>
        workspace.tasks.some((task: ToolContextTask): boolean => task.id === taskId),
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
  commands.register(
    'agent.fork',
    taskOperation(async (taskId: string): Promise<AgentLaunch> => {
      const launch = await application.fork(taskId)
      onBackgroundLaunch(launch, taskId)
      return launch
    }),
  )
  if (!states) return

  const taskStateOperation =
    (
      operation: (
        taskId: string,
        context: ToolCommandContext,
        payload: Record<string, unknown>,
      ) => object | null | Promise<object | null>,
    ): ((payload: Record<string, unknown>, context: ToolCommandContext) => object | null | Promise<object | null>) =>
    (payload: Record<string, unknown>, context: ToolCommandContext): object | null | Promise<object | null> => {
      const taskId =
        context.authorization.kind === 'agent'
          ? capabilities.resolve(context.authorization.capability)?.taskId
          : identifier(payload, 'taskId')
      if (!taskId) throw new TypeError('Capability is invalid or expired')
      assertAgentTarget(context, capabilities, taskId, 'task')
      return operation(taskId, context, payload)
    }

  commands.register(
    'task.unread',
    taskStateOperation((taskId: string): Task => states.markUnread(taskId, isTaskVisible(taskId))),
  )
  const currentAgentStateOperation =
    (operation: (taskId: string) => Task): ((payload: Record<string, unknown>, context: ToolCommandContext) => Task) =>
    (payload: Record<string, unknown>, context: ToolCommandContext): Task => {
      if (context.authorization.kind !== 'agent') {
        throw new TypeError('Task Agent state requires an Agent capability')
      }
      if (Object.keys(payload).length > 0) throw new TypeError('Task Agent state commands do not accept parameters')
      const binding = capabilities.resolve(context.authorization.capability)
      if (!binding) throw new TypeError('Capability is invalid or expired')
      return operation(binding.taskId)
    }
  commands.register(
    'task.running',
    currentAgentStateOperation((taskId: string): Task => states.markRunning(taskId)),
  )
  commands.register(
    'task.idle',
    currentAgentStateOperation((taskId: string): Task => states.markIdle(taskId)),
  )
  commands.register(
    'task.archive',
    taskStateOperation((taskId: string): Task => states.archive(taskId)),
  )
  commands.register(
    'task.delete',
    taskStateOperation(async (taskId: string, context: ToolCommandContext): Promise<null> => {
      const decision = await requestDeleteApproval(context, states.get(taskId))
      if (decision === 'timed-out') throw new ToolCommandError('APPROVAL_TIMEOUT', 'Task deletion approval timed out')
      if (decision !== 'approved') throw new ToolCommandError('USER_REJECTED', 'Task deletion was rejected')
      await deleteTask(states.get(taskId))
      return null
    }),
  )
}
import type { AgentLaunch, Task } from '../../shared/agent-contract'
import type { ToolContextProject, ToolContextTask, ToolContextWorkspace } from '../../shared/tool-protocol'
