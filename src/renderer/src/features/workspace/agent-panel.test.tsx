import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentLaunch, LitheBridge, Task } from '../../../../shared/app-contract'
import { useTaskStore } from '../tasks/task-store'
import { disposeTerminalView } from '../terminal-view'
import { AgentPanel } from './agent-panel'

const terminalInstances = vi.hoisted((): unknown[] => [])

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn<() => void>()
  },
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    dispose = vi.fn<() => void>()
    loadAddon = vi.fn<(...arguments_: unknown[]) => void>()
    onData = vi.fn<() => { dispose: () => void }>(() => ({ dispose: vi.fn<() => void>() }))
    onResize = vi.fn<() => { dispose: () => void }>(() => ({ dispose: vi.fn<() => void>() }))
    open = vi.fn<(...arguments_: unknown[]) => void>()
    write = vi.fn<(...arguments_: unknown[]) => void>()
    writeln = vi.fn<(...arguments_: unknown[]) => void>()

    constructor() {
      terminalInstances.push(this)
    }
  },
}))

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
  disposeTerminalView('agent:task-1')
  terminalInstances.length = 0
  vi.clearAllMocks()
})

describe('agent panel', (): void => {
  it('shows the terminal without an Agent operation toolbar', (): void => {
    globalThis.ResizeObserver = class {
      disconnect = vi.fn<() => void>()
      observe = vi.fn<() => void>()
      unobserve = vi.fn<() => void>()
    }
    window.lithe = {
      adapters: {
        get: vi.fn<() => Promise<unknown>>().mockResolvedValue({
          currentVersion: { definition: { fork: ['fork'], resume: ['resume'] } },
          forkAvailable: true,
          resumeAvailable: true,
        }),
      },
      terminals: {
        onData: vi.fn<() => () => void>(() => (): void => undefined),
        onExit: vi.fn<() => () => void>(() => (): void => undefined),
      },
    } as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: { [task.id]: launch } })

    const { container } = render(<AgentPanel config={{ panelId: 'agent:task-1', taskId: task.id }} task={task} />)

    expect(container.querySelector('[data-agent-id="task-1"]')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '启动' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fork' })).not.toBeInTheDocument()
  })

  it('uses the CLI task state and shows activation errors inside the panel', (): void => {
    globalThis.ResizeObserver = class {
      disconnect = vi.fn<() => void>()
      observe = vi.fn<() => void>()
      unobserve = vi.fn<() => void>()
    }
    window.lithe = {
      terminals: {
        onData: vi.fn<() => () => void>(() => (): void => undefined),
        onExit: vi.fn<() => () => void>(() => (): void => undefined),
      },
    } as unknown as LitheBridge
    useTaskStore.setState({
      activationErrorsByTask: { [task.id]: '工作区目录不存在' },
      launchesByTask: {},
    })

    const { container } = render(
      <AgentPanel config={{ panelId: 'agent:task-1', taskId: task.id }} task={{ ...task, isRunning: true }} />,
    )

    expect(container.querySelector('[data-agent-ready="true"]')).toBeInTheDocument()
    expect(screen.getByText('工作区目录不存在')).toBeInTheDocument()
  })

  it('keeps the same terminal view when the Agent running state changes', (): void => {
    globalThis.ResizeObserver = class {
      disconnect = vi.fn<() => void>()
      observe = vi.fn<() => void>()
      unobserve = vi.fn<() => void>()
    }
    window.lithe = {
      terminals: {
        onData: vi.fn<() => () => void>(() => (): void => undefined),
        onExit: vi.fn<() => () => void>(() => (): void => undefined),
        resize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        write: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    } as unknown as LitheBridge
    useTaskStore.setState({ launchesByTask: { [task.id]: launch } })
    const config = { panelId: 'agent:task-1', taskId: task.id }
    const { rerender } = render(<AgentPanel config={config} task={task} />)

    useTaskStore.setState({
      launchesByTask: { [task.id]: { ...launch, isRunning: false } },
    })
    rerender(<AgentPanel config={config} task={task} />)

    expect(terminalInstances).toHaveLength(1)
    expect(window.lithe.terminals.onData).toHaveBeenCalledOnce()
    expect(window.lithe.terminals.onExit).toHaveBeenCalledOnce()
  })
})
