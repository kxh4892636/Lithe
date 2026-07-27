import type { AdapterSummary, Task, Workspace } from '../../../../shared/app-contract'
import { TaskRow } from '../tasks/task-row'
import { adapterVersionKey } from '../tasks/use-adapters-by-version'
import { scratchTaskListKey, useVisibleTaskList } from './task-list-expansion'
import { TaskListShowMoreRow } from './task-list-show-more-row'

interface ScratchTaskRowsProps {
  activateTask: (taskId: string) => Promise<unknown>
  adaptersByVersion: Map<string, AdapterSummary>
  query: string
  selectWorkspace: (workspaceId: string) => Promise<void>
  tasksByWorkspace: Record<string, Task[]>
  visibleTaskId: string | null
  workspaces: Workspace[]
}

export const ScratchTaskRows = (props: ScratchTaskRowsProps): React.JSX.Element => {
  // 无项目任务跨临时工作区平铺为同一个列表，整体共用一份上限
  const tasks = props.workspaces
    .flatMap((workspace) =>
      (props.tasksByWorkspace[workspace.id] ?? []).map((task): { task: Task; workspace: Workspace } => ({
        task,
        workspace,
      })),
    )
    .filter(({ task }): boolean => !props.query || task.name.toLocaleLowerCase().includes(props.query))
  const { hasMore, showMore, visibleTasks } = useVisibleTaskList(scratchTaskListKey, tasks, props.query)
  return (
    <>
      {visibleTasks.map(({ task, workspace }) => (
        <TaskRow
          adapter={props.adaptersByVersion.get(adapterVersionKey(task.adapterId, task.adapterVersion))}
          key={task.id}
          onOpen={(): void =>
            void props
              .selectWorkspace(workspace.id)
              .then((): Promise<unknown> => props.activateTask(task.id))
              .catch(globalThis.console.error)
          }
          selected={props.visibleTaskId === task.id}
          task={task}
        />
      ))}
      {hasMore ? <TaskListShowMoreRow onClick={showMore} /> : null}
    </>
  )
}
