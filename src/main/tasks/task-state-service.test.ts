/* oxlint-disable vitest/require-mock-type-parameters */
import { describe, expect, it, vi } from 'vitest'

import type { Task } from '../../shared/agent-contract'
import { createTaskStateService } from './task-state-service'

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  workspaceId: 'workspace-1',
  name: 'Review',
  adapterVersionId: 'adapter-1',
  agentStatus: 'idle',
  agentSessionId: 'session-1',
  archivedAt: null,
  createdAt: new Date('2026-07-25T00:00:00Z'),
  isUnread: false,
  lifecycle: 'active',
  lastAttentionAt: null,
  lastViewedAt: null,
  shouldAutoRestore: true,
  ...overrides,
})

describe('task state service', () => {
  it('records attention but immediately views a truly visible task', () => {
    const recordAttention = vi.fn(() => task({ lastAttentionAt: new Date('2026-07-25T01:00:00Z'), isUnread: true }))
    const markViewed = vi.fn(() =>
      task({
        lastAttentionAt: new Date('2026-07-25T01:00:00Z'),
        lastViewedAt: new Date('2026-07-25T01:00:00Z'),
      }),
    )
    const notify = vi.fn()
    const service = createTaskStateService({
      archive: vi.fn(),
      deleteTask: vi.fn(),
      get: vi.fn(() => task()),
      markViewed,
      notify,
      now: () => new Date('2026-07-25T01:00:00Z'),
      recordAttention,
      removeTaskPanel: vi.fn(),
      restore: vi.fn(),
      setAgentStatus: vi.fn(),
      stopAgent: vi.fn(),
    })

    service.markUnread('task-1', true)

    expect(recordAttention).toHaveBeenCalledWith('task-1', new Date('2026-07-25T01:00:00Z'))
    expect(markViewed).toHaveBeenCalledWith('task-1', new Date('2026-07-25T01:00:00Z'))
    expect(notify).not.toHaveBeenCalled()
  })

  it('notifies once the attention event remains unread in the background', () => {
    const unread = task({ isUnread: true, lastAttentionAt: new Date('2026-07-25T01:00:00Z') })
    const notify = vi.fn()
    const service = createTaskStateService({
      archive: vi.fn(),
      deleteTask: vi.fn(),
      get: vi.fn(() => task()),
      markViewed: vi.fn(),
      notify,
      now: () => new Date('2026-07-25T01:00:00Z'),
      recordAttention: vi.fn(() => unread),
      removeTaskPanel: vi.fn(),
      restore: vi.fn(),
      setAgentStatus: vi.fn(),
      stopAgent: vi.fn(),
    })

    expect(service.markUnread('task-1', false)).toEqual(unread)
    expect(notify).toHaveBeenCalledOnce()
  })

  it('switches the current Code Agent between running and idle without instance markers', () => {
    const setAgentStatus = vi.fn((_taskId: string, status: Task['agentStatus']) => task({ agentStatus: status }))
    const service = createTaskStateService({
      archive: vi.fn(),
      deleteTask: vi.fn(),
      get: vi.fn(() => task()),
      markViewed: vi.fn(),
      notify: vi.fn(),
      now: () => new Date(),
      recordAttention: vi.fn(),
      removeTaskPanel: vi.fn(),
      restore: vi.fn(),
      setAgentStatus,
      stopAgent: vi.fn(),
    })

    expect(service.markRunning('task-1').agentStatus).toBe('running')
    expect(service.markRunning('task-1').agentStatus).toBe('running')
    expect(service.markIdle('task-1').agentStatus).toBe('idle')
    expect(service.markIdle('task-1').agentStatus).toBe('idle')

    expect(setAgentStatus).toHaveBeenNthCalledWith(1, 'task-1', 'running')
    expect(setAgentStatus).toHaveBeenNthCalledWith(2, 'task-1', 'running')
    expect(setAgentStatus).toHaveBeenNthCalledWith(3, 'task-1', 'idle')
    expect(setAgentStatus).toHaveBeenNthCalledWith(4, 'task-1', 'idle')
  })

  it('refuses to archive a running task', () => {
    const service = createTaskStateService({
      archive: vi.fn(),
      deleteTask: vi.fn(),
      get: vi.fn(() => task({ agentStatus: 'running' })),
      markViewed: vi.fn(),
      notify: vi.fn(),
      now: () => new Date(),
      recordAttention: vi.fn(),
      removeTaskPanel: vi.fn(),
      restore: vi.fn(),
      setAgentStatus: vi.fn(),
      stopAgent: vi.fn(),
    })

    expect(() => service.archive('task-1')).toThrow(/running/i)
  })

  it('stops an idle Agent and removes its panel before archiving', () => {
    const stopAgent = vi.fn()
    const archive = vi.fn(() => task({ lifecycle: 'archived', archivedAt: new Date() }))
    const removeTaskPanel = vi.fn()
    const service = createTaskStateService({
      archive,
      deleteTask: vi.fn(),
      get: vi.fn(() => task()),
      markViewed: vi.fn(),
      notify: vi.fn(),
      now: () => new Date(),
      recordAttention: vi.fn(),
      removeTaskPanel,
      restore: vi.fn(),
      setAgentStatus: vi.fn(),
      stopAgent,
    })

    service.archive('task-1')

    expect(stopAgent).toHaveBeenCalledWith('task-1')
    expect(archive).toHaveBeenCalled()
    expect(removeTaskPanel).toHaveBeenCalledWith('workspace-1', 'task-1')
  })

  it('removes the Agent panel only when deleting the task', () => {
    const removeTaskPanel = vi.fn()
    const deleteTask = vi.fn()
    const service = createTaskStateService({
      archive: vi.fn(),
      deleteTask,
      get: vi.fn(() => task({ lifecycle: 'archived', archivedAt: new Date() })),
      markViewed: vi.fn(),
      notify: vi.fn(),
      now: () => new Date(),
      recordAttention: vi.fn(),
      removeTaskPanel,
      restore: vi.fn(),
      setAgentStatus: vi.fn(),
      stopAgent: vi.fn(),
    })

    service.delete('task-1')

    expect(removeTaskPanel).toHaveBeenCalledWith('workspace-1', 'task-1')
    expect(deleteTask).toHaveBeenCalledWith('task-1')
  })

  it('requires a task to be archived before deletion', () => {
    const deleteTask = vi.fn()
    const service = createTaskStateService({
      archive: vi.fn(),
      deleteTask,
      get: vi.fn(() => task()),
      markViewed: vi.fn(),
      notify: vi.fn(),
      now: () => new Date(),
      recordAttention: vi.fn(),
      removeTaskPanel: vi.fn(),
      restore: vi.fn(),
      setAgentStatus: vi.fn(),
      stopAgent: vi.fn(),
    })

    expect(() => service.delete('task-1')).toThrow('Task must be archived before deletion')
    expect(deleteTask).not.toHaveBeenCalled()
  })
})
