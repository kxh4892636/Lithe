import { GitForkIcon, PencilIcon, PinIcon, SquarePenIcon, Trash2Icon, GitBranch } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { SidebarMenuSubButton, SidebarMenuSubItem } from '@/components/ui/sidebar'

import type { AdapterSummary, ProjectWithWorkspaces, Task, Workspace } from '../../../../shared/app-contract'
import { useNavigationRowOpen } from './navigation-row-collapse'
import type { ProjectOperation } from './project-operation-dialog'
import { WorkspaceTaskList } from './workspace-task-list'

interface WorkspaceRowProps {
  activateTask: (taskId: string) => Promise<unknown>
  activeWorkspaceId: string | null
  adaptersByVersion: Map<string, AdapterSummary>
  openTaskDialog: (workspace: Workspace) => void
  project: ProjectWithWorkspaces
  query: string
  selectWorkspace: (workspaceId: string) => Promise<void>
  setOperation: (operation: ProjectOperation) => void
  setWorkspacePinned: (workspaceId: string, isPinned: boolean) => Promise<void>
  tasks: Task[]
  visibleTaskId: string | null
  workspace: Workspace
}

export const workspaceNavigationTitle = (workspace: Workspace): string =>
  workspace.gitBranch ? `${workspace.gitBranch} - ${workspace.name}` : workspace.name

export const workspaceRowIsActive = (
  activeWorkspaceId: string | null,
  visibleTaskId: string | null,
  workspaceId: string,
): boolean => activeWorkspaceId === workspaceId && visibleTaskId === null

const WorkspaceContextItems = ({
  openTaskDialog,
  project,
  setOperation,
  setWorkspacePinned,
  workspace,
}: WorkspaceRowProps): React.JSX.Element => (
  <>
    {workspace.isValid !== false ? (
      <>
        <ContextMenuItem onClick={(): void => openTaskDialog(workspace)}>
          <SquarePenIcon />
          创建任务
        </ContextMenuItem>
        <ContextMenuItem onClick={(): void => void setWorkspacePinned(workspace.id, !workspace.pinnedAt)}>
          <PinIcon />
          {workspace.pinnedAt ? '取消置顶' : '置顶'}
        </ContextMenuItem>
        <ContextMenuItem onClick={(): void => setOperation({ kind: 'create', project, sourceWorkspace: workspace })}>
          <GitForkIcon />
          派生工作区
        </ContextMenuItem>
      </>
    ) : null}
    {workspace.kind === 'derived' ? (
      <>
        <ContextMenuSeparator />
        {workspace.isValid !== false ? (
          <ContextMenuItem onClick={(): void => setOperation({ kind: 'rename', workspace })}>
            <PencilIcon />
            重命名
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onClick={(): void => setOperation({ kind: 'delete', workspace })} variant="destructive">
          <Trash2Icon />
          删除
        </ContextMenuItem>
      </>
    ) : null}
  </>
)

interface WorkspaceCollapseToggleProps {
  isOpen: boolean
  onToggle: () => void
  title: string
}

const WorkspaceCollapseToggle = ({ isOpen, onToggle, title }: WorkspaceCollapseToggleProps): React.JSX.Element => (
  <button
    aria-expanded={isOpen}
    aria-label={`${isOpen ? '折叠' : '展开'} ${title}`}
    className="text-muted-foreground shrink-0 rounded-sm p-0.5 hover:text-foreground"
    onClick={onToggle}
    type="button"
  >
    <GitBranch className="size-3!" />
  </button>
)

export const WorkspaceNavigationRow = (props: WorkspaceRowProps): React.JSX.Element => {
  const { activeWorkspaceId, selectWorkspace, visibleTaskId, workspace } = props
  const active = workspaceRowIsActive(activeWorkspaceId, visibleTaskId, workspace.id)
  const { isOpen, toggle } = useNavigationRowOpen('workspace', workspace.id)
  return (
    <SidebarMenuSubItem>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              data-active={String(active)}
              data-slot="workspace-row"
              className={
                active
                  ? 'group/workspace flex min-w-0 items-center rounded-md bg-sidebar-accent/60 mb-0.5'
                  : 'group/workspace flex min-w-0 items-center rounded-md hover:bg-sidebar-accent/50 focus-within:bg-sidebar-accent/50 mb-0.5'
              }
            />
          }
        >
          <WorkspaceCollapseToggle isOpen={isOpen} onToggle={toggle} title={workspaceNavigationTitle(workspace)} />
          <SidebarMenuSubButton
            className={
              workspace.isValid === false
                ? 'text-destructive min-w-0 flex-1 hover:bg-transparent'
                : 'min-w-0 flex-1 hover:bg-transparent'
            }
            onClick={(): void => void selectWorkspace(workspace.id)}
            render={
              <button
                aria-label={workspaceNavigationTitle(workspace)}
                title={workspace.isValid === false ? '工作区目录不存在' : workspaceNavigationTitle(workspace)}
                type="button"
              />
            }
          >
            <span className="truncate">{workspaceNavigationTitle(workspace)}</span>
          </SidebarMenuSubButton>
          <div className="invisible flex shrink-0 items-center group-focus-within/workspace:visible group-hover/workspace:visible">
            {workspace.isValid !== false ? (
              <>
                <Button
                  aria-label={`在 ${workspace.name} 创建任务`}
                  onClick={(): void => props.openTaskDialog(workspace)}
                  size="icon-xs"
                  title="创建任务"
                  variant="ghost"
                >
                  <SquarePenIcon />
                </Button>
                <Button
                  aria-label={workspace.pinnedAt ? '取消置顶此工作区' : '置顶此工作区'}
                  onClick={(): void => void props.setWorkspacePinned(workspace.id, !workspace.pinnedAt)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <PinIcon className={workspace.pinnedAt ? 'fill-current' : ''} />
                </Button>
              </>
            ) : null}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="[&_svg]:size-3">
          <WorkspaceContextItems {...props} />
        </ContextMenuContent>
      </ContextMenu>
      {isOpen ? (
        <WorkspaceTaskList
          activateTask={props.activateTask}
          adaptersByVersion={props.adaptersByVersion}
          query={props.query}
          selectWorkspace={selectWorkspace}
          tasks={props.tasks}
          visibleTaskId={visibleTaskId}
          workspace={workspace}
        />
      ) : null}
    </SidebarMenuSubItem>
  )
}
