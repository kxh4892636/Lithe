import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdapterSummary, AgentLaunch, LitheBridge, Task } from '../../../../shared/app-contract'
import { TaskRow } from './task-row'
import { useTaskStore } from './task-store'

const task: Task = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  name: 'Review',
  adapterVersionId: 'adapter-v1',
  agentStatus: 'closed',
  agentSessionId: 'session-1',
  archivedAt: null,
  createdAt: new Date(0),
  isUnread: false,
  lifecycle: 'active',
  lastAttentionAt: null,
  lastViewedAt: null,
  shouldAutoRestore: false,
}

const launch: AgentLaunch = {
  args: [],
  cwd: 'D:\\projects\\lithe',
  error: null,
  executable: 'agent',
  isOpen: true,
  sessionId: 'agent:task-1',
  task,
}

const adapter: AdapterSummary = {
  id: 'adapter-1',
  name: 'Agent',
  kind: 'custom',
  currentVersion: {
    id: 'adapter-v1',
    adapterId: 'adapter-1',
    name: 'Agent',
    kind: 'custom',
    version: 1,
    definition: { executable: 'agent', start: [], resume: [], fork: [] },
    createdAt: new Date(0),
  },
  forkAvailable: true,
  isAvailable: true,
  isDefault: true,
  resumeAvailable: true,
  unavailableReason: null,
  usageCount: 0,
}

afterEach((): void => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('task row', (): void => {
  it('offers stop only from the context menu while the Agent is running', async (): Promise<void> => {
    const runningTask = { ...task, agentStatus: 'running' as const }
    const stop = vi.fn<LitheBridge['agents']['stop']>().mockResolvedValue({ ...task, agentStatus: 'closed' })
    window.lithe = { agents: { stop } } as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: { [task.id]: { ...launch, task: runningTask } } })

    render(<TaskRow adapter={adapter} onOpen={vi.fn<() => void>()} task={runningTask} />)

    expect(screen.getByLabelText('运行中')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fork Review' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fork Review' })).toHaveAttribute('title', '请先停止任务')
    const taskButton = screen.getByTitle('Review').closest('button')
    if (!taskButton) throw new Error('任务按钮未渲染')
    fireEvent.contextMenu(taskButton)
    fireEvent.click(await screen.findByRole('menuitem', { name: '停止' }))

    await waitFor((): void => expect(stop).toHaveBeenCalledWith(task.id))
  })

  it('shows idle separately and allows stop, Fork, and archive', async (): Promise<void> => {
    const idleTask = { ...task, agentStatus: 'idle' as const }
    window.lithe = { agents: { stop: vi.fn<LitheBridge['agents']['stop']>() } } as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: {} })

    render(<TaskRow adapter={adapter} onOpen={vi.fn<() => void>()} task={idleTask} />)

    expect(screen.getByLabelText('空闲')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fork Review' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '归档 Review' })).toBeEnabled()
    const taskButton = screen.getByTitle('Review').closest('button')
    if (!taskButton) throw new Error('任务按钮未渲染')
    fireEvent.contextMenu(taskButton)
    expect(await screen.findByRole('menuitem', { name: '停止' })).toBeInTheDocument()
  })

  it('uses the Bot icon for a closed task without a stop action', async (): Promise<void> => {
    window.lithe = {} as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: {} })

    render(<TaskRow adapter={adapter} onOpen={vi.fn<() => void>()} task={task} />)

    expect(screen.getByLabelText('关闭')).toBeInTheDocument()
    const taskButton = screen.getByTitle('Review').closest('button')
    if (!taskButton) throw new Error('任务按钮未渲染')
    fireEvent.contextMenu(taskButton)
    expect(screen.queryByRole('menuitem', { name: '停止' })).not.toBeInTheDocument()
  })

  it('keeps unsupported Fork visible with an actionable reason', (): void => {
    window.lithe = {} as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: {} })

    render(<TaskRow onOpen={vi.fn<() => void>()} task={{ ...task, agentSessionId: null }} />)

    expect(screen.getByRole('button', { name: 'Fork Review' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fork Review' })).toHaveAttribute('title', '任务尚未绑定 Agent 会话')
  })

  it('uses the whole row for an overflowing title while actions float above it', (): void => {
    window.lithe = {} as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: {} })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(160)
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(240)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(48)

    render(<TaskRow adapter={adapter} onOpen={vi.fn<() => void>()} task={task} />)

    expect(screen.queryByText('-Review')).not.toBeInTheDocument()
    expect(screen.getByTitle('Review')).toHaveAttribute('data-overflow', 'true')
    expect(screen.getByRole('button', { name: 'Fork Review' }).parentElement).toHaveClass('absolute')
  })

  it('highlights the row only while selected, without revealing the hover-gated actions', (): void => {
    window.lithe = {} as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: {} })

    const { rerender } = render(<TaskRow onOpen={vi.fn<() => void>()} selected task={task} />)

    const row = screen.getByTitle('Review').closest('[data-selected]')
    if (!row) throw new Error('任务行未渲染')
    expect(row).toHaveAttribute('data-selected', 'true')
    expect(row).toHaveClass('bg-sidebar-accent/60')
    expect(screen.getByRole('button', { name: 'Fork Review' }).parentElement).toHaveClass('invisible')

    rerender(<TaskRow onOpen={vi.fn<() => void>()} task={task} />)

    expect(row).toHaveAttribute('data-selected', 'false')
    expect(row).not.toHaveClass('bg-sidebar-accent/60')
  })
})
