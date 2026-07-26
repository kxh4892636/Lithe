import { describe, expect, it, vi } from 'vitest'

import type { ProjectWithWorkspaces } from '../../shared/app-contract'
import type { AppDatabase } from '../database/app-database'
import { createWorkspaceLifecycle } from './workspace-lifecycle'

const project: ProjectWithWorkspaces = {
  id: 'project-1',
  name: 'Lithe',
  rootPath: 'D:\\projects\\lithe',
  isValid: true,
  createdAt: new Date(0),
  workspaces: [
    {
      id: 'workspace-default',
      projectId: 'project-1',
      name: '默认',
      rootPath: 'D:\\projects\\lithe',
      gitBranch: 'main',
      kind: 'default',
      isValid: true,
      pinnedAt: null,
      createdAt: new Date(0),
    },
    {
      id: 'workspace-derived',
      projectId: 'project-1',
      name: 'review',
      rootPath: 'D:\\worktrees\\review',
      gitBranch: 'review',
      kind: 'derived',
      isValid: true,
      pinnedAt: null,
      createdAt: new Date(0),
    },
  ],
}

describe('workspace lifecycle', (): void => {
  it('marks a missing workspace directory invalid and notifies navigation', (): void => {
    const setWorkspaceValidity = vi.fn<(workspaceId: string, isValid: boolean) => void>()
    const notifyNavigation = vi.fn<() => void>()
    const database = {
      projects: {
        list: (): ProjectWithWorkspaces[] => [project],
        setValidity: vi.fn<(projectId: string, isValid: boolean) => void>(),
        setWorkspaceValidity,
      },
      tasks: { listAll: (): never[] => [] },
    } as unknown as AppDatabase
    const lifecycle = createWorkspaceLifecycle({
      database,
      getAgentManager: (): undefined => undefined,
      isDirectory: (path: string): boolean => path !== 'D:\\worktrees\\review',
      notifyNavigation,
      trash: async (): Promise<void> => undefined,
      worktreeRoot: 'D:\\worktrees',
    })

    lifecycle.refreshProjectValidity()

    expect(setWorkspaceValidity).toHaveBeenCalledWith('workspace-derived', false)
    expect(notifyNavigation).toHaveBeenCalledOnce()
  })
})
