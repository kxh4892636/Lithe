import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type {
  ProjectRemovalPreview,
  ProjectWithWorkspaces,
  Workspace,
  WorkspaceCreatePreview,
  WorkspaceDeletePreview,
} from '../../../../shared/app-contract'
import { CreateOperationFields, DestructiveOperationFields, NameOperationField } from './project-operation-fields'
import { useProjectStore } from './project-store'

export type ProjectOperation =
  | { kind: 'create'; project: ProjectWithWorkspaces; sourceWorkspace?: Workspace }
  | { kind: 'delete'; workspace: Workspace }
  | { kind: 'forget'; project: ProjectWithWorkspaces }
  | { kind: 'remove'; project: ProjectWithWorkspaces }
  | { kind: 'rename'; workspace: Workspace }

interface ProjectOperationDialogProps {
  onClose: () => void
  operation: ProjectOperation | null
}

const title = (operation: ProjectOperation): string => {
  if (operation.kind === 'create') return '创建工作区'
  if (operation.kind === 'rename') return '重命名工作区'
  if (operation.kind === 'delete') return '删除工作区'
  if (operation.kind === 'forget') return '忘记无效项目'
  return '移除项目'
}

const description = (operation: ProjectOperation): string => {
  if (operation.kind === 'create') return `在 ${operation.project.name} 中创建受 Lithe 管理的 Git worktree。`
  if (operation.kind === 'rename') return '只修改显示名称，不改变分支名或工作目录。'
  if (operation.kind === 'delete') return '将删除托管目录及其 Git 分支。'
  if (operation.kind === 'forget') return '可访问的托管目录会移入系统回收站，项目根目录不受影响。'
  return '项目根目录会保留，派生工作区目录及其分支会被删除。'
}

const useOperationPreviews = (
  operation: ProjectOperation,
): {
  deletePreview: WorkspaceDeletePreview | null
  error: string | null
  projectPreview: ProjectRemovalPreview | null
} => {
  const [deletePreview, setDeletePreview] = useState<WorkspaceDeletePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projectPreview, setProjectPreview] = useState<ProjectRemovalPreview | null>(null)
  useEffect((): (() => void) => {
    let active = true
    const record = (cause: unknown): void => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause))
    }
    if (operation.kind === 'delete') {
      void window.lithe.workspaces.previewDelete(operation.workspace.id).then((preview): void => {
        if (active) setDeletePreview(preview)
      }, record)
    }
    if (operation.kind === 'remove') {
      void window.lithe.projects.previewRemove(operation.project.id).then((preview): void => {
        if (active) setProjectPreview(preview)
      }, record)
    }
    return (): void => {
      active = false
    }
  }, [operation])
  return { deletePreview, error, projectPreview }
}

interface ExecuteOperationOptions {
  branch: string
  branchMode: 'existing' | 'new'
  confirmations: Record<string, string>
  createPreview: WorkspaceCreatePreview | null
  from: string
  name: string
  operation: ProjectOperation
  setCreatePreview: (preview: WorkspaceCreatePreview) => void
}

interface ProjectOperationFormProps {
  onClose: () => void
  operation: ProjectOperation
}

const executeOperation = async (options: ExecuteOperationOptions): Promise<boolean> => {
  const store = useProjectStore.getState()
  const { operation } = options
  if (operation.kind === 'create') {
    const input = {
      existingBranch: options.branchMode === 'existing' ? options.branch : undefined,
      from: options.branchMode === 'new' ? options.from : undefined,
      name: options.name || undefined,
      newBranch: options.branchMode === 'new' ? options.branch : undefined,
      projectId: operation.project.id,
      sourceWorkspaceId: operation.sourceWorkspace?.id,
    }
    const preview = await window.lithe.workspaces.previewCreate(input)
    if (preview.dirtyPaths.length > 0 && options.createPreview?.dirtyFingerprint !== preview.dirtyFingerprint) {
      options.setCreatePreview(preview)
      return false
    }
    await store.createWorkspace(input, preview.dirtyPaths.length > 0 ? preview.dirtyFingerprint : undefined)
  } else if (operation.kind === 'rename') {
    await store.renameWorkspace(operation.workspace.id, options.name)
  } else if (operation.kind === 'delete') {
    await store.deleteWorkspace(operation.workspace.id, options.confirmations[operation.workspace.id])
  } else if (operation.kind === 'forget') {
    await store.forgetInvalidProject(operation.project.id, options.name)
  } else {
    await store.removeProject(operation.project.id, options.confirmations)
  }
  return true
}

const ProjectOperationForm = ({ onClose, operation }: ProjectOperationFormProps): React.JSX.Element => {
  const [branchMode, setBranchMode] = useState<'existing' | 'new'>('new')
  const [branch, setBranch] = useState('')
  const [confirmations, setConfirmations] = useState<Record<string, string>>({})
  const [createPreview, setCreatePreview] = useState<WorkspaceCreatePreview | null>(null)
  const [from, setFrom] = useState('HEAD')
  const [name, setName] = useState(operation.kind === 'rename' ? operation.workspace.name : '')
  const [submitting, setSubmitting] = useState(false)
  const { deletePreview, error: previewError, projectPreview } = useOperationPreviews(operation)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSubmitError(null)
    setSubmitting(true)
    try {
      const completed = await executeOperation({
        branch,
        branchMode,
        confirmations,
        createPreview,
        from,
        name,
        operation,
        setCreatePreview,
      })
      if (completed) onClose()
    } catch (cause: unknown) {
      setSubmitError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSubmitting(false)
    }
  }

  const destructivePreview = deletePreview ? [deletePreview] : (projectPreview?.workspaces ?? [])
  const hasDirtyWorkspace = destructivePreview.some((preview): boolean => preview.dirtyPaths.length > 0)
  const confirmationsComplete = destructivePreview.every(
    (preview): boolean =>
      preview.unmergedCommits.length === 0 || confirmations[preview.workspace.id] === preview.branch,
  )
  const isCreateInvalid = operation.kind === 'create' && (!branch.trim() || (branchMode === 'new' && !from.trim()))
  const isNameInvalid =
    (operation.kind === 'rename' && !name.trim()) || (operation.kind === 'forget' && name !== operation.project.name)
  const previewPending =
    (operation.kind === 'delete' && !deletePreview) || (operation.kind === 'remove' && !projectPreview)
  const isDisabled =
    submitting || isCreateInvalid || isNameInvalid || previewPending || hasDirtyWorkspace || !confirmationsComplete
  const error = submitError ?? previewError

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event): void => void submit(event)}>
      <div className="space-y-4 overflow-auto px-4">
        {operation.kind === 'create' ? (
          <CreateOperationFields
            branch={branch}
            branchMode={branchMode}
            from={from}
            name={name}
            preview={createPreview}
            setBranch={setBranch}
            setBranchMode={setBranchMode}
            setFrom={setFrom}
            setName={setName}
          />
        ) : null}
        {operation.kind === 'rename' || operation.kind === 'forget' ? (
          <NameOperationField name={name} operation={operation} setName={setName} />
        ) : null}
        <DestructiveOperationFields
          confirmations={confirmations}
          previews={destructivePreview}
          setConfirmation={(workspaceId, value): void =>
            setConfirmations((current) => ({ ...current, [workspaceId]: value }))
          }
        />
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button disabled={isDisabled} type="submit" variant={operation.kind === 'create' ? 'default' : 'destructive'}>
          {operation.kind === 'create' ? '创建工作区' : operation.kind === 'rename' ? '保存名称' : '确认操作'}
        </Button>
        <Button onClick={onClose} type="button" variant="outline">
          取消
        </Button>
      </DialogFooter>
    </form>
  )
}

export const ProjectOperationDialog = ({ onClose, operation }: ProjectOperationDialogProps): React.JSX.Element => (
  <Dialog
    onOpenChange={(isOpen): void => {
      if (!isOpen) onClose()
    }}
    open={operation !== null}
  >
    {operation ? (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title(operation)}</DialogTitle>
          <DialogDescription>{description(operation)}</DialogDescription>
        </DialogHeader>
        <ProjectOperationForm
          key={`${operation.kind}-${'project' in operation ? operation.project.id : operation.workspace.id}`}
          onClose={onClose}
          operation={operation}
        />
      </DialogContent>
    ) : null}
  </Dialog>
)
