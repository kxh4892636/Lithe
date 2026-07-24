import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { LitheBridge, RuntimeInfo, Theme } from '../../../../shared/app-contract'
import { SettingsPage } from './settings-page'
import { useThemeStore } from './theme-store'

describe('settings page', (): void => {
  it('persists and applies a selected theme', async (): Promise<void> => {
    const setTheme = vi.fn<(theme: Theme) => Promise<void>>().mockResolvedValue(undefined)
    const setDefaultShell = vi.fn<LitheBridge['shells']['setDefault']>().mockResolvedValue(undefined)
    window.lithe = {
      preferences: {
        getPinnedGroupOpen: vi.fn<LitheBridge['preferences']['getPinnedGroupOpen']>().mockResolvedValue(true),
        getProjectGroupOpen: vi.fn<LitheBridge['preferences']['getProjectGroupOpen']>().mockResolvedValue(true),
        getSidebarOpen: vi.fn<LitheBridge['preferences']['getSidebarOpen']>().mockResolvedValue(true),
        getSidebarWidth: vi.fn<LitheBridge['preferences']['getSidebarWidth']>().mockResolvedValue(256),
        getTheme: vi.fn<() => Promise<Theme>>().mockResolvedValue('system'),
        setPinnedGroupOpen: vi.fn<LitheBridge['preferences']['setPinnedGroupOpen']>().mockResolvedValue(undefined),
        setProjectGroupOpen: vi.fn<LitheBridge['preferences']['setProjectGroupOpen']>().mockResolvedValue(undefined),
        setSidebarOpen: vi.fn<LitheBridge['preferences']['setSidebarOpen']>().mockResolvedValue(undefined),
        setSidebarWidth: vi.fn<LitheBridge['preferences']['setSidebarWidth']>().mockResolvedValue(undefined),
        setTheme,
      },
      projects: {
        addDirectory: vi.fn<LitheBridge['projects']['addDirectory']>().mockResolvedValue(null),
        getNavigation: vi
          .fn<LitheBridge['projects']['getNavigation']>()
          .mockResolvedValue({ activeWorkspaceId: null, projects: [] }),
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

    render(<SettingsPage />)
    await userEvent.click(screen.getByRole('radio', { name: '深色' }))

    expect(setTheme).toHaveBeenCalledWith('dark')
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: '默认 Shell' }), 'cmd.exe')
    expect(setDefaultShell).toHaveBeenCalledWith('cmd.exe')
  })
})
