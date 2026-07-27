import type { AdapterVersion, Task } from '../../shared/agent-contract'
import type { Workspace } from '../../shared/app-contract'

interface CreateTaskInput {
  adapterId?: string
  name: string
  workspaceId: string
}

interface TaskServiceOptions {
  createId: () => string
  getAdapter: (adapterId: string) => AdapterVersion | undefined
  getDefaultAdapter: () => AdapterVersion | undefined
  getWorkspace: (workspaceId: string) => Workspace | undefined
  incrementAdapterUsage: (adapterId: string) => void
  isAdapterAvailable: (adapter: AdapterVersion) => Promise<boolean>
  now: () => Date
  saveTask: (task: Task) => void
  updateTask: (taskId: string, name: string) => Task
}

export interface TaskService {
  create: (input: CreateTaskInput) => Promise<Task>
  createPinned: (input: CreateTaskInput, adapter: Pick<AdapterVersion, 'adapterId' | 'version'>) => Task
  rename: (task: Task, name: string) => Task
}

export const createTaskService = (options: TaskServiceOptions): TaskService => {
  const normalizeName = (name: string): string => {
    if (!name.trim()) throw new TypeError('Task name is required')
    return name.trim()
  }
  const createPinned = (input: CreateTaskInput, adapter: Pick<AdapterVersion, 'adapterId' | 'version'>): Task => {
    if (!options.getWorkspace(input.workspaceId)) throw new TypeError('Workspace does not exist')
    const task: Task = {
      id: options.createId(),
      workspaceId: input.workspaceId,
      name: normalizeName(input.name),
      adapterId: adapter.adapterId,
      adapterVersion: adapter.version,
      agentStatus: 'closed',
      agentSessionId: null,
      archivedAt: null,
      createdAt: options.now(),
      isUnread: false,
      lifecycle: 'active',
      lastAttentionAt: null,
      lastViewedAt: null,
      shouldAutoRestore: true,
    }
    options.saveTask(task)
    return task
  }

  return {
    create: async ({ adapterId, name, workspaceId }: CreateTaskInput): Promise<Task> => {
      const adapter = adapterId ? options.getAdapter(adapterId) : options.getDefaultAdapter()
      if (!adapter) {
        throw new TypeError(adapterId ? 'Adapter does not exist' : 'Default Adapter is not configured')
      }
      if (!(await options.isAdapterAvailable(adapter))) {
        throw new TypeError(
          adapterId ? 'Adapter executable is unavailable' : 'Default Adapter executable is unavailable',
        )
      }
      const task = createPinned({ workspaceId, name }, adapter)
      options.incrementAdapterUsage(adapter.adapterId)
      return task
    },
    createPinned,
    rename: (task: Task, name: string): Task => options.updateTask(task.id, normalizeName(name)),
  }
}
