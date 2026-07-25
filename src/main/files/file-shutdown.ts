import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'

import type { FileService } from './file-service'

export interface DirtyFileQuitDecision {
  discard: Array<{ relativePath: string; workspaceId: string }>
  proceed: boolean
}

export const commitDiscardedDrafts = (service: FileService | undefined, decision: DirtyFileQuitDecision): void => {
  for (const draft of decision.discard) service?.clearDraft(draft.workspaceId, draft.relativePath)
}

export const prepareDirtyFilesBeforeQuit = async (
  service: FileService | undefined,
  window: BrowserWindow | undefined,
): Promise<DirtyFileQuitDecision> => {
  const drafts = service?.getDrafts() ?? []
  if (drafts.length === 0) return { discard: [], proceed: true }
  const options: MessageBoxOptions = {
    buttons: ['取消', '不保存', '全部保存'],
    cancelId: 0,
    defaultId: 2,
    detail: drafts.map((draft): string => draft.relativePath).join('\n'),
    message: `有 ${drafts.length} 个文件尚未保存`,
    title: '退出 Lithe',
    type: 'question',
  }
  const result = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)
  if (result.response === 0) return { discard: [], proceed: false }
  if (result.response === 1) {
    return {
      discard: drafts.map(({ relativePath, workspaceId }) => ({ relativePath, workspaceId })),
      proceed: true,
    }
  }
  try {
    for (const draft of drafts) {
      await service?.save(draft.workspaceId, draft.relativePath, draft.content, draft.fingerprint)
    }
    return { discard: [], proceed: true }
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox({ detail, message: '文件保存失败，Lithe 将继续运行。', type: 'error' })
    return { discard: [], proceed: false }
  }
}
