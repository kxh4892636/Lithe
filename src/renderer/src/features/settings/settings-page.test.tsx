import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LitheBridge, RuntimeInfo, Task, Theme } from '../../../../shared/app-contract'
import { useSettingsNavigationStore } from './settings-navigation-store'
import { SettingsPage } from './settings-page'
import { useThemeStore } from './theme-store'

afterEach(cleanup)

describe('settings page', (): void => {
  it('shows archived tasks inside the archive settings category', async (): Promise<void> => {
    window.lithe = {
      adapters: {
        get: vi.fn<LitheBridge['adapters']['get']>().mockResolvedValue(null),
        list: vi.fn<LitheBridge['adapters']['list']>().mockResolvedValue([]),
      },
      preferences: {
        getNotificationsEnabled: vi.fn<LitheBridge['preferences']['getNotificationsEnabled']>().mockResolvedValue(true),
      },
      tasks: {
        listArchived: vi.fn<LitheBridge['tasks']['listArchived']>().mockResolvedValue([]),
      },
    } as unknown as LitheBridge
    useSettingsNavigationStore.setState({ category: 'archive' })

    render(<SettingsPage />)

    expect(await screen.findByRole('heading', { name: '已归档任务' })).toBeVisible()
    expect(screen.getByText('暂无已归档任务。')).toBeVisible()
  })

  it('stays in archive settings while restoring and deleting tasks', async (): Promise<void> => {
    const archivedTask: Task = {
      adapterId: 'adapter',
      adapterVersion: 1,
      agentSessionId: 'session-1',
      agentStatus: 'closed',
      archivedAt: new Date(1),
      createdAt: new Date(0),
      id: 'restore-task',
      isUnread: false,
      lastAttentionAt: null,
      lastViewedAt: null,
      lifecycle: 'archived',
      name: 'Restore',
      shouldAutoRestore: false,
      workspaceId: 'workspace-1',
    }
    const deleteTask = { ...archivedTask, id: 'delete-task', name: 'Delete' }
    const restore = vi
      .fn<LitheBridge['tasks']['restore']>()
      .mockResolvedValue({ ...archivedTask, archivedAt: null, lifecycle: 'active' })
    const deleteArchived = vi.fn<LitheBridge['tasks']['delete']>().mockResolvedValue(true)
    window.lithe = {
      adapters: {
        get: vi.fn<LitheBridge['adapters']['get']>().mockResolvedValue(null),
        list: vi.fn<LitheBridge['adapters']['list']>().mockResolvedValue([]),
      },
      preferences: {
        getNotificationsEnabled: vi.fn<LitheBridge['preferences']['getNotificationsEnabled']>().mockResolvedValue(true),
      },
      tasks: {
        delete: deleteArchived,
        listArchived: vi.fn<LitheBridge['tasks']['listArchived']>().mockResolvedValue([archivedTask, deleteTask]),
        restore,
      },
    } as unknown as LitheBridge
    useSettingsNavigationStore.setState({ category: 'archive' })

    render(<SettingsPage />)
    await userEvent.click((await screen.findAllByRole('button', { name: '恢复' }))[0])
    await userEvent.click(await screen.findByRole('button', { name: '删除 Delete' }))

    expect(restore).toHaveBeenCalledWith('restore-task')
    expect(deleteArchived).toHaveBeenCalledWith('delete-task')
    expect(screen.getByRole('heading', { name: '已归档任务' })).toBeVisible()
    expect(useSettingsNavigationStore.getState().category).toBe('archive')
  })

  it('persists and applies a selected theme', async (): Promise<void> => {
    const setTheme = vi.fn<(theme: Theme) => Promise<void>>().mockResolvedValue(undefined)
    const setDefaultShell = vi.fn<LitheBridge['shells']['setDefault']>().mockResolvedValue(undefined)
    window.lithe = {
      adapters: {
        create: vi.fn<LitheBridge['adapters']['create']>(),
        delete: vi.fn<LitheBridge['adapters']['delete']>().mockResolvedValue(undefined),
        get: vi.fn<LitheBridge['adapters']['get']>().mockResolvedValue(null),
        list: vi.fn<LitheBridge['adapters']['list']>().mockResolvedValue([]),
        setDefault: vi.fn<LitheBridge['adapters']['setDefault']>().mockResolvedValue(undefined),
        update: vi.fn<LitheBridge['adapters']['update']>(),
      },
      preferences: {
        getNotificationsEnabled: vi.fn<LitheBridge['preferences']['getNotificationsEnabled']>().mockResolvedValue(true),
        getPinnedGroupOpen: vi.fn<LitheBridge['preferences']['getPinnedGroupOpen']>().mockResolvedValue(true),
        getProjectGroupOpen: vi.fn<LitheBridge['preferences']['getProjectGroupOpen']>().mockResolvedValue(true),
        getSidebarOpen: vi.fn<LitheBridge['preferences']['getSidebarOpen']>().mockResolvedValue(true),
        getSidebarWidth: vi.fn<LitheBridge['preferences']['getSidebarWidth']>().mockResolvedValue(280),
        getTheme: vi.fn<() => Promise<Theme>>().mockResolvedValue('system'),
        setPinnedGroupOpen: vi.fn<LitheBridge['preferences']['setPinnedGroupOpen']>().mockResolvedValue(undefined),
        setNotificationsEnabled: vi
          .fn<LitheBridge['preferences']['setNotificationsEnabled']>()
          .mockResolvedValue(undefined),
        setProjectGroupOpen: vi.fn<LitheBridge['preferences']['setProjectGroupOpen']>().mockResolvedValue(undefined),
        setSidebarOpen: vi.fn<LitheBridge['preferences']['setSidebarOpen']>().mockResolvedValue(undefined),
        setSidebarWidth: vi.fn<LitheBridge['preferences']['setSidebarWidth']>().mockResolvedValue(undefined),
        setTheme,
      },
      projects: {
        create: vi.fn<LitheBridge['projects']['create']>(),
        getNavigation: vi
          .fn<LitheBridge['projects']['getNavigation']>()
          .mockResolvedValue({ activeWorkspaceId: null, projects: [], scratchWorkspaces: [] }),
        selectWorkspace: vi.fn<LitheBridge['projects']['selectWorkspace']>().mockResolvedValue(undefined),
      },
      runtime: { getInfo: vi.fn<() => Promise<RuntimeInfo>>() },
      shells: {
        getDefault: vi.fn<LitheBridge['shells']['getDefault']>().mockResolvedValue('pwsh.exe'),
        list: vi.fn<LitheBridge['shells']['list']>().mockResolvedValue(['pwsh.exe', 'cmd.exe']),
        setDefault: setDefaultShell,
      },
    } as unknown as LitheBridge
    useThemeStore.setState({ theme: 'system', isHydrated: true })
    useSettingsNavigationStore.setState({ category: 'general' })

    render(<SettingsPage />)
    await userEvent.click(screen.getByRole('radio', { name: '深色' }))

    expect(setTheme).toHaveBeenCalledWith('dark')
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')

    act((): void => useSettingsNavigationStore.getState().select('terminal'))
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: '默认 Shell' }), 'cmd.exe')
    expect(setDefaultShell).toHaveBeenCalledWith('cmd.exe')
  })
})
