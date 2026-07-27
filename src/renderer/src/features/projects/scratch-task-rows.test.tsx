import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Task, Workspace } from '../../../../shared/app-contract'
import { ScratchTaskRows } from './scratch-task-rows'
import { taskListPageSize, useTaskListExpansion } from './task-list-expansion'

const createWorkspace = (id: string): Workspace => ({
  id,
  projectId: null,
  name: '临时工作区',
  rootPath: `D:\\projects\\${id}`,
  gitBranch: null,
  kind: 'scratch',
  createdAt: new Date(0),
})

const createTask = (workspaceId: string, index: number): Task => ({
  id: `task-${workspaceId}-${index}`,
  workspaceId,
  name: `Scratch ${workspaceId} ${index}`,
  adapterVersionId: 'adapter-v1',
  agentStatus: 'closed',
  agentSessionId: 'session-1',
  archivedAt: null,
  createdAt: new Date(index * 1000),
  isUnread: false,
  lifecycle: 'active',
  lastAttentionAt: null,
  lastViewedAt: null,
  shouldAutoRestore: false,
})

const renderRows = (query: string, tasksByWorkspace: Record<string, Task[]>): void => {
  render(
    <ScratchTaskRows
      activateTask={vi.fn<(taskId: string) => Promise<unknown>>().mockResolvedValue(undefined)}
      adaptersByVersion={new Map()}
      query={query}
      selectWorkspace={vi.fn<(workspaceId: string) => Promise<void>>().mockResolvedValue(undefined)}
      tasksByWorkspace={tasksByWorkspace}
      visibleTaskId={null}
      workspaces={[createWorkspace('ws-1'), createWorkspace('ws-2')]}
    />,
  )
}

beforeEach((): void => {
  useTaskListExpansion.setState({ visibleCountByKey: {} })
})

afterEach((): void => {
  cleanup()
})

describe('scratch task rows', (): void => {
  it('limits the flattened scratch list as a whole and reveals more on demand', (): void => {
    const tasksByWorkspace = {
      'ws-1': Array.from({ length: 6 }, (_value, index): Task => createTask('ws-1', index + 1)),
      'ws-2': Array.from({ length: 5 }, (_value, index): Task => createTask('ws-2', index + 1)),
    }
    renderRows('', tasksByWorkspace)

    expect(screen.getAllByTitle(/^Scratch /)).toHaveLength(taskListPageSize)
    fireEvent.click(screen.getByRole('button', { name: '展开更多' }))

    expect(screen.getAllByTitle(/^Scratch /)).toHaveLength(11)
    expect(screen.queryByRole('button', { name: '展开更多' })).not.toBeInTheDocument()
  })

  it('ignores the limit while a search query is active', (): void => {
    const tasksByWorkspace = {
      'ws-1': Array.from({ length: 6 }, (_value, index): Task => createTask('ws-1', index + 1)),
      'ws-2': Array.from({ length: 5 }, (_value, index): Task => createTask('ws-2', index + 1)),
    }
    renderRows('scratch', tasksByWorkspace)

    expect(screen.getAllByTitle(/^Scratch /)).toHaveLength(11)
    expect(screen.queryByRole('button', { name: '展开更多' })).not.toBeInTheDocument()
  })
})
