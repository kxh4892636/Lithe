import { join } from 'node:path'

import type { Workspace } from '../../shared/app-contract'

interface ScratchWorkspaceServiceOptions {
  add: (workspace: Workspace) => void
  createId: () => string
  mkdir: (path: string) => void
  now: () => Date
  remove: (path: string) => void
  scratchRoot: string
}

export interface ScratchWorkspaceService {
  create: () => Workspace
}

export const createScratchWorkspaceService = (options: ScratchWorkspaceServiceOptions): ScratchWorkspaceService => ({
  create: (): Workspace => {
    const id = options.createId()
    const rootPath = join(options.scratchRoot, id)
    const workspace: Workspace = {
      id,
      projectId: null,
      name: '临时任务',
      rootPath,
      gitBranch: null,
      kind: 'scratch',
      pinnedAt: null,
      createdAt: options.now(),
    }
    options.mkdir(rootPath)
    try {
      options.add(workspace)
    } catch (error: unknown) {
      options.remove(rootPath)
      throw error
    }
    return workspace
  },
})
