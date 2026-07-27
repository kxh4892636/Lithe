import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  GitBranchIcon,
  GitForkIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SquarePenIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from '@/components/ui/sidebar'

import type { AdapterSummary, ProjectWithWorkspaces, Task, Workspace } from '../../../../shared/app-contract'
import { useNavigationSearchStore } from '../../app/navigation-search-store'
import { TaskCreateDialog } from '../tasks/task-create-dialog'
import { useTaskStore, type TaskState } from '../tasks/task-store'
import { useAdaptersByVersion } from '../tasks/use-adapters-by-version'
import { useNavigationRowOpen } from './navigation-row-collapse'
import { ProjectCreateDialog } from './project-create-dialog'
import { filterProjects } from './project-navigation-filter'
import { ProjectOperationDialog, type ProjectOperation } from './project-operation-dialog'
import { useProjectStore } from './project-store'
import { ScratchTaskRows } from './scratch-task-rows'
import { WorkspaceNavigationRow, workspaceNavigationTitle, workspaceRowIsActive } from './workspace-navigation-row'
import { WorkspaceTaskList } from './workspace-task-list'

interface NavigationGroupProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

interface ProjectTreeProps {
  activeWorkspaceId: string | null
  adaptersByVersion: Map<string, AdapterSummary>
  openTaskDialog: (workspace: Workspace) => void
  projects: ProjectWithWorkspaces[]
  query: string
  selectWorkspace: (workspaceId: string) => Promise<void>
  setOperation: (operation: ProjectOperation) => void
  setWorkspacePinned: (workspaceId: string, isPinned: boolean) => Promise<void>
  visibleTaskId: string | null
}

interface ProjectRowProps extends Omit<ProjectTreeProps, 'projects'> {
  activateTask: (taskId: string) => Promise<unknown>
  project: ProjectWithWorkspaces
  tasksByWorkspace: Record<string, Task[]>
}

const ProjectRow = (props: ProjectRowProps): React.JSX.Element => {
  const { project, setOperation } = props
  const { isOpen, toggle } = useNavigationRowOpen('project', project.id)
  const removeOperation: ProjectOperation = project.isValid ? { kind: 'remove', project } : { kind: 'forget', project }
  return (
    <SidebarMenuItem>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div className="group/project flex min-w-0 items-center rounded-md hover:bg-sidebar-accent/50 focus-within:bg-sidebar-accent/50" />
          }
        >
          <SidebarMenuButton
            aria-expanded={isOpen}
            aria-label={`${isOpen ? '折叠' : '展开'} ${project.name}`}
            className={
              project.isValid
                ? 'min-w-0 flex-1 hover:bg-transparent [&_svg]:size-3'
                : 'text-destructive min-w-0 flex-1 hover:bg-transparent [&_svg]:size-3'
            }
            onClick={toggle}
          >
            <FolderIcon className="size-3" />
            <span>{project.name}</span>
          </SidebarMenuButton>
          <div className="invisible flex shrink-0 items-center group-focus-within/project:visible group-hover/project:visible">
            {project.isValid ? (
              <Button
                aria-label={`为 ${project.name} 创建工作区`}

                onClick={(): void => setOperation({ kind: 'create', project })}
                size="icon-xs"
                variant="ghost"
              >
                <PlusIcon />
              </Button>
            ) : (
              <span className="text-destructive text-[10px]">项目目录无效</span>
            )}
            <Button
              aria-label={project.isValid ? `移除 ${project.name}` : `忘记 ${project.name}`}

              onClick={(): void => setOperation(removeOperation)}
              size="icon-xs"
              variant="ghost"
            >
              <Trash2Icon />
            </Button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="[&_svg]:size-3">
          {project.isValid ? (
            <ContextMenuItem onClick={(): void => setOperation({ kind: 'create', project })}>
              <PlusIcon />
              创建工作区
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem onClick={(): void => setOperation(removeOperation)} variant="destructive">
            <Trash2Icon />
            {project.isValid ? '移除项目' : '忘记无效项目'}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isOpen ? (
        <SidebarMenuSub className="ml-3 mr-0 translate-x-0 px-0">
          {project.workspaces.map((workspace) => (
            <WorkspaceNavigationRow
              {...props}
              key={workspace.id}
              tasks={props.tasksByWorkspace[workspace.id] ?? []}
              workspace={workspace}
            />
          ))}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  )
}

const ProjectTree = (props: ProjectTreeProps): React.JSX.Element => {
  const activateTask = useTaskStore((state: TaskState) => state.activateTask)
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const tasksByWorkspace = useTaskStore((state: TaskState) => state.tasksByWorkspace)
  useEffect((): void => {
    for (const project of props.projects) {
      for (const workspace of project.workspaces) void hydrateWorkspace(workspace.id)
    }
  }, [hydrateWorkspace, props.projects])
  return (
    <SidebarMenu>
      {props.projects.map((project) => (
        <ProjectRow
          {...props}
          key={project.id}
          activateTask={activateTask}
          project={project}
          tasksByWorkspace={tasksByWorkspace}
        />
      ))}
    </SidebarMenu>
  )
}

interface PinnedWorkspaceRowProps {
  activateTask: (taskId: string) => Promise<unknown>
  active: boolean
  adapterByVersion: Map<string, AdapterSummary>
  entry: { project?: ProjectWithWorkspaces; workspace: Workspace }
  onOperation: (operation: ProjectOperation) => void
  onTaskCreate: (workspace: Workspace) => void
  query: string
  selectWorkspace: (workspaceId: string) => Promise<void>
  setWorkspacePinned: (workspaceId: string, isPinned: boolean) => Promise<void>
  tasks: Task[]
  visibleTaskId: string | null
}

interface PinnedContextItemsProps {
  entry: { project?: ProjectWithWorkspaces; workspace: Workspace }
  onOperation: (operation: ProjectOperation) => void
  onTaskCreate: (workspace: Workspace) => void
  setWorkspacePinned: (workspaceId: string, isPinned: boolean) => Promise<void>
}

const PinnedContextItems = ({
  entry: { project, workspace },
  onOperation,
  onTaskCreate,
  setWorkspacePinned,
}: PinnedContextItemsProps): React.JSX.Element => (
  <>
    {workspace.isValid !== false ? (
      <ContextMenuItem onClick={(): void => onTaskCreate(workspace)}>
        <SquarePenIcon />
        创建任务
      </ContextMenuItem>
    ) : null}
    <ContextMenuItem onClick={(): void => void setWorkspacePinned(workspace.id, false)}>
      <PinIcon />
      取消置顶
    </ContextMenuItem>
    {project && workspace.isValid !== false ? (
      <ContextMenuItem onClick={(): void => onOperation({ kind: 'create', project, sourceWorkspace: workspace })}>
        <GitForkIcon />
        派生工作区
      </ContextMenuItem>
    ) : null}
    {workspace.kind === 'derived' ? (
      <>
        <ContextMenuSeparator />
        {workspace.isValid !== false ? (
          <ContextMenuItem onClick={(): void => onOperation({ kind: 'rename', workspace })}>
            <PencilIcon />
            重命名
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onClick={(): void => onOperation({ kind: 'delete', workspace })} variant="destructive">
          <Trash2Icon />
          删除
        </ContextMenuItem>
      </>
    ) : null}
  </>
)

const PinnedWorkspaceRow = (props: PinnedWorkspaceRowProps): React.JSX.Element => {
  const { entry, selectWorkspace, setWorkspacePinned } = props
  const { workspace } = entry
  // 置顶区与项目树中的同一工作区共用同一份折叠状态与展开计数（按工作区 ID）
  const { isOpen, toggle } = useNavigationRowOpen('workspace', workspace.id)
  return (
    <div className={props.active ? 'rounded-md bg-sidebar-accent/60' : undefined}>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div className="group/pinned flex items-center rounded-md px-2 py-1 text-xs hover:bg-sidebar-accent/50 focus-within:bg-sidebar-accent/50" />
          }
        >
          <button
            aria-expanded={isOpen}
            aria-label={`${isOpen ? '折叠' : '展开'} ${workspaceNavigationTitle(workspace)}`}
            className="text-muted-foreground shrink-0 rounded-sm p-0.5 hover:text-foreground"
            onClick={toggle}
            type="button"
          >
            <ChevronRightIcon className={isOpen ? 'size-3 rotate-90' : 'size-3'} />
          </button>
          <button
            className={
              workspace.isValid === false
                ? 'text-destructive flex min-w-0 flex-1 items-center gap-1 text-left font-medium'
                : 'flex min-w-0 flex-1 items-center gap-1 text-left font-medium'
            }
            onClick={(): void => void selectWorkspace(workspace.id)}
            type="button"
          >
            {workspace.gitBranch ? <GitBranchIcon className="size-3 shrink-0" /> : null}
            <span className="truncate">{workspaceNavigationTitle(workspace)}</span>
          </button>
          {workspace.isValid !== false ? (
            <Button
              aria-label={`在 ${workspace.name} 创建任务`}
              className="invisible hover:bg-transparent group-focus-within/pinned:visible group-hover/pinned:visible"
              onClick={(): void => props.onTaskCreate(workspace)}
              size="icon-xs"
              variant="ghost"
            >
              <SquarePenIcon />
            </Button>
          ) : null}
          <Button
            aria-label="取消置顶此工作区"
            className="invisible hover:bg-transparent group-focus-within/pinned:visible group-hover/pinned:visible"
            onClick={(): void => void setWorkspacePinned(workspace.id, false)}
            size="icon-xs"
            variant="ghost"
          >
            <PinIcon className="fill-current" />
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent className="[&_svg]:size-3">
          <PinnedContextItems {...props} />
        </ContextMenuContent>
      </ContextMenu>
      {isOpen ? (
        <WorkspaceTaskList
          activateTask={props.activateTask}
          adaptersByVersion={props.adapterByVersion}
          query={props.query}
          selectWorkspace={selectWorkspace}
          tasks={props.tasks}
          visibleTaskId={props.visibleTaskId}
          workspace={workspace}
        />
      ) : null}
    </div>
  )
}

const selectPinnedEntries = (
  projects: ProjectWithWorkspaces[],
  scratchWorkspaces: Workspace[],
  tasksByWorkspace: Record<string, Task[]>,
  query: string,
): { project?: ProjectWithWorkspaces; workspace: Workspace }[] => {
  const entries: { project?: ProjectWithWorkspaces; workspace: Workspace }[] = projects.flatMap((project) =>
    project.workspaces.map((workspace) => ({ project, workspace })),
  )
  entries.push(...scratchWorkspaces.map((workspace) => ({ workspace })))
  return entries
    .filter(
      ({ workspace }): boolean =>
        Boolean(workspace.pinnedAt) &&
        (!query ||
          workspace.name.toLocaleLowerCase().includes(query) ||
          (tasksByWorkspace[workspace.id] ?? []).some((task): boolean =>
            task.name.toLocaleLowerCase().includes(query),
          )),
    )
    .sort(
      (left, right): number => (right.workspace.pinnedAt?.getTime() ?? 0) - (left.workspace.pinnedAt?.getTime() ?? 0),
    )
}

export const PinnedNavigation = ({ isOpen, onOpenChange }: NavigationGroupProps): React.JSX.Element => {
  const { t } = useTranslation()
  const activeWorkspaceId = useProjectStore((state) => state.activeWorkspaceId)
  const projects = useProjectStore((state) => state.projects)
  const scratchWorkspaces = useProjectStore((state) => state.scratchWorkspaces)
  const selectWorkspace = useProjectStore((state) => state.selectWorkspace)
  const setWorkspacePinned = useProjectStore((state) => state.setWorkspacePinned)
  const activateTask = useTaskStore((state: TaskState) => state.activateTask)
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const tasksByWorkspace = useTaskStore((state: TaskState) => state.tasksByWorkspace)
  const visibleTaskId = useTaskStore((state: TaskState) => state.visibleTaskId)
  const normalizedQuery = useNavigationSearchStore((state) => state.query.trim().toLocaleLowerCase())
  const [operation, setOperation] = useState<ProjectOperation | null>(null)
  const [taskWorkspace, setTaskWorkspace] = useState<Workspace | null>(null)
  const adaptersByVersion = useAdaptersByVersion(
    Object.values(tasksByWorkspace)
      .flat()
      .map((task) => ({ adapterId: task.adapterId, version: task.adapterVersion })),
  )
  const pinned = useMemo(
    () => selectPinnedEntries(projects, scratchWorkspaces, tasksByWorkspace, normalizedQuery),
    [normalizedQuery, projects, scratchWorkspaces, tasksByWorkspace],
  )

  useEffect((): void => {
    for (const { workspace } of pinned) void hydrateWorkspace(workspace.id)
  }, [hydrateWorkspace, pinned])

  return (
    <SidebarGroup>
      <SidebarGroupLabel
        render={
          <button
            aria-label={t('projects.pinned')}
            aria-expanded={isOpen}
            onClick={(): void => onOpenChange(!isOpen)}
            type="button"
          />
        }
      >
        {t('projects.pinned')}
        <ChevronRightIcon className={isOpen ? 'rotate-90' : ''} />
      </SidebarGroupLabel>
      {isOpen ? (
        <SidebarGroupContent>
          {pinned.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-xs">
              <PinIcon className="size-3" />
              {t('projects.noPinned')}
            </p>
          ) : (
            <div className="space-y-2">
              {pinned.map((entry) => (
                <PinnedWorkspaceRow
                  active={workspaceRowIsActive(activeWorkspaceId, visibleTaskId, entry.workspace.id)}
                  activateTask={activateTask}
                  adapterByVersion={adaptersByVersion}
                  entry={entry}
                  key={entry.workspace.id}
                  onOperation={setOperation}
                  onTaskCreate={setTaskWorkspace}
                  query={normalizedQuery}
                  selectWorkspace={selectWorkspace}
                  setWorkspacePinned={setWorkspacePinned}
                  tasks={tasksByWorkspace[entry.workspace.id] ?? []}
                  visibleTaskId={visibleTaskId}
                />
              ))}
            </div>
          )}
        </SidebarGroupContent>
      ) : null}
      <TaskCreateDialog
        onOpenChange={(open): void => {
          if (!open) setTaskWorkspace(null)
        }}
        open={taskWorkspace !== null}
        workspace={taskWorkspace}
      />
      <ProjectOperationDialog onClose={(): void => setOperation(null)} operation={operation} />
    </SidebarGroup>
  )
}

interface ProjectGroupHeaderProps extends NavigationGroupProps {
  onAdd: () => void
  isLoading: boolean
  projectCount: number
}

const ProjectGroupHeader = (props: ProjectGroupHeaderProps): React.JSX.Element => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center">
      <SidebarGroupLabel
        render={
          <button
            aria-label={t('projects.label')}
            aria-expanded={props.isOpen}
            onClick={(): void => props.onOpenChange(!props.isOpen)}
            type="button"
          />
        }
      >
        {t('projects.label')}
        <ChevronRightIcon className={props.isOpen ? 'rotate-90' : ''} />
      </SidebarGroupLabel>
      {props.projectCount > 0 ? (
        <SidebarGroupAction
          aria-label={t('projects.add')}
          className="right-2 size-6 [&>svg]:size-3.5"
          disabled={props.isLoading}
          onClick={props.onAdd}
          title={t('projects.add')}
        >
          <FolderPlusIcon />
        </SidebarGroupAction>
      ) : null}
    </div>
  )
}

export const ProjectNavigation = ({ isOpen, onOpenChange }: NavigationGroupProps): React.JSX.Element => {
  const { t } = useTranslation()
  const activeWorkspaceId = useProjectStore((state) => state.activeWorkspaceId)
  const error = useProjectStore((state) => state.error)
  const isLoading = useProjectStore((state) => state.isLoading)
  const projects = useProjectStore((state) => state.projects)
  const scratchWorkspaces = useProjectStore((state) => state.scratchWorkspaces)
  const selectWorkspace = useProjectStore((state) => state.selectWorkspace)
  const setWorkspacePinned = useProjectStore((state) => state.setWorkspacePinned)
  const activateTask = useTaskStore((state: TaskState) => state.activateTask)
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const tasksByWorkspace = useTaskStore((state: TaskState) => state.tasksByWorkspace)
  const visibleTaskId = useTaskStore((state: TaskState) => state.visibleTaskId)
  const [operation, setOperation] = useState<ProjectOperation | null>(null)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [taskWorkspace, setTaskWorkspace] = useState<Workspace | null>(null)
  const normalizedQuery = useNavigationSearchStore((state) => state.query.trim().toLocaleLowerCase())
  const adaptersByVersion = useAdaptersByVersion(
    Object.values(tasksByWorkspace)
      .flat()
      .map((task) => ({ adapterId: task.adapterId, version: task.adapterVersion })),
  )
  const filteredProjects = useMemo(
    (): ProjectWithWorkspaces[] => filterProjects(projects, tasksByWorkspace, normalizedQuery),
    [normalizedQuery, projects, tasksByWorkspace],
  )

  useEffect((): void => {
    for (const workspace of scratchWorkspaces) void hydrateWorkspace(workspace.id)
  }, [hydrateWorkspace, scratchWorkspaces])

  return (
    <SidebarGroup>
      <ProjectGroupHeader
        isLoading={isLoading}
        isOpen={isOpen}
        onAdd={(): void => setProjectDialogOpen(true)}
        onOpenChange={onOpenChange}
        projectCount={projects.length}
      />
      {isOpen ? (
        <SidebarGroupContent>
          {projects.length === 0 ? (
            <button
              className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs"
              disabled={isLoading}
              onClick={(): void => setProjectDialogOpen(true)}
              type="button"
            >
              <FolderPlusIcon className="size-3" />
              <span>{t('projects.add')}</span>
            </button>
          ) : (
            <ProjectTree
              activeWorkspaceId={activeWorkspaceId}
              adaptersByVersion={adaptersByVersion}
              openTaskDialog={setTaskWorkspace}
              projects={filteredProjects}
              query={normalizedQuery}
              selectWorkspace={selectWorkspace}
              setOperation={setOperation}
              setWorkspacePinned={setWorkspacePinned}
              visibleTaskId={visibleTaskId}
            />
          )}
          <ScratchTaskRows
            adaptersByVersion={adaptersByVersion}
            activateTask={activateTask}
            query={normalizedQuery}
            selectWorkspace={selectWorkspace}
            tasksByWorkspace={tasksByWorkspace}
            visibleTaskId={visibleTaskId}
            workspaces={scratchWorkspaces}
          />
          {error ? <p className="text-destructive px-2 py-2 text-xs">{error}</p> : null}
          <ProjectOperationDialog onClose={(): void => setOperation(null)} operation={operation} />
          <TaskCreateDialog
            onOpenChange={(open): void => {
              if (!open) setTaskWorkspace(null)
            }}
            open={taskWorkspace !== null}
            workspace={taskWorkspace}
          />
        </SidebarGroupContent>
      ) : null}
      <ProjectCreateDialog onOpenChange={setProjectDialogOpen} open={projectDialogOpen} />
    </SidebarGroup>
  )
}
