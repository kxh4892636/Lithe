import type { BrowserWindow } from 'electron'

import type { Task } from '../../shared/agent-contract'
import type { AppDatabase } from '../database/app-database'
import type { ApprovalQueue } from '../tool-control/approval-queue'
import type { ToolCommandContext } from '../tool-control/command-dispatcher'
import { requestNativeApproval, type NativeApprovalDecision } from '../tool-control/native-approval'

interface TaskDeleteApprovalOptions {
  approvals: ApprovalQueue
  countEntries: (path: string) => number
  database: AppDatabase
  getWindow: () => BrowserWindow | undefined
}

export const createTaskDeleteApproval =
  (options: TaskDeleteApprovalOptions) =>
  async (context: ToolCommandContext, task: Task): Promise<NativeApprovalDecision> => {
    const window = options.getWindow()
    if (!window) return 'rejected'
    const workspace = options.database.projects.getWorkspace(task.workspaceId)
    const isLastScratch = workspace?.kind === 'scratch' && options.database.tasks.listAll(workspace.id).length === 1
    const fileCount = isLastScratch && workspace ? options.countEntries(workspace.rootPath) : 0
    return await requestNativeApproval({
      approvals: options.approvals,
      confirmLabel: '删除',
      context,
      detail: isLastScratch
        ? `这也是该临时工作区的最后一个任务。目录及其中 ${fileCount} 个条目将移入系统回收站。`
        : '任务记录和对应 Agent 面板将被移除，此操作不可撤销。',
      message: `删除任务“${task.name}”？`,
      title: '确认删除任务',
      window,
    })
  }
