import type { Task } from '../../shared/agent-contract'

interface TaskStateServiceOptions {
  archive: (taskId: string, archivedAt: Date) => Task
  clearRunMarks: (taskId: string) => void
  changed?: (task: Task | { deletedTaskId: string; workspaceId: string }) => void
  deleteTask: (taskId: string) => void
  get: (taskId: string) => Task | undefined
  markIdle: (taskId: string, instanceId: string) => Task
  markRunning: (taskId: string, instanceId: string, createdAt: Date) => Task
  markViewed: (taskId: string, viewedAt: Date) => Task
  notify: (task: Task) => void
  now: () => Date
  recordAttention: (taskId: string, createdAt: Date) => Task
  removeTaskPanel: (workspaceId: string, taskId: string) => void
  restore: (taskId: string) => Task
  stopAgent: (taskId: string) => void
}

export interface TaskStateService {
  archive: (taskId: string) => Task
  delete: (taskId: string) => void
  get: (taskId: string) => Task
  markIdle: (taskId: string, instanceId: string) => Task
  markRunning: (taskId: string, instanceId: string) => Task
  markUnread: (taskId: string, isTrulyVisible: boolean) => Task
  markViewed: (taskId: string, isTrulyVisible: boolean) => Task
  restore: (taskId: string) => Task
}

export const createTaskStateService = (options: TaskStateServiceOptions): TaskStateService => {
  const required = (taskId: string): Task => {
    const task = options.get(taskId)
    if (!task) throw new TypeError('Task does not exist')
    return task
  }

  return {
    archive: (taskId: string): Task => {
      const task = required(taskId)
      if (task.lifecycle === 'archived') return task
      if (task.isRunning) throw new TypeError('Running task cannot be archived')
      options.stopAgent(taskId)
      options.clearRunMarks(taskId)
      const archived = options.archive(taskId, options.now())
      options.changed?.(archived)
      return archived
    },
    delete: (taskId: string): void => {
      const task = required(taskId)
      if (task.lifecycle !== 'archived') throw new TypeError('Task must be archived before deletion')
      options.stopAgent(taskId)
      options.clearRunMarks(taskId)
      options.removeTaskPanel(task.workspaceId, task.id)
      options.deleteTask(taskId)
      options.changed?.({ deletedTaskId: task.id, workspaceId: task.workspaceId })
    },
    get: required,
    markIdle: (taskId: string, instanceId: string): Task => {
      required(taskId)
      const updated = options.markIdle(taskId, instanceId)
      options.changed?.(updated)
      return updated
    },
    markRunning: (taskId: string, instanceId: string): Task => {
      const task = required(taskId)
      if (task.lifecycle === 'archived') throw new TypeError('Archived task cannot be marked running')
      const updated = options.markRunning(taskId, instanceId, options.now())
      options.changed?.(updated)
      return updated
    },
    markUnread: (taskId: string, isTrulyVisible: boolean): Task => {
      required(taskId)
      const occurredAt = options.now()
      const updated = options.recordAttention(taskId, occurredAt)
      if (isTrulyVisible) {
        const viewed = options.markViewed(taskId, occurredAt)
        options.changed?.(viewed)
        return viewed
      }
      options.notify(updated)
      options.changed?.(updated)
      return updated
    },
    markViewed: (taskId: string, isTrulyVisible: boolean): Task => {
      const task = required(taskId)
      if (!isTrulyVisible) return task
      const viewed = options.markViewed(task.id, options.now())
      options.changed?.(viewed)
      return viewed
    },
    restore: (taskId: string): Task => {
      const task = required(taskId)
      if (task.lifecycle === 'active') return task
      const restored = options.restore(taskId)
      options.changed?.(restored)
      return restored
    },
  }
}
