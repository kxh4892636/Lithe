/* oxlint-disable vitest/require-mock-type-parameters */
import { describe, expect, it, vi } from 'vitest'

import type { Task } from '../../shared/agent-contract'
import { createTaskStateService } from './task-state-service'

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  workspaceId: 'workspace-1',
  name: 'Review',
  adapterVersionId: 'adapter-1',
  agentSessionId: 'session-1',
  archivedAt: null,
  createdAt: new Date('2026-07-25T00:00:00Z'),
  isRunning: false,
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
      clearRunMarks: vi.fn(),
      deleteTask: vi.fn(),
      get: vi.fn(() => task()),
      markIdle: vi.fn(),
      markRunning: vi.fn(),
      markViewed,
      notify,
      now: () => new Date('2026-07-25T01:00:00Z'),
      recordAttention,
      removeTaskPanel: vi.fn(),
      restore: vi.fn(),
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
      clearRunMarks: vi.fn(),
      deleteTask: vi.fn(),
      get: vi.fn(() => task()),
      markIdle: vi.fn(),
      markRunning: vi.fn(),
      markViewed: vi.fn(),
      notify,
      now: () => new Date('2026-07-25T01:00:00Z'),
      recordAttention: vi.fn(() => unread),
      removeTaskPanel: vi.fn(),
      restore: vi.fn(),
      stopAgent: vi.fn(),
    })

    expect(service.markUnread('task-1', false)).toEqual(unread)
    expect(notify).toHaveBeenCalledOnce()
  })

  it('keeps running markers isolated by CLI instance', () => {
    const markRunning = vi.fn((_taskId: string, instanceId: string) => task({ isRunning: instanceId === 'agent-b' }))
    const markIdle = vi.fn(() => task({ isRunning: true }))
    const service = createTaskStateService({
      archive: vi.fn(),
      clearRunMarks: vi.fn(),
      deleteTask: vi.fn(),
      get: vi.fn(() => task()),
      markIdle,
      markRunning,
      markViewed: vi.fn(),
      notify: vi.fn(),
      now: () => new Date(),
      recordAttention: vi.fn(),
      removeTaskPanel: vi.fn(),
      restore: vi.fn(),
      stopAgent: vi.fn(),
    })

    service.markRunning('task-1', 'agent-a')
    service.markRunning('task-1', 'agent-b')
    service.markIdle('task-1', 'agent-a')

    expect(markRunning).toHaveBeenNthCalledWith(1, 'task-1', 'agent-a', expect.any(Date))
    expect(markRunning).toHaveBeenNthCalledWith(2, 'task-1', 'agent-b', expect.any(Date))
    expect(markIdle).toHaveBeenCalledWith('task-1', 'agent-a')
  })

  it('refuses to archive a running task', () => {
    const service = createTaskStateService({
      archive: vi.fn(),
      clearRunMarks: vi.fn(),
      deleteTask: vi.fn(),
      get: vi.fn(() => task({ isRunning: true })),
      markIdle: vi.fn(),
      markRunning: vi.fn(),
      markViewed: vi.fn(),
      notify: vi.fn(),
      now: () => new Date(),
      recordAttention: vi.fn(),
      removeTaskPanel: vi.fn(),
      restore: vi.fn(),
      stopAgent: vi.fn(),
    })

    expect(() => service.archive('task-1')).toThrow(/running/i)
  })

  it('stops the Agent before archiving while retaining its panel layout', () => {
    const stopAgent = vi.fn()
    const archive = vi.fn(() => task({ lifecycle: 'archived', archivedAt: new Date() }))
    const removeTaskPanel = vi.fn()
    const service = createTaskStateService({
      archive,
      clearRunMarks: vi.fn(),
      deleteTask: vi.fn(),
      get: vi.fn(() => task()),
      markIdle: vi.fn(),
      markRunning: vi.fn(),
      markViewed: vi.fn(),
      notify: vi.fn(),
      now: () => new Date(),
      recordAttention: vi.fn(),
      removeTaskPanel,
      restore: vi.fn(),
      stopAgent,
    })

    service.archive('task-1')

    expect(stopAgent).toHaveBeenCalledWith('task-1')
    expect(archive).toHaveBeenCalled()
    expect(removeTaskPanel).not.toHaveBeenCalled()
  })

  it('removes the Agent panel only when deleting the task', () => {
    const removeTaskPanel = vi.fn()
    const deleteTask = vi.fn()
    const service = createTaskStateService({
      archive: vi.fn(),
      clearRunMarks: vi.fn(),
      deleteTask,
      get: vi.fn(() => task()),
      markIdle: vi.fn(),
      markRunning: vi.fn(),
      markViewed: vi.fn(),
      notify: vi.fn(),
      now: () => new Date(),
      recordAttention: vi.fn(),
      removeTaskPanel,
      restore: vi.fn(),
      stopAgent: vi.fn(),
    })

    service.delete('task-1')

    expect(removeTaskPanel).toHaveBeenCalledWith('workspace-1', 'task-1')
    expect(deleteTask).toHaveBeenCalledWith('task-1')
  })
})
