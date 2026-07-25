import { timingSafeEqual } from 'node:crypto'

import type { Task } from '../../shared/agent-contract'
import type { ProjectWithWorkspaces, Workspace } from '../../shared/app-contract'
import type { ToolContext, ToolContextProject, ToolContextWorkspace } from '../../shared/tool-protocol'
import type { AgentBinding, CapabilityRegistry } from './capability-registry'

interface ContextCommandOptions {
  capabilities: CapabilityRegistry
  externalToken: string
  getActiveWorkspaceId: () => string | null
  listProjects: () => ProjectWithWorkspaces[]
  listTasks: (workspaceId: string) => Task[]
}

export interface ContextCommand {
  executeAgent: (capability: string) => ToolContext | undefined
  executeExternal: (token: string) => ToolContext | undefined
}

const mapContext = (
  projects: ProjectWithWorkspaces[],
  activeWorkspaceId: string | null,
  listTasks: (workspaceId: string) => Task[],
): ToolContext => ({
  activeWorkspaceId,
  projects: projects.map(
    (project: ProjectWithWorkspaces): ToolContextProject => ({
      id: project.id,
      name: project.name,
      rootPath: project.rootPath,
      isValid: project.isValid,
      workspaces: project.workspaces.map(
        (workspace: Workspace): ToolContextWorkspace => ({
          id: workspace.id,
          name: workspace.name,
          rootPath: workspace.rootPath,
          gitBranch: workspace.gitBranch,
          kind: workspace.kind,
          tasks: listTasks(workspace.id).map((task: Task) => ({ id: task.id, name: task.name })),
        }),
      ),
    }),
  ),
})

const scopeContext = (context: ToolContext, binding: AgentBinding): ToolContext => ({
  activeWorkspaceId: binding.workspaceId,
  projects: context.projects
    .filter((project: ToolContextProject): boolean => project.id === binding.projectId)
    .map(
      (project: ToolContextProject): ToolContextProject => ({
        ...project,
        workspaces: project.workspaces.filter(
          (workspace: ToolContextWorkspace): boolean => workspace.id === binding.workspaceId,
        ),
      }),
    )
    .filter((project: ToolContextProject): boolean => project.workspaces.length === 1),
})

const matchesToken = (actual: string, expected: string): boolean => {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(actualBytes, expectedBytes)
}

export const createContextCommand = ({
  capabilities,
  externalToken,
  getActiveWorkspaceId,
  listProjects,
  listTasks,
}: ContextCommandOptions): ContextCommand => ({
  executeExternal: (token: string): ToolContext | undefined =>
    matchesToken(token, externalToken) ? mapContext(listProjects(), getActiveWorkspaceId(), listTasks) : undefined,
  executeAgent: (capability: string): ToolContext | undefined => {
    const binding = capabilities.resolve(capability)
    if (!binding) return undefined
    const scoped = scopeContext(mapContext(listProjects(), getActiveWorkspaceId(), listTasks), binding)
    return scoped.projects.length === 1 ? scoped : undefined
  },
})
