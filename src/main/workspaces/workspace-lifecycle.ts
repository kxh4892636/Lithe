import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

import type { AgentManager } from '../agents/agent-manager'
import type { AppDatabase } from '../database/app-database'
import { isExistingDirectory } from '../directory-validity'
import { createWorkspaceRecoveryStore } from './create-recovery-store'
import { createGitWorktreeDriver } from './git-worktree-driver'
import { createWorktreeService, type WorktreeService } from './worktree-service'

interface WorkspaceLifecycleOptions {
  database: AppDatabase
  getAgentManager: () => AgentManager | undefined
  isDirectory?: (path: string) => boolean
  notifyNavigation: () => void
  trash: (path: string) => Promise<void>
  worktreeRoot: string
}

export interface WorkspaceLifecycle {
  forgetInvalidProject: (projectId: string, confirmation: string) => Promise<boolean>
  refreshProjectValidity: () => void
  worktrees: WorktreeService
}

const managedWorktreePath = (worktreeRoot: string, path: string): string => {
  const candidate = resolve(path)
  const boundary = relative(worktreeRoot, candidate)
  if (!boundary || boundary.startsWith('..') || isAbsolute(boundary)) {
    throw new TypeError('工作区不在 Lithe 托管目录中')
  }
  return candidate
}

export const createWorkspaceLifecycle = (options: WorkspaceLifecycleOptions): WorkspaceLifecycle => {
  const directoryExists = options.isDirectory ?? isExistingDirectory
  const worktreeRoot = resolve(options.worktreeRoot)
  const worktrees = createWorktreeService({
    addWorkspace: options.database.projects.addWorkspace,
    createId: randomUUID,
    driver: createGitWorktreeDriver(),
    getProject: options.database.projects.get,
    getWorkspace: options.database.projects.getWorkspace,
    hasRunningTasks: (workspaceId: string): boolean =>
      options.database.tasks
        .listAll(workspaceId)
        .some((task): boolean => task.agentStatus !== 'closed' || options.getAgentManager()?.isOpen(task.id) === true),
    now: (): Date => new Date(),
    recovery: createWorkspaceRecoveryStore(worktreeRoot),
    removeProject: options.database.projects.remove,
    removeWorkspace: options.database.projects.deleteWorkspace,
    renameWorkspace: options.database.projects.renameWorkspace,
    worktreeRoot,
  })

  return {
    forgetInvalidProject: async (projectId: string, confirmation: string): Promise<boolean> => {
      const project = options.database.projects.get(projectId)
      if (!project || project.isValid) throw new TypeError('只有无效项目可以忘记')
      if (confirmation !== project.name) throw new TypeError('必须输入完整项目名称确认')
      for (const workspace of project.workspaces.filter((candidate): boolean => candidate.kind === 'derived')) {
        const path = managedWorktreePath(worktreeRoot, workspace.rootPath)
        if (existsSync(path)) await options.trash(path)
      }
      options.database.projects.remove(project.id)
      return true
    },
    refreshProjectValidity: (): void => {
      let changed = false
      for (const project of options.database.projects.list()) {
        const projectIsValid = directoryExists(project.rootPath)
        if (projectIsValid !== project.isValid) {
          options.database.projects.setValidity(project.id, projectIsValid)
          changed = true
        }
        if (!projectIsValid) continue
        for (const workspace of project.workspaces) {
          const workspaceIsValid = directoryExists(workspace.rootPath)
          if (workspaceIsValid === (workspace.isValid ?? true)) continue
          options.database.projects.setWorkspaceValidity(workspace.id, workspaceIsValid)
          changed = true
        }
      }
      if (changed) options.notifyNavigation()
    },
    worktrees,
  }
}
