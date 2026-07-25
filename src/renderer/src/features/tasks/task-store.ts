import { create } from 'zustand'

import type { AgentLaunch, BackgroundAgentLaunch, Task, TaskChangeEvent } from '../../../../shared/app-contract'

export interface TaskState {
  archivedTasks: Task[]
  backgroundPanels: BackgroundAgentLaunch[]
  deletedTaskIds: string[]
  error: string | null
  launchesByTask: Record<string, AgentLaunch>
  openTaskAfterId: string | null
  openTaskId: string | null
  tasksByWorkspace: Record<string, Task[]>
  addLaunch: (launch: AgentLaunch, afterTaskId?: string) => void
  addBackgroundLaunch: (event: BackgroundAgentLaunch) => void
  applyChange: (event: TaskChangeEvent) => void
  createTask: (workspaceId: string, name: string) => Promise<AgentLaunch>
  archiveTask: (taskId: string) => Promise<void>
  deleteTask: (taskId: string) => Promise<boolean>
  hydrateArchived: () => Promise<void>
  hydrateWorkspace: (workspaceId: string) => Promise<void>
  openTask: (taskId: string) => void
  restoreTask: (taskId: string) => Promise<void>
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export const useTaskStore = create<TaskState>(
  (set): TaskState => ({
    archivedTasks: [],
    backgroundPanels: [],
    deletedTaskIds: [],
    error: null,
    launchesByTask: {},
    openTaskAfterId: null,
    openTaskId: null,
    tasksByWorkspace: {},
    addLaunch: (launch: AgentLaunch, afterTaskId?: string): void => {
      set((state): Partial<TaskState> => {
        const existing = state.tasksByWorkspace[launch.task.workspaceId] ?? []
        const tasks = existing.some((task: Task): boolean => task.id === launch.task.id)
          ? existing
          : [...existing, launch.task]
        return {
          launchesByTask: { ...state.launchesByTask, [launch.task.id]: launch },
          openTaskAfterId: afterTaskId ?? null,
          openTaskId: launch.task.id,
          tasksByWorkspace: { ...state.tasksByWorkspace, [launch.task.workspaceId]: tasks },
        }
      })
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
            [event.launch.task.workspaceId]: existing.some((task: Task): boolean => task.id === event.launch.task.id)
              ? existing.map((task: Task): Task => (task.id === event.launch.task.id ? event.launch.task : task))
              : [...existing, event.launch.task],
          },
        }
      })
    },
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
                [event.workspaceId]: workspaceTasks.some((task: Task): boolean => task.id === event.id)
                  ? workspaceTasks.map((task: Task): Task => (task.id === event.id ? event : task))
                  : [...workspaceTasks, event],
              },
            }
      })
    },
    createTask: async (workspaceId: string, name: string): Promise<AgentLaunch> => {
      try {
        const launch = await window.lithe.tasks.create(workspaceId, name)
        set(
          (state): Partial<TaskState> => ({
            error: null,
            launchesByTask: { ...state.launchesByTask, [launch.task.id]: launch },
            openTaskAfterId: null,
            openTaskId: launch.task.id,
            tasksByWorkspace: {
              ...state.tasksByWorkspace,
              [workspaceId]: [...(state.tasksByWorkspace[workspaceId] ?? []), launch.task],
            },
          }),
        )
        return launch
      } catch (error: unknown) {
        set({ error: errorMessage(error) })
        throw error
      }
    },
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
    restoreTask: async (taskId: string): Promise<void> => {
      try {
        const restored = await window.lithe.tasks.restore(taskId)
        set(
          (state): Partial<TaskState> => ({
            archivedTasks: state.archivedTasks.filter((task: Task): boolean => task.id !== taskId),
            error: null,
            tasksByWorkspace: {
              ...state.tasksByWorkspace,
              [restored.workspaceId]: [...(state.tasksByWorkspace[restored.workspaceId] ?? []), restored],
            },
          }),
        )
      } catch (error: unknown) {
        set({ error: errorMessage(error) })
        throw error
      }
    },
  }),
)
