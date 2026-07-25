import type { AdapterSummary, Task, Workspace } from '../../../../shared/app-contract'
import { TaskRow } from '../tasks/task-row'

interface ScratchTaskRowsProps {
  adaptersByVersion: Map<string, AdapterSummary>
  openTask: (taskId: string) => void
  query: string
  selectWorkspace: (workspaceId: string) => Promise<void>
  tasksByWorkspace: Record<string, Task[]>
  workspaces: Workspace[]
}

export const ScratchTaskRows = (props: ScratchTaskRowsProps): React.JSX.Element => (
  <>
    {props.workspaces.flatMap((workspace) =>
      (props.tasksByWorkspace[workspace.id] ?? [])
        .filter((task): boolean => !props.query || task.name.toLocaleLowerCase().includes(props.query))
        .map((task) => (
          <TaskRow
            adapter={props.adaptersByVersion.get(task.adapterVersionId)}
            key={task.id}
            onOpen={(): void => void props.selectWorkspace(workspace.id).then((): void => props.openTask(task.id))}
            task={task}
          />
        )),
    )}
  </>
)
