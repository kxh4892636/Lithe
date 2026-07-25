import { create } from 'zustand'

import type { AgentLaunch, Task } from '../../../../shared/app-contract'

export interface TaskState {
  error: string | null
  launchesByTask: Record<string, AgentLaunch>
  openTaskAfterId: string | null
  openTaskId: string | null
  tasksByWorkspace: Record<string, Task[]>
  addLaunch: (launch: AgentLaunch, afterTaskId?: string) => void
  createTask: (workspaceId: string, name: string) => Promise<AgentLaunch>
  hydrateWorkspace: (workspaceId: string) => Promise<void>
  openTask: (taskId: string) => void
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export const useTaskStore = create<TaskState>(
  (set): TaskState => ({
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
  }),
)
