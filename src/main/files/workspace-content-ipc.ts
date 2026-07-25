import type { BrowserWindow } from 'electron'

import type { Workspace } from '../../shared/app-contract'
import { registerGitDiffIpc } from '../git-diff/git-diff-ipc'
import { createGitDiffService } from '../git-diff/git-diff-service'
import { registerFileIpc } from './file-ipc'
import type { FileService } from './file-service'

interface WorkspaceContentIpcOptions {
  fileService: FileService
  getWorkspace: (workspaceId: string) => Workspace | undefined
  window: BrowserWindow
}

export const registerWorkspaceContentIpc = (options: WorkspaceContentIpcOptions): (() => void) => {
  const removeFiles = registerFileIpc({ service: options.fileService, window: options.window })
  const removeDiff = registerGitDiffIpc({
    service: createGitDiffService({ getWorkspace: options.getWorkspace }),
    window: options.window,
  })
  return (): void => {
    removeFiles()
    removeDiff()
  }
}
