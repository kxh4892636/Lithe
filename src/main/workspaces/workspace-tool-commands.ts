import type { WorkspaceCreateInput } from '../../shared/app-contract'
import {
  ToolCommandError,
  type ToolCommandContext,
  type ToolCommandDispatcher,
} from '../tool-control/command-dispatcher'
import type { WorktreeService } from './worktree-service'

type ApprovalDecision = 'approved' | 'rejected' | 'timed-out'

interface WorkspaceToolCommandOptions {
  changed: () => void
  commands: ToolCommandDispatcher
  requestApproval: (context: ToolCommandContext, message: string, detail: string) => Promise<ApprovalDecision>
  worktrees: WorktreeService
}

const stringValue = (payload: Record<string, unknown>, key: string, optional = false): string | undefined => {
  const value = payload[key]
  if (optional && value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) throw new TypeError(`Invalid ${key}`)
  return value
}

const createInput = (payload: Record<string, unknown>): WorkspaceCreateInput => ({
  existingBranch: stringValue(payload, 'existingBranch', true),
  from: stringValue(payload, 'from', true),
  name: stringValue(payload, 'name', true),
  newBranch: stringValue(payload, 'newBranch', true),
  projectId: stringValue(payload, 'projectId') ?? '',
  sourceWorkspaceId: stringValue(payload, 'sourceWorkspaceId', true),
})

const requireApproval = async (
  requestApproval: WorkspaceToolCommandOptions['requestApproval'],
  context: ToolCommandContext,
  message: string,
  detail: string,
): Promise<void> => {
  const decision = await requestApproval(context, message, detail)
  if (decision === 'timed-out') throw new ToolCommandError('APPROVAL_TIMEOUT', 'Approval timed out')
  if (decision !== 'approved') throw new ToolCommandError('USER_REJECTED', 'Operation was rejected')
}

const confirmations = (payload: Record<string, unknown>): Record<string, string> => {
  const value = payload.branchConfirmations
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid branchConfirmations')
  return Object.fromEntries(
    Object.entries(value).map(([workspaceId, branch]): [string, string] => {
      if (typeof branch !== 'string') throw new TypeError('Invalid branch confirmation')
      return [workspaceId, branch]
    }),
  )
}

const assertProjectScope = (context: ToolCommandContext, projectId: string): void => {
  if (context.authorization.kind === 'external') return
  if (!context.context.projects.some((project): boolean => project.id === projectId)) {
    throw new TypeError('Target is outside the current Agent project')
  }
}

const assertWorkspaceScope = (context: ToolCommandContext, workspaceId: string): void => {
  if (context.authorization.kind === 'external') return
  const visible = context.context.projects.some((project): boolean =>
    project.workspaces.some((workspace): boolean => workspace.id === workspaceId),
  )
  if (!visible) throw new TypeError('Target is outside the current Agent workspace')
}

export const registerWorkspaceToolCommands = ({
  changed,
  commands,
  requestApproval,
  worktrees,
}: WorkspaceToolCommandOptions): void => {
  commands.register('workspace.create', async (payload: Record<string, unknown>, context: ToolCommandContext) => {
    const input = createInput(payload)
    assertProjectScope(context, input.projectId)
    const preview = await worktrees.previewCreate(input)
    if (preview.dirtyPaths.length > 0) {
      await requireApproval(
        requestApproval,
        context,
        `从有未提交变更的项目创建工作区？`,
        `以下变更不会复制：\n${preview.dirtyPaths.join('\n')}`,
      )
    }
    const created = await worktrees.create(input, preview.dirtyPaths.length > 0 ? preview.dirtyFingerprint : undefined)
    changed()
    return created
  })
  commands.register('workspace.rename', (payload: Record<string, unknown>, context: ToolCommandContext) => {
    const workspaceId = stringValue(payload, 'workspaceId') ?? ''
    assertWorkspaceScope(context, workspaceId)
    const renamed = worktrees.rename(workspaceId, stringValue(payload, 'name') ?? '')
    changed()
    return renamed
  })
  commands.register(
    'workspace.delete',
    async (payload: Record<string, unknown>, context: ToolCommandContext): Promise<null> => {
      const workspaceId = stringValue(payload, 'workspaceId') ?? ''
      assertWorkspaceScope(context, workspaceId)
      const preview = await worktrees.previewDelete(workspaceId)
      await requireApproval(
        requestApproval,
        context,
        `删除工作区“${preview.workspace.name}”？`,
        `将删除托管目录和分支 ${preview.branch}。`,
      )
      await worktrees.delete(workspaceId, stringValue(payload, 'branchConfirmation', true))
      changed()
      return null
    },
  )
  commands.register(
    'project.remove',
    async (payload: Record<string, unknown>, context: ToolCommandContext): Promise<null> => {
      const projectId = stringValue(payload, 'projectId') ?? ''
      assertProjectScope(context, projectId)
      const preview = await worktrees.previewProjectRemoval(projectId)
      await requireApproval(
        requestApproval,
        context,
        `移除项目“${preview.project.name}”？`,
        '项目根目录会保留；托管的派生工作区目录及其分支会被删除。',
      )
      await worktrees.removeProject(projectId, confirmations(payload))
      changed()
      return null
    },
  )
}
