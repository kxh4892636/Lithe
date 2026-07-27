import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LitheBridge, Task } from '../../../../shared/app-contract'
import { useTaskStore } from './task-store'

const restoredTask: Task = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  name: 'Review',
  adapterVersionId: 'adapter-v1',
  agentSessionId: 'session-1',
  archivedAt: null,
  createdAt: new Date(0),
  agentStatus: 'closed',
  isUnread: false,
  lifecycle: 'active',
  lastAttentionAt: null,
  lastViewedAt: null,
  shouldAutoRestore: false,
}

describe('task store', (): void => {
  beforeEach((): void => {
    useTaskStore.setState({
      activationErrorsByTask: {},
      archivedTasks: [{ ...restoredTask, archivedAt: new Date(1), lifecycle: 'archived' }],
      error: null,
      launchesByTask: {},
      openTaskId: null,
      panelRemovals: [],
      tasksByWorkspace: { 'workspace-1': [] },
      visibleTaskId: null,
    })
  })

  it('tracks the task currently visible in the workspace layout', (): void => {
    useTaskStore.getState().setVisibleTaskId(restoredTask.id)
    expect(useTaskStore.getState().visibleTaskId).toBe(restoredTask.id)

    useTaskStore.getState().setVisibleTaskId(null)
    expect(useTaskStore.getState().visibleTaskId).toBeNull()
  })

  it('keeps a restored task unique when the change event arrives before the IPC response', async (): Promise<void> => {
    const restore = vi.fn<LitheBridge['tasks']['restore']>().mockImplementation(async (): Promise<Task> => {
      useTaskStore.getState().applyChange(restoredTask)
      return restoredTask
    })
    window.lithe = { tasks: { restore } } as unknown as LitheBridge

    await useTaskStore.getState().restoreTask(restoredTask.id)

    expect(useTaskStore.getState().tasksByWorkspace['workspace-1']).toEqual([restoredTask])
  })

  it('opens and starts a task that has no Agent session', async (): Promise<void> => {
    const task = { ...restoredTask, agentSessionId: null }
    const idleTask = { ...task, agentStatus: 'idle' as const }
    const launch = {
      args: [],
      cwd: 'D:\\projects\\lithe',
      error: null,
      executable: 'agent',
      isOpen: true,
      sessionId: 'agent:task-1',
      task: idleTask,
    }
    const start = vi.fn<LitheBridge['agents']['start']>().mockResolvedValue(launch)
    window.lithe = { agents: { start } } as unknown as LitheBridge
    useTaskStore.setState({ tasksByWorkspace: { 'workspace-1': [task] } })

    await useTaskStore.getState().activateTask(task.id)

    expect(useTaskStore.getState().openTaskId).toBe(task.id)
    expect(start).toHaveBeenCalledWith(task.id)
    expect(useTaskStore.getState().launchesByTask[task.id]).toEqual(launch)
  })

  it('resumes a stopped task that already has an Agent session', async (): Promise<void> => {
    const idleTask = { ...restoredTask, agentStatus: 'idle' as const }
    const launch = {
      args: [],
      cwd: 'D:\\projects\\lithe',
      error: null,
      executable: 'agent',
      isOpen: true,
      sessionId: 'agent:task-1',
      task: idleTask,
    }
    const resume = vi.fn<LitheBridge['agents']['resume']>().mockResolvedValue(launch)
    window.lithe = { agents: { resume } } as unknown as LitheBridge
    useTaskStore.setState({ tasksByWorkspace: { 'workspace-1': [restoredTask] } })

    await useTaskStore.getState().activateTask(restoredTask.id)

    expect(resume).toHaveBeenCalledWith(restoredTask.id)
  })

  it('only focuses an idle task whose Agent is already open', async (): Promise<void> => {
    const idleTask = { ...restoredTask, agentStatus: 'idle' as const }
    const launch = {
      args: [],
      cwd: 'D:\\projects\\lithe',
      error: null,
      executable: 'agent',
      isOpen: true,
      sessionId: 'agent:task-1',
      task: idleTask,
    }
    const start = vi.fn<LitheBridge['agents']['start']>()
    const resume = vi.fn<LitheBridge['agents']['resume']>()
    window.lithe = { agents: { resume, start } } as unknown as LitheBridge
    useTaskStore.setState({
      launchesByTask: { [restoredTask.id]: launch },
      tasksByWorkspace: { 'workspace-1': [idleTask] },
    })

    await useTaskStore.getState().activateTask(restoredTask.id)

    expect(useTaskStore.getState().openTaskId).toBe(restoredTask.id)
    expect(start).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })

  it('only focuses a task marked running by the Agent CLI', async (): Promise<void> => {
    const runningTask = { ...restoredTask, agentStatus: 'running' as const }
    const start = vi.fn<LitheBridge['agents']['start']>()
    const resume = vi.fn<LitheBridge['agents']['resume']>()
    window.lithe = { agents: { resume, start } } as unknown as LitheBridge
    useTaskStore.setState({ tasksByWorkspace: { 'workspace-1': [runningTask] } })

    await useTaskStore.getState().activateTask(runningTask.id)

    expect(useTaskStore.getState().openTaskId).toBe(runningTask.id)
    expect(start).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })

  it('clears an old activation error when the Agent CLI reports the task running', async (): Promise<void> => {
    const runningTask = { ...restoredTask, agentStatus: 'running' as const }
    window.lithe = { agents: {} } as unknown as LitheBridge
    useTaskStore.setState({
      activationErrorsByTask: { [runningTask.id]: '工作区目录不存在' },
      tasksByWorkspace: { 'workspace-1': [runningTask] },
    })

    await useTaskStore.getState().activateTask(runningTask.id)

    expect(useTaskStore.getState().activationErrorsByTask[runningTask.id]).toBeNull()
  })

  it('keeps an activation failure on the task panel instead of the workspace', async (): Promise<void> => {
    const failure = new Error('工作区目录不存在')
    const resume = vi.fn<LitheBridge['agents']['resume']>().mockRejectedValue(failure)
    window.lithe = { agents: { resume } } as unknown as LitheBridge
    useTaskStore.setState({ tasksByWorkspace: { 'workspace-1': [restoredTask] } })

    await expect(useTaskStore.getState().activateTask(restoredTask.id)).rejects.toThrow('工作区目录不存在')

    expect(useTaskStore.getState().activationErrorsByTask[restoredTask.id]).toBe('工作区目录不存在')
    expect(useTaskStore.getState().error).toBeNull()
  })

  it('deduplicates click activation and automatic restoration', async (): Promise<void> => {
    const idleTask = { ...restoredTask, agentStatus: 'idle' as const }
    const launch = {
      args: [],
      cwd: 'D:\\projects\\lithe',
      error: null,
      executable: 'agent',
      isOpen: true,
      sessionId: 'agent:task-1',
      task: idleTask,
    }
    const resume = vi.fn<LitheBridge['agents']['resume']>().mockResolvedValue(launch)
    window.lithe = {
      agents: {
        resume,
        shouldRestore: vi.fn<LitheBridge['agents']['shouldRestore']>().mockResolvedValue(true),
      },
    } as unknown as LitheBridge
    useTaskStore.setState({ tasksByWorkspace: { 'workspace-1': [restoredTask] } })

    await Promise.all([
      useTaskStore.getState().activateTask(restoredTask.id),
      useTaskStore.getState().autoRestoreTask(restoredTask.id),
    ])

    expect(resume).toHaveBeenCalledOnce()
  })

  it('stops the running Agent and updates the visible launch state', async (): Promise<void> => {
    const runningTask = { ...restoredTask, agentStatus: 'running' as const }
    const stoppedTask = { ...restoredTask, agentStatus: 'closed' as const }
    const launch = {
      args: [],
      cwd: 'D:\\projects\\lithe',
      error: null,
      executable: 'agent',
      isOpen: true,
      sessionId: 'agent:task-1',
      task: runningTask,
    }
    const stop = vi.fn<LitheBridge['agents']['stop']>().mockResolvedValue(stoppedTask)
    window.lithe = { agents: { stop } } as unknown as LitheBridge
    useTaskStore.setState({
      launchesByTask: { [restoredTask.id]: launch },
      tasksByWorkspace: { 'workspace-1': [runningTask] },
    })

    await useTaskStore.getState().stopTask(restoredTask.id)

    expect(stop).toHaveBeenCalledWith(restoredTask.id)
    expect(useTaskStore.getState().launchesByTask[restoredTask.id]?.isOpen).toBe(false)
    expect(useTaskStore.getState().tasksByWorkspace['workspace-1']).toEqual([stoppedTask])
    expect(useTaskStore.getState().panelRemovals).toEqual([{ taskId: restoredTask.id, workspaceId: 'workspace-1' }])
  })
})
