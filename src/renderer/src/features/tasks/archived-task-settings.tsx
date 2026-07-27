import { ArchiveRestoreIcon, Trash2Icon } from 'lucide-react'
import { useEffect } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { findActiveWorkspace, useProjectStore } from '@/features/projects/project-store'

import type { Task } from '../../../../shared/app-contract'
import { useTaskStore, type TaskState } from './task-store'
import { useAdaptersByVersion } from './use-adapters-by-version'

export const ArchivedTaskSettings = (): React.JSX.Element => {
  const archivedTasks = useTaskStore((state: TaskState) => state.archivedTasks)
  const deleteTask = useTaskStore((state: TaskState) => state.deleteTask)
  const hydrateArchived = useTaskStore((state: TaskState) => state.hydrateArchived)
  const restoreTask = useTaskStore((state: TaskState) => state.restoreTask)
  const projects = useProjectStore((state) => state.projects)
  const scratchWorkspaces = useProjectStore((state) => state.scratchWorkspaces)
  const adaptersByVersion = useAdaptersByVersion(archivedTasks.map((task): string => task.adapterVersionId))
  const reportTaskAction = (action: Promise<unknown>): void => {
    void action.catch(globalThis.console.error)
  }

  useEffect((): void => {
    void hydrateArchived()
  }, [hydrateArchived])

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">已归档任务</h2>
        <p className="text-muted-foreground mt-2 text-sm">恢复只还原任务与布局，不会自动启动 Coding Agent。</p>
      </header>
      <div className="divide-y rounded-xl border">
        {archivedTasks.length === 0 ? (
          <p className="text-muted-foreground p-6 text-sm">暂无已归档任务。</p>
        ) : (
          archivedTasks.map((task: Task) => {
            const workspace = findActiveWorkspace(projects, scratchWorkspaces, task.workspaceId)
            const adapter = adaptersByVersion.get(task.adapterVersionId)
            return (
              <ContextMenu key={task.id}>
                <ContextMenuTrigger render={<article className="flex items-center gap-4 p-4" />}>
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-1 truncate text-sm font-medium">
                      <Badge className="h-4 px-1 text-[9px]" variant="secondary">
                        {adapter?.name ?? 'agent'}
                      </Badge>
                      <span className="truncate">-{task.name}</span>
                    </h3>
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                      {workspace?.name ?? '无效工作区'}
                      {task.archivedAt ? ` · ${task.archivedAt.toLocaleString()}` : ''}
                    </p>
                  </div>
                  <Button onClick={(): void => reportTaskAction(restoreTask(task.id))} size="sm" variant="outline">
                    <ArchiveRestoreIcon />
                    恢复
                  </Button>
                  <Button
                    aria-label={`删除 ${task.name}`}
                    onClick={(): void => reportTaskAction(deleteTask(task.id))}
                    size="icon-sm"
                    title="删除"
                    variant="ghost"
                  >
                    <Trash2Icon />
                  </Button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={(): void => reportTaskAction(restoreTask(task.id))}>
                    <ArchiveRestoreIcon />
                    恢复
                  </ContextMenuItem>
                  <ContextMenuItem onClick={(): void => reportTaskAction(deleteTask(task.id))} variant="destructive">
                    <Trash2Icon />
                    删除
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })
        )}
      </div>
    </section>
  )
}
