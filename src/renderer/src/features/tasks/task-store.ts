import { create, type StoreApi } from 'zustand'

import type { AgentLaunch, BackgroundAgentLaunch, Task, TaskChangeEvent } from '../../../../shared/app-contract'

export interface TaskState {
  activationErrorsByTask: Record<string, string | null>
  archivedTasks: Task[]
  backgroundPanels: BackgroundAgentLaunch[]
  deletedTaskIds: string[]
  error: string | null
  launchesByTask: Record<string, AgentLaunch>
  openTaskAfterId: string | null
  openTaskId: string | null
  panelRemovals: Array<{ taskId: string; workspaceId: string }>
  tasksByWorkspace: Record<string, Task[]>
  visibleTaskId: string | null
  activateTask: (taskId: string) => Promise<AgentLaunch | undefined>
  autoRestoreTask: (taskId: string) => Promise<AgentLaunch | undefined>
  addLaunch: (launch: AgentLaunch) => void
  addBackgroundLaunch: (event: BackgroundAgentLaunch) => void
  applyChange: (event: TaskChangeEvent) => void
  clearOpenTask: () => void
  consumePanelRemovals: (workspaceId: string) => void
  createTask: (workspaceId: string, name: string, adapterId?: string) => Promise<AgentLaunch>
  forkTask: (taskId: string) => Promise<AgentLaunch>
  archiveTask: (taskId: string) => Promise<void>
  deleteTask: (taskId: string) => Promise<boolean>
  hydrateArchived: () => Promise<void>
  hydrateWorkspace: (workspaceId: string) => Promise<void>
  openTask: (taskId: string) => void
  renameTask: (taskId: string, name: string) => Promise<Task>
  restoreTask: (taskId: string) => Promise<void>
  setVisibleTaskId: (taskId: string | null) => void
  stopTask: (taskId: string) => Promise<void>
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))
const upsertTask = (tasks: Task[], next: Task): Task[] =>
  tasks.some((task: Task): boolean => task.id === next.id)
    ? tasks.map((task: Task): Task => (task.id === next.id ? next : task))
    : [...tasks, next]

const pendingActivations = new Map<string, Promise<AgentLaunch | undefined>>()

const launchAgentTask = (
  taskId: string,
  set: StoreApi<TaskState>['setState'],
  get: StoreApi<TaskState>['getState'],
): Promise<AgentLaunch | undefined> => {
  const existingRequest = pendingActivations.get(taskId)
  if (existingRequest) return existingRequest
  const request = (async (): Promise<AgentLaunch | undefined> => {
    const state = get()
    const task = Object.values(state.tasksByWorkspace)
      .flat()
      .find((candidate): boolean => candidate.id === taskId)
    if (!task) {
      set({ error: '任务不存在' })
      return undefined
    }
    const currentLaunch = state.launchesByTask[taskId]
    if (task.agentStatus !== 'closed') {
      set(
        (current): Partial<TaskState> => ({
          activationErrorsByTask: { ...current.activationErrorsByTask, [taskId]: null },
        }),
      )
      return currentLaunch
    }
    try {
      const launch = task.agentSessionId
        ? await window.lithe.agents.resume(taskId)
        : await window.lithe.agents.start(taskId)
      get().addLaunch(launch)
      set(
        (current): Partial<TaskState> => ({
          activationErrorsByTask: { ...current.activationErrorsByTask, [taskId]: launch.error },
        }),
      )
      return launch
    } catch (error: unknown) {
      set(
        (current): Partial<TaskState> => ({
          activationErrorsByTask: { ...current.activationErrorsByTask, [taskId]: errorMessage(error) },
        }),
      )
      throw error
    }
  })()
  pendingActivations.set(taskId, request)
  const clearPending = (): void => {
    if (pendingActivations.get(taskId) === request) pendingActivations.delete(taskId)
  }
  void request.then(clearPending, clearPending)
  return request
}

type TaskStoreSet = StoreApi<TaskState>['setState']
type TaskStoreGet = StoreApi<TaskState>['getState']

const createActivationActions = (
  set: TaskStoreSet,
  get: TaskStoreGet,
): Pick<
  TaskState,
  'activateTask' | 'addBackgroundLaunch' | 'addLaunch' | 'autoRestoreTask' | 'clearOpenTask' | 'consumePanelRemovals'
> => ({
  activateTask: async (taskId: string): Promise<AgentLaunch | undefined> => {
    set({ openTaskAfterId: null, openTaskId: taskId })
    return launchAgentTask(taskId, set, get)
  },
  autoRestoreTask: async (taskId: string): Promise<AgentLaunch | undefined> => {
    const shouldRestore = await window.lithe.agents.shouldRestore()
    return shouldRestore ? launchAgentTask(taskId, set, get) : undefined
  },
  // ADR 0069：addLaunch 只登记启动结果；打开/聚焦任务是由 activateTask 等
  // 同步发出的一次性命令，异步完成的启动不得回写选中状态抢占焦点。
  addLaunch: (launch: AgentLaunch): void => {
    set((state): Partial<TaskState> => {
      const existing = state.tasksByWorkspace[launch.task.workspaceId] ?? []
      return {
        launchesByTask: { ...state.launchesByTask, [launch.task.id]: launch },
        tasksByWorkspace: {
          ...state.tasksByWorkspace,
          [launch.task.workspaceId]: upsertTask(existing, launch.task),
        },
      }
    })
  },
  clearOpenTask: (): void => {
    set({ openTaskAfterId: null, openTaskId: null })
  },
  consumePanelRemovals: (workspaceId: string): void => {
    set(
      (state): Partial<TaskState> => ({
        panelRemovals: state.panelRemovals.filter((removal): boolean => removal.workspaceId !== workspaceId),
      }),
    )
  },
  addBackgroundLaunch: (event: BackgroundAgentLaunch): void => {
    set((state): Partial<TaskState> => {
      const existing = state.tasksByWorkspace[event.launch.task.workspaceId] ?? []
      return {
        backgroundPanels: [
          ...state.backgroundPanels.filter((candidate): boolean => candidate.launch.task.id !== event.launch.task.id),
          event,
        ],
        launchesByTask: { ...state.launchesByTask, [event.launch.task.id]: event.launch },
        tasksByWorkspace: {
          ...state.tasksByWorkspace,
          [event.launch.task.workspaceId]: upsertTask(existing, event.launch.task),
        },
      }
    })
  },
})

const createTaskChangeAction = (set: TaskStoreSet): Pick<TaskState, 'applyChange'> => ({
  applyChange: (event: TaskChangeEvent): void => {
    set((state): Partial<TaskState> => {
      if ('deletedTaskId' in event) {
        return {
          archivedTasks: state.archivedTasks.filter((task: Task): boolean => task.id !== event.deletedTaskId),
          deletedTaskIds: [...new Set([...state.deletedTaskIds, event.deletedTaskId])],
          tasksByWorkspace: {
            ...state.tasksByWorkspace,
            [event.workspaceId]: (state.tasksByWorkspace[event.workspaceId] ?? []).filter(
              (task: Task): boolean => task.id !== event.deletedTaskId,
            ),
          },
        }
      }
      if ('panelRemovedTaskId' in event) {
        return {
          panelRemovals: [
            ...state.panelRemovals.filter(
              (removal): boolean =>
                removal.taskId !== event.panelRemovedTaskId || removal.workspaceId !== event.workspaceId,
            ),
            { taskId: event.panelRemovedTaskId, workspaceId: event.workspaceId },
          ],
        }
      }
      const workspaceTasks = state.tasksByWorkspace[event.workspaceId] ?? []
      return event.lifecycle === 'archived'
        ? {
            archivedTasks: [event, ...state.archivedTasks.filter((task: Task): boolean => task.id !== event.id)],
            tasksByWorkspace: {
              ...state.tasksByWorkspace,
              [event.workspaceId]: workspaceTasks.filter((task: Task): boolean => task.id !== event.id),
            },
          }
        : {
            archivedTasks: state.archivedTasks.filter((task: Task): boolean => task.id !== event.id),
            tasksByWorkspace: {
              ...state.tasksByWorkspace,
              [event.workspaceId]: upsertTask(workspaceTasks, event),
            },
          }
    })
  },
})

const createAgentMutationActions = (set: TaskStoreSet): Pick<TaskState, 'createTask' | 'forkTask' | 'stopTask'> => ({
  createTask: async (workspaceId: string, name: string, adapterId?: string): Promise<AgentLaunch> => {
    try {
      const launch = await window.lithe.tasks.create(workspaceId, name, adapterId)
      set(
        (state): Partial<TaskState> => ({
          error: null,
          launchesByTask: { ...state.launchesByTask, [launch.task.id]: launch },
          openTaskAfterId: null,
          openTaskId: launch.task.id,
          tasksByWorkspace: {
            ...state.tasksByWorkspace,
            [workspaceId]: upsertTask(state.tasksByWorkspace[workspaceId] ?? [], launch.task),
          },
        }),
      )
      return launch
    } catch (error: unknown) {
      set({ error: errorMessage(error) })
      throw error
    }
  },
  forkTask: async (taskId: string): Promise<AgentLaunch> => {
    try {
      const launch = await window.lithe.agents.fork(taskId)
      set(
        (state): Partial<TaskState> => ({
          error: null,
          launchesByTask: { ...state.launchesByTask, [launch.task.id]: launch },
          openTaskAfterId: taskId,
          openTaskId: launch.task.id,
          tasksByWorkspace: {
            ...state.tasksByWorkspace,
            [launch.task.workspaceId]: upsertTask(state.tasksByWorkspace[launch.task.workspaceId] ?? [], launch.task),
          },
        }),
      )
      return launch
    } catch (error: unknown) {
      set({ error: errorMessage(error) })
      throw error
    }
  },
  stopTask: async (taskId: string): Promise<void> => {
    try {
      const stopped = await window.lithe.agents.stop(taskId)
      set((state): Partial<TaskState> => {
        const launch = state.launchesByTask[taskId]
        const tasks = state.tasksByWorkspace[stopped.workspaceId] ?? []
        return {
          error: null,
          launchesByTask: launch
            ? { ...state.launchesByTask, [taskId]: { ...launch, error: null, isOpen: false, task: stopped } }
            : state.launchesByTask,
          panelRemovals: [
            ...state.panelRemovals.filter(
              (removal): boolean => removal.taskId !== taskId || removal.workspaceId !== stopped.workspaceId,
            ),
            { taskId, workspaceId: stopped.workspaceId },
          ],
          tasksByWorkspace: {
            ...state.tasksByWorkspace,
            [stopped.workspaceId]: upsertTask(tasks, stopped),
          },
        }
      })
    } catch (error: unknown) {
      set({ error: errorMessage(error) })
      throw error
    }
  },
})

const createArchiveActions = (set: TaskStoreSet): Pick<TaskState, 'archiveTask' | 'deleteTask' | 'restoreTask'> => ({
  archiveTask: async (taskId: string): Promise<void> => {
    try {
      const archived = await window.lithe.tasks.archive(taskId)
      set(
        (state): Partial<TaskState> => ({
          archivedTasks: [archived, ...state.archivedTasks.filter((task: Task): boolean => task.id !== taskId)],
          error: null,
          openTaskId: state.openTaskId === taskId ? null : state.openTaskId,
          tasksByWorkspace: {
            ...state.tasksByWorkspace,
            [archived.workspaceId]: (state.tasksByWorkspace[archived.workspaceId] ?? []).filter(
              (task: Task): boolean => task.id !== taskId,
            ),
          },
        }),
      )
    } catch (error: unknown) {
      set({ error: errorMessage(error) })
      throw error
    }
  },
  deleteTask: async (taskId: string): Promise<boolean> => {
    try {
      const deleted = await window.lithe.tasks.delete(taskId)
      if (!deleted) return false
      set(
        (state): Partial<TaskState> => ({
          archivedTasks: state.archivedTasks.filter((task: Task): boolean => task.id !== taskId),
          deletedTaskIds: [...new Set([...state.deletedTaskIds, taskId])],
          error: null,
          openTaskId: state.openTaskId === taskId ? null : state.openTaskId,
          tasksByWorkspace: Object.fromEntries(
            Object.entries(state.tasksByWorkspace).map(([workspaceId, tasks]): [string, Task[]] => [
              workspaceId,
              tasks.filter((task: Task): boolean => task.id !== taskId),
            ]),
          ),
        }),
      )
      return true
    } catch (error: unknown) {
      set({ error: errorMessage(error) })
      throw error
    }
  },
  restoreTask: async (taskId: string): Promise<void> => {
    try {
      const restored = await window.lithe.tasks.restore(taskId)
      set(
        (state): Partial<TaskState> => ({
          archivedTasks: state.archivedTasks.filter((task: Task): boolean => task.id !== taskId),
          error: null,
          tasksByWorkspace: {
            ...state.tasksByWorkspace,
            [restored.workspaceId]: upsertTask(state.tasksByWorkspace[restored.workspaceId] ?? [], restored),
          },
        }),
      )
    } catch (error: unknown) {
      set({ error: errorMessage(error) })
      throw error
    }
  },
})

const createHydrationActions = (
  set: TaskStoreSet,
): Pick<TaskState, 'hydrateArchived' | 'hydrateWorkspace' | 'openTask' | 'renameTask'> => ({
  hydrateArchived: async (): Promise<void> => {
    try {
      set({ archivedTasks: await window.lithe.tasks.listArchived(), error: null })
    } catch (error: unknown) {
      set({ error: errorMessage(error) })
    }
  },
  hydrateWorkspace: async (workspaceId: string): Promise<void> => {
    try {
      const tasks = await window.lithe.tasks.list(workspaceId)
      set(
        (state): Partial<TaskState> => ({
          error: null,
          tasksByWorkspace: { ...state.tasksByWorkspace, [workspaceId]: tasks },
        }),
      )
    } catch (error: unknown) {
      set({ error: errorMessage(error) })
    }
  },
  openTask: (taskId: string): void => set({ openTaskAfterId: null, openTaskId: taskId }),
  renameTask: async (taskId: string, name: string): Promise<Task> => {
    try {
      const renamed = await window.lithe.tasks.rename(taskId, name)
      set(
        (state): Partial<TaskState> => ({
          archivedTasks: state.archivedTasks.map((task): Task => (task.id === taskId ? renamed : task)),
          error: null,
          tasksByWorkspace: {
            ...state.tasksByWorkspace,
            [renamed.workspaceId]: (state.tasksByWorkspace[renamed.workspaceId] ?? []).map(
              (task): Task => (task.id === taskId ? renamed : task),
            ),
          },
        }),
      )
      return renamed
    } catch (error: unknown) {
      set({ error: errorMessage(error) })
      throw error
    }
  },
})

export const useTaskStore = create<TaskState>(
  (set, get): TaskState => ({
    activationErrorsByTask: {},
    archivedTasks: [],
    backgroundPanels: [],
    deletedTaskIds: [],
    error: null,
    launchesByTask: {},
    openTaskAfterId: null,
    openTaskId: null,
    panelRemovals: [],
    tasksByWorkspace: {},
    visibleTaskId: null,
    ...createActivationActions(set, get),
    ...createTaskChangeAction(set),
    ...createAgentMutationActions(set),
    ...createArchiveActions(set),
    ...createHydrationActions(set),
    setVisibleTaskId: (visibleTaskId: string | null): void => set({ visibleTaskId }),
  }),
)
