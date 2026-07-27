import { existsSync, mkdirSync, realpathSync, rmdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { ProjectCreateInput, ProjectWithWorkspaces } from '../../shared/app-contract'

interface CreateProjectServiceOptions {
  addProject: (project: ProjectWithWorkspaces) => void
  createId: () => string
  detectGitBranch: (rootPath: string) => Promise<string | null>
  findProjectByRoot: (rootPath: string) => ProjectWithWorkspaces | undefined
  logError: (message: string, error: unknown) => void
  managedProjectsRoot: string
  now: () => Date
  platform: NodeJS.Platform
  selectWorkspace: (workspaceId: string) => void
}

export interface ProjectService {
  create: (input: ProjectCreateInput) => Promise<ProjectWithWorkspaces>
}

const windowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

const assertProjectName = (name: string): string => {
  const normalized = name.trim()
  if (!normalized) throw new TypeError('项目名称不能为空')
  return normalized
}

const assertDirectoryName = (name: string, platform: NodeJS.Platform): string => {
  const normalized = assertProjectName(name)
  const invalid =
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.includes('\0') ||
    (platform === 'win32' &&
      (/[<>:"|?*]/.test(normalized) ||
        normalized.endsWith('.') ||
        normalized.endsWith(' ') ||
        windowsReservedName.test(normalized)))
  if (invalid) throw new TypeError('项目名称不能用作文件夹名称')
  return normalized
}

const requireDirectory = (selectedPath: string, logError: (message: string, error: unknown) => void): string => {
  const resolvedPath = resolve(selectedPath)
  try {
    if (!statSync(resolvedPath).isDirectory()) throw new TypeError('项目根目录不是文件夹')
    return realpathSync.native(resolvedPath)
  } catch (error: unknown) {
    if (error instanceof TypeError) throw error
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new TypeError('项目根目录不存在')
    }
    logError('读取项目根目录失败', error)
    throw error
  }
}

export const createProjectService = (options: CreateProjectServiceOptions): ProjectService => ({
  create: async (input: ProjectCreateInput): Promise<ProjectWithWorkspaces> => {
    const name = input.sourcePath ? assertProjectName(input.name) : assertDirectoryName(input.name, options.platform)
    let managedDirectoryCreated = false
    const rootPath = input.sourcePath
      ? requireDirectory(input.sourcePath, options.logError)
      : join(options.managedProjectsRoot, name)

    if (input.sourcePath) {
      const existing = options.findProjectByRoot(rootPath)
      const [workspace] = existing?.workspaces ?? []
      if (existing && workspace) {
        options.selectWorkspace(workspace.id)
        return existing
      }
    } else {
      mkdirSync(options.managedProjectsRoot, { recursive: true })
      if (existsSync(rootPath)) throw new TypeError('项目目录已存在')
      mkdirSync(rootPath)
      managedDirectoryCreated = true
    }

    const projectId = options.createId()
    const createdAt = options.now()
    const project: ProjectWithWorkspaces = {
      id: projectId,
      name,
      rootPath,
      isValid: true,
      createdAt,
      workspaces: [
        {
          id: options.createId(),
          projectId,
          name: '默认',
          rootPath,
          gitBranch: await options.detectGitBranch(rootPath),
          kind: 'default',
          pinnedAt: null,
          createdAt,
        },
      ],
    }
    try {
      options.addProject(project)
      return project
    } catch (error: unknown) {
      if (managedDirectoryCreated) rmdirSync(rootPath)
      throw error
    }
  },
})
