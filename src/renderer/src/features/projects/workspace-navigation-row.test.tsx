import { describe, expect, it } from 'vitest'

import type { Workspace } from '../../../../shared/app-contract'
import { workspaceNavigationTitle, workspaceRowIsActive } from './workspace-navigation-row'

const workspace: Workspace = {
  id: 'workspace-1',
  projectId: 'project-1',
  name: '默认',
  rootPath: 'D:\\projects\\lithe',
  gitBranch: 'main',
  kind: 'default',
  createdAt: new Date(0),
}

describe('workspace navigation title', (): void => {
  it('combines the Git branch and workspace name on one line', (): void => {
    expect(workspaceNavigationTitle(workspace)).toBe('main - 默认')
    expect(workspaceNavigationTitle({ ...workspace, gitBranch: null })).toBe('默认')
    expect(workspaceNavigationTitle({ ...workspace, gitBranch: 'HEAD@abc1234' })).toBe('HEAD@abc1234 - 默认')
  })

  it('does not highlight the parent workspace while a task is visible', (): void => {
    expect(workspaceRowIsActive(workspace.id, null, workspace.id)).toBe(true)
    expect(workspaceRowIsActive(workspace.id, 'task-1', workspace.id)).toBe(false)
    expect(workspaceRowIsActive('workspace-2', null, workspace.id)).toBe(false)
  })
})
