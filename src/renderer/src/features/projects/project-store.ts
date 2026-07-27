import { create } from 'zustand'

import type {
  ProjectCreateInput,
  ProjectWithWorkspaces,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceNavigation,
} from '../../../../shared/app-contract'

interface ProjectState extends WorkspaceNavigation {
  error: string | null
  isLoading: boolean
  createProject: (input: ProjectCreateInput) => Promise<void>
  createWorkspace: (input: WorkspaceCreateInput, confirmedDirtyFingerprint?: string) => Promise<void>
  deleteWorkspace: (workspaceId: string, branchConfirmation?: string) => Promise<void>
  forgetInvalidProject: (projectId: string, confirmation: string) => Promise<void>
  hydrate: () => Promise<void>
  removeProject: (projectId: string, branchConfirmations: Record<string, string>) => Promise<void>
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>
  selectWorkspace: (workspaceId: string) => Promise<void>
  setWorkspacePinned: (workspaceId: string, isPinned: boolean) => Promise<void>
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const recordBoundaryError = (operation: string, error: unknown): void => {
  globalThis.console.error(`Lithe ${operation} failed`, error)
}

export const useProjectStore = create<ProjectState>(
  (set): ProjectState => ({
    activeWorkspaceId: null,
    projects: [],
    scratchWorkspaces: [],
    error: null,
    isLoading: false,
    createProject: async (input: ProjectCreateInput): Promise<void> => {
      set({ error: null, isLoading: true })
      try {
        await window.lithe.projects.create(input)
        await useProjectStore.getState().hydrate()
      } catch (error: unknown) {
        recordBoundaryError('project creation', error)
        set({ error: errorMessage(error), isLoading: false })
        throw error
      }
    },
    createWorkspace: async (input: WorkspaceCreateInput, confirmedDirtyFingerprint?: string): Promise<void> => {
      try {
        const created = await window.lithe.workspaces.create(input, confirmedDirtyFingerprint)
        if (created) await useProjectStore.getState().hydrate()
      } catch (error: unknown) {
        recordBoundaryError('workspace creation', error)
        set({ error: errorMessage(error) })
        throw error
      }
    },
    deleteWorkspace: async (workspaceId: string, branchConfirmation?: string): Promise<void> => {
      try {
        if (await window.lithe.workspaces.delete(workspaceId, branchConfirmation)) {
          await useProjectStore.getState().hydrate()
        }
      } catch (error: unknown) {
        recordBoundaryError('workspace deletion', error)
        set({ error: errorMessage(error) })
        throw error
      }
    },
    forgetInvalidProject: async (projectId: string, confirmation: string): Promise<void> => {
      try {
        if (await window.lithe.projects.forgetInvalid(projectId, confirmation))
          await useProjectStore.getState().hydrate()
      } catch (error: unknown) {
        recordBoundaryError('invalid project removal', error)
        set({ error: errorMessage(error) })
        throw error
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
    removeProject: async (projectId: string, branchConfirmations: Record<string, string>): Promise<void> => {
      try {
        if (await window.lithe.projects.remove(projectId, branchConfirmations))
          await useProjectStore.getState().hydrate()
      } catch (error: unknown) {
        recordBoundaryError('project removal', error)
        set({ error: errorMessage(error) })
        throw error
      }
    },
    renameWorkspace: async (workspaceId: string, name: string): Promise<void> => {
      try {
        await window.lithe.workspaces.rename(workspaceId, name)
        await useProjectStore.getState().hydrate()
      } catch (error: unknown) {
        recordBoundaryError('workspace rename', error)
        set({ error: errorMessage(error) })
        throw error
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
    setWorkspacePinned: async (workspaceId: string, isPinned: boolean): Promise<void> => {
      try {
        const updated = await window.lithe.projects.setWorkspacePinned(workspaceId, isPinned)
        set(
          (state): Partial<ProjectState> => ({
            error: null,
            projects: state.projects.map(
              (project): ProjectWithWorkspaces => ({
                ...project,
                workspaces: project.workspaces.map(
                  (workspace): Workspace => (workspace.id === updated.id ? updated : workspace),
                ),
              }),
            ),
            scratchWorkspaces: state.scratchWorkspaces.map(
              (workspace): Workspace => (workspace.id === updated.id ? updated : workspace),
            ),
          }),
        )
      } catch (error: unknown) {
        recordBoundaryError('workspace pin update', error)
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

export const findActiveWorkspace = (
  projects: ProjectWithWorkspaces[],
  scratchWorkspaces: Workspace[],
  activeWorkspaceId: string | null,
): Workspace | undefined =>
  projects
    .flatMap((project): Workspace[] => project.workspaces)
    .concat(scratchWorkspaces)
    .find((workspace): boolean => workspace.id === activeWorkspaceId)
