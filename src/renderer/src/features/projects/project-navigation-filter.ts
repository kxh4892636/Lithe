import type { ProjectWithWorkspaces, Task } from '../../../../shared/app-contract'

export const filterProjects = (
  projects: ProjectWithWorkspaces[],
  tasksByWorkspace: Record<string, Task[]>,
  query: string,
): ProjectWithWorkspaces[] =>
  query
    ? projects
        .map(
          (project): ProjectWithWorkspaces => ({
            ...project,
            workspaces: project.workspaces.filter(
              (workspace): boolean =>
                project.name.toLocaleLowerCase().includes(query) ||
                workspace.name.toLocaleLowerCase().includes(query) ||
                (tasksByWorkspace[workspace.id] ?? []).some((task): boolean =>
                  task.name.toLocaleLowerCase().includes(query),
                ),
            ),
          }),
        )
        .filter((project): boolean => project.workspaces.length > 0)
    : projects
