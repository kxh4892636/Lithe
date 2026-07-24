import { create } from 'zustand'

import type { ProjectWithWorkspaces, WorkspaceNavigation } from '../../../../shared/app-contract'

interface ProjectState extends WorkspaceNavigation {
  error: string | null
  isLoading: boolean
  addDirectory: () => Promise<void>
  hydrate: () => Promise<void>
  selectWorkspace: (workspaceId: string) => Promise<void>
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const recordBoundaryError = (operation: string, error: unknown): void => {
  globalThis.console.error(`Lithe ${operation} failed`, error)
}

export const useProjectStore = create<ProjectState>(
  (set): ProjectState => ({
    activeWorkspaceId: null,
    projects: [],
    error: null,
    isLoading: false,
    addDirectory: async (): Promise<void> => {
      set({ error: null, isLoading: true })
      try {
        const project = await window.lithe.projects.addDirectory()
        if (!project) {
          set({ isLoading: false })
          return
        }
        const [workspace] = project.workspaces
        set(
          (state): Partial<ProjectState> => ({
            activeWorkspaceId: workspace?.id ?? state.activeWorkspaceId,
            isLoading: false,
            projects: [...state.projects, project],
          }),
        )
      } catch (error: unknown) {
        recordBoundaryError('project directory addition', error)
        set({ error: errorMessage(error), isLoading: false })
      }
    },
    hydrate: async (): Promise<void> => {
      set({ error: null, isLoading: true })
      try {
        set({ ...(await window.lithe.projects.getNavigation()), isLoading: false })
      } catch (error: unknown) {
        recordBoundaryError('project navigation hydration', error)
        set({ error: errorMessage(error), isLoading: false })
      }
    },
    selectWorkspace: async (workspaceId: string): Promise<void> => {
      try {
        await window.lithe.projects.selectWorkspace(workspaceId)
        set({ activeWorkspaceId: workspaceId, error: null })
      } catch (error: unknown) {
        recordBoundaryError('workspace selection', error)
        set({ error: errorMessage(error) })
      }
    },
  }),
)

export const findActiveProject = (
  projects: ProjectWithWorkspaces[],
  activeWorkspaceId: string | null,
): ProjectWithWorkspaces | undefined =>
  projects.find((project): boolean =>
    project.workspaces.some((workspace): boolean => workspace.id === activeWorkspaceId),
  )
