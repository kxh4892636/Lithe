import { type BrowserWindow, dialog } from 'electron'

import type { ApprovalQueue } from './approval-queue'
import type { ToolCommandContext } from './command-dispatcher'

interface NativeApprovalOptions {
  approvals: ApprovalQueue
  confirmLabel: string
  context: ToolCommandContext
  detail: string
  message: string
  title: string
  window: BrowserWindow
}

export type NativeApprovalDecision = 'approved' | 'rejected' | 'timed-out'

export const requestNativeApproval = async (options: NativeApprovalOptions): Promise<NativeApprovalDecision> => {
  const pending = options.approvals.request(options.context.requestId, options.context.connectionId)
  void dialog
    .showMessageBox(options.window, {
      buttons: ['取消', options.confirmLabel],
      cancelId: 0,
      defaultId: 0,
      detail: options.detail,
      message: options.message,
      title: options.title,
      type: 'warning',
    })
    .then((result): void => {
      options.approvals.decide(options.context.requestId, result.response === 1 ? 'approved' : 'rejected')
    })
  const decision = await pending
  return decision === 'approved' || decision === 'timed-out' ? decision : 'rejected'
}

export const createWorkspaceApproval =
  (approvals: ApprovalQueue, getWindow: () => BrowserWindow | undefined) =>
  async (context: ToolCommandContext, message: string, detail: string): Promise<NativeApprovalDecision> => {
    const window = getWindow()
    if (!window) return 'rejected'
    return await requestNativeApproval({
      approvals,
      confirmLabel: '继续',
      context,
      detail,
      message,
      title: '确认 Lithe 管理操作',
      window,
    })
  }
