import { BotIcon, ChevronRightIcon, FolderIcon, FolderPlusIcon, GitBranchIcon, PinIcon } from 'lucide-react'
import { useEffect } from 'react'
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

import type { ProjectWithWorkspaces } from '../../../../shared/app-contract'
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
}

const ProjectTree = ({ activeWorkspaceId, projects, selectWorkspace }: ProjectTreeProps): React.JSX.Element => {
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
                </SidebarMenuSubButton>
                {(tasksByWorkspace[workspace.id] ?? []).map((task) => (
                  <button
                    className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 py-1 pl-7 text-left text-xs"
                    key={task.id}
                    onClick={(): void => {
                      void selectWorkspace(workspace.id).then((): void => openTask(task.id))
                    }}
                    type="button"
                  >
                    <BotIcon className="size-3" />
                    <span className="truncate">{task.name}</span>
                  </button>
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
          <p className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-xs">
            <PinIcon className="size-3" />
            {t('projects.noPinned')}
          </p>
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
  const selectWorkspace = useProjectStore((state) => state.selectWorkspace)

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
            <ProjectTree activeWorkspaceId={activeWorkspaceId} projects={projects} selectWorkspace={selectWorkspace} />
          )}
          {error ? <p className="text-destructive px-2 py-2 text-xs">{error}</p> : null}
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  )
}
