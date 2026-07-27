import type { AdapterSummary, Task, Workspace } from '../../../../shared/app-contract'
import { TaskRow } from '../tasks/task-row'
import { adapterVersionKey } from '../tasks/use-adapters-by-version'
import { useVisibleTaskList } from './task-list-expansion'
import { TaskListShowMoreRow } from './task-list-show-more-row'

interface WorkspaceTaskListProps {
  activateTask: (taskId: string) => Promise<unknown>
  adaptersByVersion: Map<string, AdapterSummary>
  query: string
  selectWorkspace: (workspaceId: string) => Promise<void>
  tasks: Task[]
  visibleTaskId: string | null
  workspace: Workspace
}

// 项目树与置顶区中同一工作区的任务列表；折叠状态与展开计数均按工作区 ID 共享
export const WorkspaceTaskList = (props: WorkspaceTaskListProps): React.JSX.Element => {
  const { activateTask, adaptersByVersion, query, selectWorkspace, tasks, visibleTaskId, workspace } = props
  const { hasMore, showMore, visibleTasks } = useVisibleTaskList(workspace.id, tasks, query)
  return (
    <>
      {visibleTasks.map((task) => (
        <TaskRow
          adapter={adaptersByVersion.get(adapterVersionKey(task.adapterId, task.adapterVersion))}
          key={task.id}
          onOpen={(): void =>
            void selectWorkspace(workspace.id)
              .then((): Promise<unknown> => activateTask(task.id))
              .catch(globalThis.console.error)
          }
          selected={visibleTaskId === task.id}
          task={task}
        />
      ))}
      {hasMore ? <TaskListShowMoreRow onClick={showMore} /> : null}
    </>
  )
}
