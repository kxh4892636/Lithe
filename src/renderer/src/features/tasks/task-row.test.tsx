import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentLaunch, LitheBridge, Task } from '../../../../shared/app-contract'
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

afterEach((): void => {
  cleanup()
  vi.clearAllMocks()
})

describe('task row', (): void => {
  it('offers stop only from the context menu while the Agent is running', async (): Promise<void> => {
    const stop = vi.fn<LitheBridge['agents']['stop']>().mockResolvedValue(undefined)
    window.lithe = { agents: { stop } } as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: { [task.id]: launch } })

    render(<TaskRow onOpen={vi.fn<() => void>()} task={task} />)

    expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument()
    const taskButton = screen.getByText('-Review').closest('button')
    if (!taskButton) throw new Error('任务按钮未渲染')
    fireEvent.contextMenu(taskButton)
    fireEvent.click(await screen.findByRole('menuitem', { name: '停止' }))

    await waitFor((): void => expect(stop).toHaveBeenCalledWith(task.id))
  })
})
