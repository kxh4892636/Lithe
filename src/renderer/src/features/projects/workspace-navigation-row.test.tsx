import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LitheBridge, ProjectWithWorkspaces, Task, Workspace } from '../../../../shared/app-contract'
import { useNavigationRowCollapse } from './navigation-row-collapse'
import type { ProjectOperation } from './project-operation-dialog'
import { taskListPageSize, useTaskListExpansion } from './task-list-expansion'
import { WorkspaceNavigationRow, workspaceNavigationTitle, workspaceRowIsActive } from './workspace-navigation-row'

const workspace: Workspace = {
  id: 'workspace-1',
  projectId: 'project-1',
  name: '默认',
  rootPath: 'D:\\projects\\lithe',
  gitBranch: 'main',
  kind: 'default',
  createdAt: new Date(0),
}

const project: ProjectWithWorkspaces = {
  id: 'project-1',
  name: 'lithe',
  rootPath: 'D:\\projects\\lithe',
  isValid: true,
  createdAt: new Date(0),
  workspaces: [workspace],
}

const createTask = (index: number): Task => ({
  id: `task-${index}`,
  workspaceId: workspace.id,
  name: `Review ${index}`,
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

interface RenderRowOptions {
  query?: string
  tasks?: Task[]
}

const renderRow = ({ query = '', tasks = [createTask(1)] }: RenderRowOptions): void => {
  render(
    <WorkspaceNavigationRow
      activateTask={vi.fn<(taskId: string) => Promise<unknown>>().mockResolvedValue(undefined)}
      activeWorkspaceId={null}
      adaptersByVersion={new Map()}
      openTaskDialog={vi.fn<(workspace: Workspace) => void>()}
      project={project}
      query={query}
      selectWorkspace={vi.fn<(workspaceId: string) => Promise<void>>().mockResolvedValue(undefined)}
      setOperation={vi.fn<(operation: ProjectOperation) => void>()}
      setWorkspacePinned={vi
        .fn<(workspaceId: string, isPinned: boolean) => Promise<void>>()
        .mockResolvedValue(undefined)}
      tasks={tasks}
      visibleTaskId={null}
      workspace={workspace}
    />,
  )
}

beforeEach((): void => {
  window.lithe = {
    preferences: {
      getRowOpen: vi.fn<LitheBridge['preferences']['getRowOpen']>().mockResolvedValue(true),
      setRowOpen: vi.fn<LitheBridge['preferences']['setRowOpen']>().mockResolvedValue(undefined),
    },
  } as unknown as LitheBridge
  useNavigationRowCollapse.setState({ openByKey: {} })
  useTaskListExpansion.setState({ visibleCountByKey: {} })
})

afterEach((): void => {
  cleanup()
  vi.restoreAllMocks()
})

describe('workspace navigation title', (): void => {
  it('combines the Git branch and workspace name on one line', (): void => {
    expect(workspaceNavigationTitle(workspace)).toBe('main - 默认')
    expect(workspaceNavigationTitle({ ...workspace, gitBranch: null })).toBe('默认')
    expect(workspaceNavigationTitle({ ...workspace, gitBranch: 'HEAD@abc1234' })).toBe('HEAD@abc1234 - 默认')
  })

  it('does not highlight the parent workspace while a task is visible', (): void => {
    expect(workspaceRowIsActive(workspace.id, null, workspace.id)).toBe(true)
    expect(workspaceRowIsActive(workspace.id, 'task-1', workspace.id)).toBe(false)
    expect(workspaceRowIsActive('workspace-2', null, workspace.id)).toBe(false)
  })
})

describe('workspace navigation row', (): void => {
  it('collapses and expands the task list, persisting the state per workspace', (): void => {
    renderRow({})

    expect(screen.getByTitle('Review 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '折叠 main - 默认' }))

    expect(screen.queryByTitle('Review 1')).not.toBeInTheDocument()
    expect(window.lithe.preferences.setRowOpen).toHaveBeenCalledWith('workspace-row-open:workspace-1', false)

    fireEvent.click(screen.getByRole('button', { name: '展开 main - 默认' }))

    expect(screen.getByTitle('Review 1')).toBeInTheDocument()
    expect(window.lithe.preferences.setRowOpen).toHaveBeenLastCalledWith('workspace-row-open:workspace-1', true)
  })

  it('limits the task list to one page and reveals the rest on demand', (): void => {
    const tasks = Array.from({ length: taskListPageSize + 2 }, (_value, index): Task => createTask(index + 1))
    renderRow({ tasks })

    expect(screen.getAllByTitle(/^Review /)).toHaveLength(taskListPageSize)
    fireEvent.click(screen.getByRole('button', { name: '展开更多' }))

    expect(screen.getAllByTitle(/^Review /)).toHaveLength(taskListPageSize + 2)
    expect(screen.queryByRole('button', { name: '展开更多' })).not.toBeInTheDocument()
  })

  it('ignores the limit while a search query is active and keeps the count afterwards', (): void => {
    const tasks = Array.from({ length: taskListPageSize + 2 }, (_value, index): Task => createTask(index + 1))
    const { rerender } = render(
      <WorkspaceNavigationRow
        activateTask={vi.fn<(taskId: string) => Promise<unknown>>().mockResolvedValue(undefined)}
        activeWorkspaceId={null}
        adaptersByVersion={new Map()}
        openTaskDialog={vi.fn<(workspace: Workspace) => void>()}
        project={project}
        query="review"
        selectWorkspace={vi.fn<(workspaceId: string) => Promise<void>>().mockResolvedValue(undefined)}
        setOperation={vi.fn<(operation: ProjectOperation) => void>()}
        setWorkspacePinned={vi
          .fn<(workspaceId: string, isPinned: boolean) => Promise<void>>()
          .mockResolvedValue(undefined)}
        tasks={tasks}
        visibleTaskId={null}
        workspace={workspace}
      />,
    )

    expect(screen.getAllByTitle(/^Review /)).toHaveLength(taskListPageSize + 2)
    expect(screen.queryByRole('button', { name: '展开更多' })).not.toBeInTheDocument()

    useTaskListExpansion.getState().showMore(workspace.id)
    rerender(
      <WorkspaceNavigationRow
        activateTask={vi.fn<(taskId: string) => Promise<unknown>>().mockResolvedValue(undefined)}
        activeWorkspaceId={null}
        adaptersByVersion={new Map()}
        openTaskDialog={vi.fn<(workspace: Workspace) => void>()}
        project={project}
        query=""
        selectWorkspace={vi.fn<(workspaceId: string) => Promise<void>>().mockResolvedValue(undefined)}
        setOperation={vi.fn<(operation: ProjectOperation) => void>()}
        setWorkspacePinned={vi
          .fn<(workspaceId: string, isPinned: boolean) => Promise<void>>()
          .mockResolvedValue(undefined)}
        tasks={tasks}
        visibleTaskId={null}
        workspace={workspace}
      />,
    )

    expect(screen.getAllByTitle(/^Review /)).toHaveLength(taskListPageSize + 2)
    expect(screen.queryByRole('button', { name: '展开更多' })).not.toBeInTheDocument()
  })
})
