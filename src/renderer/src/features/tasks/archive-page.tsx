import { ArchiveRestoreIcon, Trash2Icon } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { findActiveWorkspace, useProjectStore } from '@/features/projects/project-store'

import type { Task } from '../../../../shared/app-contract'
import { useTaskStore, type TaskState } from './task-store'

export const ArchivePage = (): React.JSX.Element => {
  const archivedTasks = useTaskStore((state: TaskState) => state.archivedTasks)
  const deleteTask = useTaskStore((state: TaskState) => state.deleteTask)
  const hydrateArchived = useTaskStore((state: TaskState) => state.hydrateArchived)
  const restoreTask = useTaskStore((state: TaskState) => state.restoreTask)
  const projects = useProjectStore((state) => state.projects)
  const scratchWorkspaces = useProjectStore((state) => state.scratchWorkspaces)

  useEffect((): void => {
    void hydrateArchived()
  }, [hydrateArchived])

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8 lg:p-12">
      <header>
        <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">任务组织</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">已归档任务</h1>
        <p className="text-muted-foreground mt-2 text-sm">恢复只还原任务与布局，不会自动启动 Coding Agent。</p>
      </header>
      <div className="divide-y rounded-xl border">
        {archivedTasks.length === 0 ? (
          <p className="text-muted-foreground p-6 text-sm">暂无已归档任务。</p>
        ) : (
          archivedTasks.map((task: Task) => {
            const workspace = findActiveWorkspace(projects, scratchWorkspaces, task.workspaceId)
            return (
              <article className="flex items-center gap-4 p-4" key={task.id}>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-medium">{task.name}</h2>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {workspace?.name ?? '无效工作区'}
                    {task.archivedAt ? ` · ${task.archivedAt.toLocaleString()}` : ''}
                  </p>
                </div>
                <Button
                  onClick={(): void => {
                    void restoreTask(task.id)
                  }}
                  size="sm"
                  variant="outline"
                >
                  <ArchiveRestoreIcon />
                  恢复
                </Button>
                <Button
                  onClick={(): void => {
                    void deleteTask(task.id)
                  }}
                  size="icon-sm"
                  title="删除"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
