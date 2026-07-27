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
  agentSessionId: 'session-1',
  archivedAt: null,
  createdAt: new Date(0),
  isRunning: false,
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
  isRunning: true,
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
  vi.clearAllMocks()
})

describe('task row', (): void => {
  it('offers stop only from the context menu while the Agent is running', async (): Promise<void> => {
    const stop = vi.fn<LitheBridge['agents']['stop']>().mockResolvedValue(undefined)
    window.lithe = { agents: { stop } } as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: { [task.id]: launch } })

    render(<TaskRow adapter={adapter} onOpen={vi.fn<() => void>()} task={task} />)

    expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fork Review' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fork Review' })).toHaveAttribute('title', '请先停止任务')
    const taskButton = screen.getByText('-Review').closest('button')
    if (!taskButton) throw new Error('任务按钮未渲染')
    fireEvent.contextMenu(taskButton)
    fireEvent.click(await screen.findByRole('menuitem', { name: '停止' }))

    await waitFor((): void => expect(stop).toHaveBeenCalledWith(task.id))
  })

  it('keeps unsupported Fork visible with an actionable reason', (): void => {
    window.lithe = {} as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: {} })

    render(<TaskRow onOpen={vi.fn<() => void>()} task={{ ...task, agentSessionId: null }} />)

    expect(screen.getByRole('button', { name: 'Fork Review' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fork Review' })).toHaveAttribute('title', '任务尚未绑定 Agent 会话')
  })
})
