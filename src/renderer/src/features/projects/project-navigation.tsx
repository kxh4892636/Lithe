import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  GitForkIcon,
  GitBranchIcon,
  PinIcon,
  PlusIcon,
  PencilIcon,
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
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'

import type { AdapterSummary, ProjectWithWorkspaces, Task, Workspace } from '../../../../shared/app-contract'
import { useNavigationSearchStore } from '../../app/navigation-search-store'
import { TaskCreateDialog } from '../tasks/task-create-dialog'
import { TaskRow } from '../tasks/task-row'
import { useTaskStore, type TaskState } from '../tasks/task-store'
import { useAdaptersByVersion } from '../tasks/use-adapters-by-version'
import { filterProjects } from './project-navigation-filter'
import { ProjectOperationDialog, type ProjectOperation } from './project-operation-dialog'
import { useProjectStore } from './project-store'
import { ScratchTaskRows } from './scratch-task-rows'

interface NavigationGroupProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

interface ProjectTreeProps {
  activeWorkspaceId: string | null
  adaptersByVersion: Map<string, AdapterSummary>
  openTaskDialog: (workspace: Workspace) => void
  projects: ProjectWithWorkspaces[]
  selectWorkspace: (workspaceId: string) => Promise<void>
  setOperation: (operation: ProjectOperation) => void
  setWorkspacePinned: (workspaceId: string, isPinned: boolean) => Promise<void>
}

interface WorkspaceRowProps extends Omit<ProjectTreeProps, 'projects'> {
  openTask: (taskId: string) => void
  project: ProjectWithWorkspaces
  tasks: Task[]
  workspace: Workspace
}

interface WorkspaceContextItemsProps {
  openTaskDialog: (workspace: Workspace) => void
  project: ProjectWithWorkspaces
  setOperation: (operation: ProjectOperation) => void
  setWorkspacePinned: (workspaceId: string, isPinned: boolean) => Promise<void>
  workspace: Workspace
}

const WorkspaceContextItems = ({
  openTaskDialog,
  project,
  setOperation,
  setWorkspacePinned,
  workspace,
}: WorkspaceContextItemsProps): React.JSX.Element => (
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
    {workspace.kind === 'derived' ? (
      <>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={(): void => setOperation({ kind: 'rename', workspace })}>
          <PencilIcon />
          重命名
        </ContextMenuItem>
        <ContextMenuItem onClick={(): void => setOperation({ kind: 'delete', workspace })} variant="destructive">
          <Trash2Icon />
          删除
        </ContextMenuItem>
      </>
    ) : null}
  </>
)

const WorkspaceRow = (props: WorkspaceRowProps): React.JSX.Element => {
  const { activeWorkspaceId, adaptersByVersion, openTask, selectWorkspace, tasks, workspace } = props
  return (
    <SidebarMenuSubItem className="group/workspace">
      <ContextMenu>
        <ContextMenuTrigger render={<div className="flex min-w-0 items-center" />}>
          <SidebarMenuSubButton
            className="min-w-0 flex-1"
            isActive={workspace.id === activeWorkspaceId}
            onClick={(): void => void selectWorkspace(workspace.id)}
            render={<button aria-label={workspace.name} type="button" />}
          >
            <span className="flex min-w-0 flex-col items-start py-1">
              <span className="truncate">{workspace.name}</span>
              {workspace.gitBranch ? (
                <span className="text-muted-foreground flex max-w-full items-center gap-1 truncate text-[10px]">
                  <GitBranchIcon className="size-2.5" />
                  {workspace.gitBranch}
                </span>
              ) : null}
            </span>
          </SidebarMenuSubButton>
          <div className="invisible flex shrink-0 items-center group-focus-within/workspace:visible group-hover/workspace:visible">
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
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <WorkspaceContextItems {...props} />
        </ContextMenuContent>
      </ContextMenu>
      {tasks.map((task) => (
        <TaskRow
          adapter={adaptersByVersion.get(task.adapterVersionId)}
          key={task.id}
          onOpen={(): void => void selectWorkspace(workspace.id).then((): void => openTask(task.id))}
          task={task}
        />
      ))}
    </SidebarMenuSubItem>
  )
}

interface ProjectRowProps extends Omit<ProjectTreeProps, 'projects'> {
  openTask: (taskId: string) => void
  project: ProjectWithWorkspaces
  tasksByWorkspace: Record<string, Task[]>
}

const ProjectRow = (props: ProjectRowProps): React.JSX.Element => {
  const { project, setOperation } = props
  const removeOperation: ProjectOperation = project.isValid ? { kind: 'remove', project } : { kind: 'forget', project }
  return (
    <SidebarMenuItem className="group/project">
      <ContextMenu>
        <ContextMenuTrigger render={<div className="flex min-w-0 items-center" />}>
          <SidebarMenuButton className={project.isValid ? 'min-w-0 flex-1' : 'text-destructive min-w-0 flex-1'}>
            <FolderIcon />
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
        <ContextMenuContent>
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
      <SidebarMenuSub>
        {project.workspaces.map((workspace) => (
          <WorkspaceRow
            {...props}
            key={workspace.id}
            tasks={props.tasksByWorkspace[workspace.id] ?? []}
            workspace={workspace}
          />
        ))}
      </SidebarMenuSub>
    </SidebarMenuItem>
  )
}

const ProjectTree = (props: ProjectTreeProps): React.JSX.Element => {
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const openTask = useTaskStore((state: TaskState) => state.openTask)
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
          openTask={openTask}
          project={project}
          tasksByWorkspace={tasksByWorkspace}
        />
      ))}
    </SidebarMenu>
  )
}

interface PinnedWorkspaceRowProps {
  active: boolean
  adapterByVersion: Map<string, AdapterSummary>
  entry: { project?: ProjectWithWorkspaces; workspace: Workspace }
  onOperation: (operation: ProjectOperation) => void
  onTaskCreate: (workspace: Workspace) => void
  openTask: (taskId: string) => void
  selectWorkspace: (workspaceId: string) => Promise<void>
  setWorkspacePinned: (workspaceId: string, isPinned: boolean) => Promise<void>
  tasks: Task[]
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
    <ContextMenuItem onClick={(): void => onTaskCreate(workspace)}>
      <SquarePenIcon />
      创建任务
    </ContextMenuItem>
    <ContextMenuItem onClick={(): void => void setWorkspacePinned(workspace.id, false)}>
      <PinIcon />
      取消置顶
    </ContextMenuItem>
    {project ? (
      <ContextMenuItem onClick={(): void => onOperation({ kind: 'create', project, sourceWorkspace: workspace })}>
        <GitForkIcon />
        派生工作区
      </ContextMenuItem>
    ) : null}
    {workspace.kind === 'derived' ? (
      <>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={(): void => onOperation({ kind: 'rename', workspace })}>
          <PencilIcon />
          重命名
        </ContextMenuItem>
        <ContextMenuItem onClick={(): void => onOperation({ kind: 'delete', workspace })} variant="destructive">
          <Trash2Icon />
          删除
        </ContextMenuItem>
      </>
    ) : null}
  </>
)

const PinnedWorkspaceRow = (props: PinnedWorkspaceRowProps): React.JSX.Element => {
  const { adapterByVersion, entry, openTask, selectWorkspace, setWorkspacePinned, tasks } = props
  const { workspace } = entry
  return (
    <div className={props.active ? 'group/pinned bg-sidebar-accent/60 rounded-md' : 'group/pinned'}>
      <ContextMenu>
        <ContextMenuTrigger render={<div className="flex items-center px-2 py-1 text-xs" />}>
          <button
            className="min-w-0 flex-1 truncate text-left font-medium"
            onClick={(): void => void selectWorkspace(workspace.id)}
            type="button"
          >
            {workspace.name}
          </button>
          <Button
            aria-label={`在 ${workspace.name} 创建任务`}
            className="invisible group-focus-within/pinned:visible group-hover/pinned:visible"
            onClick={(): void => props.onTaskCreate(workspace)}
            size="icon-xs"
            variant="ghost"
          >
            <SquarePenIcon />
          </Button>
          <Button
            aria-label="取消置顶此工作区"
            className="invisible group-focus-within/pinned:visible group-hover/pinned:visible"
            onClick={(): void => void setWorkspacePinned(workspace.id, false)}
            size="icon-xs"
            variant="ghost"
          >
            <PinIcon className="fill-current" />
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <PinnedContextItems {...props} />
        </ContextMenuContent>
      </ContextMenu>
      {tasks.map((task) => (
        <TaskRow
          adapter={adapterByVersion.get(task.adapterVersionId)}
          key={task.id}
          onOpen={(): void => void selectWorkspace(workspace.id).then((): void => openTask(task.id))}
          task={task}
        />
      ))}
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
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const openTask = useTaskStore((state: TaskState) => state.openTask)
  const tasksByWorkspace = useTaskStore((state: TaskState) => state.tasksByWorkspace)
  const normalizedQuery = useNavigationSearchStore((state) => state.query.trim().toLocaleLowerCase())
  const [operation, setOperation] = useState<ProjectOperation | null>(null)
  const [taskWorkspace, setTaskWorkspace] = useState<Workspace | null>(null)
  const adaptersByVersion = useAdaptersByVersion(
    Object.values(tasksByWorkspace)
      .flat()
      .map((task): string => task.adapterVersionId),
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
        <ChevronRightIcon className={isOpen ? 'rotate-90' : ''} />
        {t('projects.pinned')}
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
                  active={entry.workspace.id === activeWorkspaceId}
                  adapterByVersion={adaptersByVersion}
                  entry={entry}
                  key={entry.workspace.id}
                  onOperation={setOperation}
                  onTaskCreate={setTaskWorkspace}
                  openTask={openTask}
                  selectWorkspace={selectWorkspace}
                  setWorkspacePinned={setWorkspacePinned}
                  tasks={tasksByWorkspace[entry.workspace.id] ?? []}
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
  addDirectory: () => Promise<void>
  isLoading: boolean
  projectCount: number
}

const ProjectGroupHeader = (props: ProjectGroupHeaderProps): React.JSX.Element => {
  const { t } = useTranslation()
  return (
    <>
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
        <ChevronRightIcon className={props.isOpen ? 'rotate-90' : ''} />
        {t('projects.label')}
      </SidebarGroupLabel>
      {props.projectCount > 0 ? (
        <SidebarGroupAction
          aria-label={t('projects.add')}
          disabled={props.isLoading}
          onClick={(): void => void props.addDirectory()}
          title={t('projects.add')}
        >
          <FolderPlusIcon />
        </SidebarGroupAction>
      ) : null}
    </>
  )
}

export const ProjectNavigation = ({ isOpen, onOpenChange }: NavigationGroupProps): React.JSX.Element => {
  const { t } = useTranslation()
  const activeWorkspaceId = useProjectStore((state) => state.activeWorkspaceId)
  const addDirectory = useProjectStore((state) => state.addDirectory)
  const error = useProjectStore((state) => state.error)
  const isLoading = useProjectStore((state) => state.isLoading)
  const projects = useProjectStore((state) => state.projects)
  const scratchWorkspaces = useProjectStore((state) => state.scratchWorkspaces)
  const selectWorkspace = useProjectStore((state) => state.selectWorkspace)
  const setWorkspacePinned = useProjectStore((state) => state.setWorkspacePinned)
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const openTask = useTaskStore((state: TaskState) => state.openTask)
  const tasksByWorkspace = useTaskStore((state: TaskState) => state.tasksByWorkspace)
  const [operation, setOperation] = useState<ProjectOperation | null>(null)
  const [taskWorkspace, setTaskWorkspace] = useState<Workspace | null>(null)
  const normalizedQuery = useNavigationSearchStore((state) => state.query.trim().toLocaleLowerCase())
  const adaptersByVersion = useAdaptersByVersion(
    Object.values(tasksByWorkspace)
      .flat()
      .map((task): string => task.adapterVersionId),
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
        addDirectory={addDirectory}
        isLoading={isLoading}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        projectCount={projects.length}
      />
      {isOpen ? (
        <SidebarGroupContent>
          {projects.length === 0 ? (
            <button
              className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs"
              disabled={isLoading}
              onClick={(): void => {
                void addDirectory()
              }}
              type="button"
            >
              <FolderPlusIcon className="size-4" />
              <span>{t('projects.add')}</span>
            </button>
          ) : (
            <ProjectTree
              activeWorkspaceId={activeWorkspaceId}
              adaptersByVersion={adaptersByVersion}
              openTaskDialog={setTaskWorkspace}
              projects={filteredProjects}
              selectWorkspace={selectWorkspace}
              setOperation={setOperation}
              setWorkspacePinned={setWorkspacePinned}
            />
          )}
          <ScratchTaskRows
            adaptersByVersion={adaptersByVersion}
            openTask={openTask}
            query={normalizedQuery}
            selectWorkspace={selectWorkspace}
            tasksByWorkspace={tasksByWorkspace}
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
    </SidebarGroup>
  )
}
