import { Input } from '@/components/ui/input'

import type { WorkspaceCreatePreview, WorkspaceDeletePreview } from '../../../../shared/app-contract'
import type { ProjectOperation } from './project-operation-sheet'

interface CreateOperationFieldsProps {
  branch: string
  branchMode: 'existing' | 'new'
  from: string
  name: string
  preview: WorkspaceCreatePreview | null
  setBranch: (value: string) => void
  setBranchMode: (value: 'existing' | 'new') => void
  setFrom: (value: string) => void
  setName: (value: string) => void
}

export const CreateOperationFields = (props: CreateOperationFieldsProps): React.JSX.Element => (
  <>
    <label className="grid gap-1 text-xs" htmlFor="workspace-branch-mode">
      分支来源
      <select
        className="border-input bg-background h-8 rounded-lg border px-2"
        id="workspace-branch-mode"
        onChange={(event): void => props.setBranchMode(event.target.value as 'existing' | 'new')}
        value={props.branchMode}
      >
        <option value="new">新建分支</option>
        <option value="existing">已有分支</option>
      </select>
    </label>
    <label className="grid gap-1 text-xs" htmlFor="workspace-branch">
      {props.branchMode === 'new' ? '新分支名称' : '已有分支名称'}
      <Input
        aria-label="分支名称"
        id="workspace-branch"
        onChange={(event): void => props.setBranch(event.target.value)}
        value={props.branch}
      />
    </label>
    {props.branchMode === 'new' ? (
      <label className="grid gap-1 text-xs" htmlFor="workspace-from">
        起始提交
        <Input
          aria-label="起始提交"
          id="workspace-from"
          onChange={(event): void => props.setFrom(event.target.value)}
          value={props.from}
        />
      </label>
    ) : null}
    <label className="grid gap-1 text-xs" htmlFor="workspace-name">
      工作区名称
      <Input
        aria-label="工作区名称"
        id="workspace-name"
        onChange={(event): void => props.setName(event.target.value)}
        placeholder="默认使用分支名称"
        value={props.name}
      />
    </label>
    {props.preview?.dirtyPaths.length ? (
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-3 text-xs">
        <p className="font-medium">源工作区有未提交变更，以下内容不会复制：</p>
        {props.preview.dirtyPaths.map((path) => (
          <p className="text-muted-foreground mt-1 break-all" key={path}>
            {path}
          </p>
        ))}
        <p className="mt-2">再次点击创建以确认。</p>
      </div>
    ) : null}
  </>
)

interface NameOperationFieldProps {
  name: string
  operation: Extract<ProjectOperation, { kind: 'forget' | 'rename' }>
  setName: (value: string) => void
}

export const NameOperationField = (props: NameOperationFieldProps): React.JSX.Element => (
  <label className="grid gap-1 text-xs" htmlFor="operation-name">
    {props.operation.kind === 'rename' ? '新名称' : `输入 ${props.operation.project.name} 确认`}
    <Input
      aria-label={props.operation.kind === 'rename' ? '新名称' : '项目名称确认'}
      id="operation-name"
      onChange={(event): void => props.setName(event.target.value)}
      value={props.name}
    />
  </label>
)

interface DestructiveOperationFieldsProps {
  confirmations: Record<string, string>
  previews: WorkspaceDeletePreview[]
  setConfirmation: (workspaceId: string, value: string) => void
}

export const DestructiveOperationFields = (props: DestructiveOperationFieldsProps): React.JSX.Element => (
  <>
    {props.previews.map((preview) => (
      <div className="border-border rounded-lg border p-3 text-xs" key={preview.workspace.id}>
        <p className="font-medium">
          {preview.workspace.name} · {preview.branch}
        </p>
        {preview.dirtyPaths.length > 0 ? (
          <p className="text-destructive mt-2">存在未提交变更：{preview.dirtyPaths.join('、')}</p>
        ) : null}
        {preview.unmergedCommits.length > 0 ? (
          <label className="mt-2 grid gap-1" htmlFor={`branch-confirmation-${preview.workspace.id}`}>
            存在 {preview.unmergedCommits.length} 个未合并提交，输入完整分支名确认
            <span className="text-muted-foreground grid gap-1">
              {preview.unmergedCommits.map((commit) => (
                <span className="break-all" key={commit.hash}>
                  {commit.hash.slice(0, 8)} {commit.subject}
                </span>
              ))}
            </span>
            <Input
              aria-label={`确认分支 ${preview.branch}`}
              id={`branch-confirmation-${preview.workspace.id}`}
              onChange={(event): void => props.setConfirmation(preview.workspace.id, event.target.value)}
              value={props.confirmations[preview.workspace.id] ?? ''}
            />
          </label>
        ) : null}
      </div>
    ))}
  </>
)
