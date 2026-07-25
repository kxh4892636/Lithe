import type { AdapterVersion, AgentLaunch, Task } from '../../shared/agent-contract'
import type { Workspace } from '../../shared/app-contract'
import type { AppDatabase } from '../database/app-database'
import type { TaskService } from '../tasks/task-service'
import type { AgentManager } from './agent-manager'

interface AgentApplicationOptions {
  database: AppDatabase
  createScratchWorkspace?: () => Workspace
  inspectAvailability: (adapter: AdapterVersion) => Promise<{ forkAvailable: boolean; resumeAvailable: boolean }>
  manager: AgentManager
  removeScratchWorkspace?: (workspace: Workspace) => void
  tasks: TaskService
}

export interface AgentApplication {
  createTask: (workspaceId: string | null, name: string) => Promise<AgentLaunch>
  fork: (taskId: string) => Promise<AgentLaunch>
  renameTask: (taskId: string, name: string) => Task
  resume: (taskId: string) => Promise<AgentLaunch>
  start: (taskId: string) => AgentLaunch
  stop: (taskId: string) => void
}

export const createAgentApplication = ({
  database,
  createScratchWorkspace = (): Workspace => {
    throw new TypeError('Temporary workspace creation is unavailable')
  },
  inspectAvailability,
  manager,
  removeScratchWorkspace = (): void => undefined,
  tasks,
}: AgentApplicationOptions): AgentApplication => ({
  createTask: async (workspaceId: string | null, name: string): Promise<AgentLaunch> => {
    const scratch = workspaceId ? undefined : createScratchWorkspace()
    try {
      const task = await tasks.create({ workspaceId: workspaceId ?? scratch?.id ?? '', name })
      return manager.launch(task.id, 'start')
    } catch (error: unknown) {
      if (scratch) removeScratchWorkspace(scratch)
      throw error
    }
  },
  fork: async (taskId: string): Promise<AgentLaunch> => {
    const source = database.tasks.get(taskId)
    if (!source) throw new TypeError('Task does not exist')
    if (!source.agentSessionId) throw new TypeError('Task Agent session is not bound')
    const adapter = database.adapters.getVersion(source.adapterVersionId)
    if (!adapter?.definition.fork) throw new TypeError('Adapter does not support fork')
    if (!(await inspectAvailability(adapter)).forkAvailable) {
      throw new TypeError('Installed Adapter version does not support fork')
    }
    const forked = tasks.createPinned(
      { workspaceId: source.workspaceId, name: tasks.nextForkName(source) },
      source.adapterVersionId,
    )
    return manager.launch(forked.id, 'fork', source.agentSessionId)
  },
  renameTask: (taskId: string, name: string): Task => {
    const task = database.tasks.get(taskId)
    if (!task) throw new TypeError('Task does not exist')
    return tasks.rename(task, name)
  },
  resume: async (taskId: string): Promise<AgentLaunch> => {
    const task = database.tasks.get(taskId)
    if (!task) throw new TypeError('Task does not exist')
    const adapter = database.adapters.getVersion(task.adapterVersionId)
    if (!adapter?.definition.resume || !(await inspectAvailability(adapter)).resumeAvailable) {
      throw new TypeError('Installed Adapter version does not support resume')
    }
    return manager.launch(taskId, 'resume')
  },
  start: (taskId: string): AgentLaunch => manager.launch(taskId, 'start'),
  stop: (taskId: string): void => manager.stop(taskId),
})
