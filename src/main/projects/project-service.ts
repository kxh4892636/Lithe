import { statSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import type { ProjectWithWorkspaces } from '../../shared/app-contract'

interface CreateProjectServiceOptions {
  addProject: (project: ProjectWithWorkspaces) => void
  createId: () => string
  detectGitBranch: (rootPath: string) => Promise<string | null>
  logError: (message: string, error: unknown) => void
  now: () => Date
}

export interface ProjectService {
  addDirectory: (rootPath: string) => Promise<ProjectWithWorkspaces>
}

export const createProjectService = ({
  addProject,
  createId,
  detectGitBranch,
  logError,
  now,
}: CreateProjectServiceOptions): ProjectService => ({
  addDirectory: async (selectedPath: string): Promise<ProjectWithWorkspaces> => {
    const rootPath = resolve(selectedPath)
    let isDirectory = false
    try {
      isDirectory = statSync(rootPath).isDirectory()
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new TypeError('项目根目录不存在')
      }
      logError('读取项目根目录失败', error)
      throw error
    }
    if (!isDirectory) throw new TypeError('项目根目录不是文件夹')

    const projectId = createId()
    const createdAt = now()
    const project: ProjectWithWorkspaces = {
      id: projectId,
      name: basename(rootPath),
      rootPath,
      isValid: true,
      createdAt,
      workspaces: [
        {
          id: createId(),
          projectId,
          name: '默认',
          rootPath,
          gitBranch: await detectGitBranch(rootPath),
          kind: 'default',
          createdAt,
        },
      ],
    }
    addProject(project)
    return project
  },
})
