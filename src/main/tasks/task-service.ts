import type { AdapterVersion, Task } from '../../shared/agent-contract'
import type { Workspace } from '../../shared/app-contract'

interface CreateTaskInput {
  name: string
  workspaceId: string
}

interface TaskServiceOptions {
  createId: () => string
  getDefaultAdapter: () => AdapterVersion | undefined
  getWorkspace: (workspaceId: string) => Workspace | undefined
  isAdapterAvailable: (adapter: AdapterVersion) => Promise<boolean>
  listTasks: (workspaceId: string) => Task[]
  now: () => Date
  saveTask: (task: Task) => void
  updateTask: (taskId: string, name: string) => Task
}

export interface TaskService {
  create: (input: CreateTaskInput) => Promise<Task>
  createPinned: (input: CreateTaskInput, adapterVersionId: string) => Task
  nextForkName: (source: Task) => string
  rename: (task: Task, name: string) => Task
}

const normalizeName = (name: string): string => name.trim().toLocaleLowerCase()

export const createTaskService = (options: TaskServiceOptions): TaskService => {
  const assertUnique = (workspaceId: string, name: string, exceptTaskId?: string): string => {
    const normalized = normalizeName(name)
    if (!normalized) throw new TypeError('Task name is required')
    const duplicate = options
      .listTasks(workspaceId)
      .some((task: Task): boolean => task.id !== exceptTaskId && normalizeName(task.name) === normalized)
    if (duplicate) throw new TypeError('Task name already exists')
    return name.trim()
  }
  const createPinned = (input: CreateTaskInput, adapterVersionId: string): Task => {
    if (!options.getWorkspace(input.workspaceId)) throw new TypeError('Workspace does not exist')
    const task: Task = {
      id: options.createId(),
      workspaceId: input.workspaceId,
      name: assertUnique(input.workspaceId, input.name),
      adapterVersionId,
      agentSessionId: null,
      createdAt: options.now(),
    }
    options.saveTask(task)
    return task
  }

  return {
    create: async ({ name, workspaceId }: CreateTaskInput): Promise<Task> => {
      const adapter = options.getDefaultAdapter()
      if (!adapter) throw new TypeError('Default Adapter is not configured')
      if (!(await options.isAdapterAvailable(adapter))) {
        throw new TypeError('Default Adapter executable is unavailable')
      }
      return createPinned({ workspaceId, name }, adapter.id)
    },
    createPinned,
    nextForkName: (source: Task): string => {
      const occupied = new Set(
        options.listTasks(source.workspaceId).map((task: Task): string => normalizeName(task.name)),
      )
      for (let suffix = 1; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
        const candidate = `${source.name}-${suffix}`
        if (!occupied.has(normalizeName(candidate))) return candidate
      }
      throw new TypeError('Unable to allocate fork task name')
    },
    rename: (task: Task, name: string): Task =>
      options.updateTask(task.id, assertUnique(task.workspaceId, name, task.id)),
  }
}
