import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LitheBridge, ProjectWithWorkspaces, WorkspaceNavigation } from '../../../../shared/app-contract'
import { ProjectCreateDialog } from './project-create-dialog'
import { useProjectStore } from './project-store'

const navigation: WorkspaceNavigation = {
  activeWorkspaceId: 'workspace-1',
  projects: [],
  scratchWorkspaces: [],
}

const project: ProjectWithWorkspaces = {
  id: 'project-1',
  name: 'Project',
  rootPath: 'D:\\projects\\Project',
  isValid: true,
  createdAt: new Date(0),
  workspaces: [],
}

afterEach((): void => {
  cleanup()
  vi.clearAllMocks()
  useProjectStore.setState({ ...navigation, error: null, isLoading: false })
})

describe('project create dialog', (): void => {
  it('creates a managed blank project when Source folder is omitted', async (): Promise<void> => {
    const create = vi.fn<LitheBridge['projects']['create']>().mockResolvedValue(project)
    window.lithe = {
      projects: {
        create,
        getNavigation: vi.fn<() => Promise<WorkspaceNavigation>>().mockResolvedValue(navigation),
      },
    } as unknown as LitheBridge
    const user = userEvent.setup()
    render(<ProjectCreateDialog onOpenChange={vi.fn<(open: boolean) => void>()} open />)

    await user.type(screen.getByRole('textbox', { name: '项目名称' }), 'Blank project')
    await user.click(screen.getByRole('button', { name: '创建项目' }))

    await waitFor((): void => expect(create).toHaveBeenCalledWith({ name: 'Blank project' }))
  })

  it('uses the selected Source folder and defaults the display name to its basename', async (): Promise<void> => {
    const create = vi.fn<LitheBridge['projects']['create']>().mockResolvedValue(project)
    window.lithe = {
      projects: {
        create,
        getNavigation: vi.fn<() => Promise<WorkspaceNavigation>>().mockResolvedValue(navigation),
        pickSourceFolder: vi.fn<() => Promise<string | null>>().mockResolvedValue('D:\\projects\\Existing'),
      },
    } as unknown as LitheBridge
    const user = userEvent.setup()
    render(<ProjectCreateDialog onOpenChange={vi.fn<(open: boolean) => void>()} open />)

    await user.click(screen.getByRole('button', { name: '选择已有文件夹' }))
    expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('Existing')
    await user.click(screen.getByRole('button', { name: '创建项目' }))

    await waitFor((): void =>
      expect(create).toHaveBeenCalledWith({ name: 'Existing', sourcePath: 'D:\\projects\\Existing' }),
    )
  })
})
