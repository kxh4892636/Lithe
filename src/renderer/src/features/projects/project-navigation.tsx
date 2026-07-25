import {
  ArchiveIcon,
  BotIcon,
  ChevronRightIcon,
  CircleIcon,
  FolderIcon,
  FolderPlusIcon,
  GitBranchIcon,
  PinIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

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

import type { ProjectWithWorkspaces, Task, Workspace } from '../../../../shared/app-contract'
import { useTaskStore, type TaskState } from '../tasks/task-store'
import { useProjectStore } from './project-store'

interface NavigationGroupProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

interface ProjectTreeProps {
  activeWorkspaceId: string | null
  projects: ProjectWithWorkspaces[]
  selectWorkspace: (workspaceId: string) => Promise<void>
  setWorkspacePinned: (workspaceId: string, isPinned: boolean) => Promise<void>
}

interface TaskRowProps {
  onOpen: () => void
  task: Task
}

const TaskRow = ({ onOpen, task }: TaskRowProps): React.JSX.Element => {
  const archiveTask = useTaskStore((state: TaskState) => state.archiveTask)
  const deleteTask = useTaskStore((state: TaskState) => state.deleteTask)
  return (
    <div className="group/task flex items-center">
      <button
        className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-7 text-left text-xs"
        onClick={onOpen}
        type="button"
      >
        {task.isRunning ? (
          <CircleIcon className="size-3 fill-emerald-500 text-emerald-500" />
        ) : (
          <BotIcon className="size-3" />
        )}
        <span className={task.isUnread ? 'text-foreground truncate font-medium' : 'truncate'}>{task.name}</span>
        {task.isUnread ? <span className="bg-primary ml-auto size-1.5 rounded-full" aria-label="未读" /> : null}
      </button>
      <button
        aria-label={`归档 ${task.name}`}
        className="hover:text-foreground hidden p-1 group-hover/task:block disabled:opacity-40"
        disabled={task.isRunning}
        onClick={(): void => {
          void archiveTask(task.id)
        }}
        title={task.isRunning ? '运行中任务不能归档' : '归档'}
        type="button"
      >
        <ArchiveIcon className="size-3" />
      </button>
      <button
        aria-label={`删除 ${task.name}`}
        className="hover:text-destructive hidden p-1 group-hover/task:block"
        onClick={(): void => {
          void deleteTask(task.id)
        }}
        title="删除"
        type="button"
      >
        <Trash2Icon className="size-3" />
      </button>
    </div>
  )
}

const ProjectTree = ({
  activeWorkspaceId,
  projects,
  selectWorkspace,
  setWorkspacePinned,
}: ProjectTreeProps): React.JSX.Element => {
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const openTask = useTaskStore((state: TaskState) => state.openTask)
  const tasksByWorkspace = useTaskStore((state: TaskState) => state.tasksByWorkspace)

  useEffect((): void => {
    for (const project of projects) {
      for (const workspace of project.workspaces) void hydrateWorkspace(workspace.id)
    }
  }, [hydrateWorkspace, projects])

  return (
    <SidebarMenu>
      {projects.map((project) => (
        <SidebarMenuItem key={project.id}>
          <SidebarMenuButton tooltip={project.name}>
            <FolderIcon />
            <span>{project.name}</span>
          </SidebarMenuButton>
          <SidebarMenuSub>
            {project.workspaces.map((workspace) => (
              <SidebarMenuSubItem key={workspace.id}>
                <SidebarMenuSubButton
                  isActive={workspace.id === activeWorkspaceId}
                  onClick={(): void => {
                    void selectWorkspace(workspace.id)
                  }}
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
                  <button
                    aria-label={workspace.pinnedAt ? '取消置顶此工作区' : '置顶此工作区'}
                    className="ml-auto p-1"
                    onClick={(event: React.MouseEvent): void => {
                      event.stopPropagation()
                      void setWorkspacePinned(workspace.id, !workspace.pinnedAt)
                    }}
                    type="button"
                  >
                    <PinIcon className={workspace.pinnedAt ? 'size-3 fill-current' : 'size-3'} />
                  </button>
                </SidebarMenuSubButton>
                {(tasksByWorkspace[workspace.id] ?? []).map((task: Task) => (
                  <TaskRow
                    key={task.id}
                    onOpen={(): void => {
                      void selectWorkspace(workspace.id).then((): void => openTask(task.id))
                    }}
                    task={task}
                  />
                ))}
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
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
  const pinned = useMemo(
    (): Workspace[] =>
      projects
        .flatMap((project): Workspace[] => project.workspaces)
        .concat(scratchWorkspaces)
        .filter((workspace): boolean => Boolean(workspace.pinnedAt))
        .sort((left, right): number => (right.pinnedAt?.getTime() ?? 0) - (left.pinnedAt?.getTime() ?? 0)),
    [projects, scratchWorkspaces],
  )

  useEffect((): void => {
    for (const workspace of pinned) void hydrateWorkspace(workspace.id)
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
              {pinned.map((workspace) => (
                <div
                  className={workspace.id === activeWorkspaceId ? 'bg-sidebar-accent/60 rounded-md' : ''}
                  key={workspace.id}
                >
                  <div className="flex items-center px-2 py-1 text-xs">
                    <button
                      className="min-w-0 flex-1 truncate text-left font-medium"
                      onClick={(): void => {
                        void selectWorkspace(workspace.id)
                      }}
                      type="button"
                    >
                      {workspace.name}
                    </button>
                    <button
                      aria-label="取消置顶此工作区"
                      onClick={(): void => {
                        void setWorkspacePinned(workspace.id, false)
                      }}
                      type="button"
                    >
                      <PinIcon className="size-3 fill-current" />
                    </button>
                  </div>
                  {(tasksByWorkspace[workspace.id] ?? []).map((task: Task) => (
                    <TaskRow
                      key={task.id}
                      onOpen={(): void => {
                        void selectWorkspace(workspace.id).then((): void => openTask(task.id))
                      }}
                      task={task}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
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
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredProjects = useMemo(
    (): ProjectWithWorkspaces[] =>
      normalizedQuery
        ? projects
            .map(
              (project): ProjectWithWorkspaces => ({
                ...project,
                workspaces: project.workspaces.filter(
                  (workspace): boolean =>
                    project.name.toLocaleLowerCase().includes(normalizedQuery) ||
                    workspace.name.toLocaleLowerCase().includes(normalizedQuery) ||
                    (tasksByWorkspace[workspace.id] ?? []).some((task: Task): boolean =>
                      task.name.toLocaleLowerCase().includes(normalizedQuery),
                    ),
                ),
              }),
            )
            .filter((project): boolean => project.workspaces.length > 0)
        : projects,
    [normalizedQuery, projects, tasksByWorkspace],
  )

  useEffect((): void => {
    for (const workspace of scratchWorkspaces) void hydrateWorkspace(workspace.id)
  }, [hydrateWorkspace, scratchWorkspaces])

  return (
    <SidebarGroup>
      <SidebarGroupLabel
        render={
          <button
            aria-label={t('projects.label')}
            aria-expanded={isOpen}
            onClick={(): void => onOpenChange(!isOpen)}
            type="button"
          />
        }
      >
        <ChevronRightIcon className={isOpen ? 'rotate-90' : ''} />
        {t('projects.label')}
      </SidebarGroupLabel>
      {projects.length > 0 ? (
        <SidebarGroupAction
          aria-label={t('projects.add')}
          disabled={isLoading}
          onClick={(): void => {
            void addDirectory()
          }}
          title={t('projects.add')}
        >
          <FolderPlusIcon />
        </SidebarGroupAction>
      ) : null}
      {isOpen ? (
        <SidebarGroupContent>
          <label className="relative mb-2 block px-2">
            <SearchIcon className="text-muted-foreground absolute top-1.5 left-4 size-3" />
            <input
              aria-label="搜索项目、工作区和任务"
              className="bg-sidebar-accent/50 h-6 w-full rounded-md border-0 pr-2 pl-7 text-xs outline-none"
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setQuery(event.target.value)}
              placeholder="搜索"
              value={query}
            />
          </label>
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
              projects={filteredProjects}
              selectWorkspace={selectWorkspace}
              setWorkspacePinned={setWorkspacePinned}
            />
          )}
          {scratchWorkspaces.flatMap((workspace) =>
            (tasksByWorkspace[workspace.id] ?? [])
              .filter(
                (task: Task): boolean => !normalizedQuery || task.name.toLocaleLowerCase().includes(normalizedQuery),
              )
              .map((task: Task) => (
                <TaskRow
                  key={task.id}
                  onOpen={(): void => {
                    void selectWorkspace(workspace.id).then((): void => openTask(task.id))
                  }}
                  task={task}
                />
              )),
          )}
          {error ? <p className="text-destructive px-2 py-2 text-xs">{error}</p> : null}
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  )
}
