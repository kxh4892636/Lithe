import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { LitheBridge, RuntimeInfo, Theme } from '../../../../shared/app-contract'
import { HomePage } from './home-page'

describe('home page', (): void => {
  it('loads runtime information and refreshes it on demand', async (): Promise<void> => {
    const getRuntimeInfo = vi
      .fn<() => Promise<RuntimeInfo>>()
      .mockResolvedValueOnce({
        appVersion: '1.0.0',
        electronVersion: '43.1.1',
        platform: 'win32',
        architecture: 'x64',
        refreshedAt: '2026-07-20T01:00:00.000Z',
      })
      .mockResolvedValueOnce({
        appVersion: '1.0.0',
        electronVersion: '43.1.1',
        platform: 'win32',
        architecture: 'x64',
        refreshedAt: '2026-07-20T01:01:00.000Z',
      })
    window.lithe = {
      preferences: {
        getPinnedGroupOpen: vi.fn<LitheBridge['preferences']['getPinnedGroupOpen']>().mockResolvedValue(true),
        getProjectGroupOpen: vi.fn<LitheBridge['preferences']['getProjectGroupOpen']>().mockResolvedValue(true),
        getSidebarOpen: vi.fn<LitheBridge['preferences']['getSidebarOpen']>().mockResolvedValue(true),
        getSidebarWidth: vi.fn<LitheBridge['preferences']['getSidebarWidth']>().mockResolvedValue(256),
        getTheme: vi.fn<() => Promise<Theme>>(),
        setPinnedGroupOpen: vi.fn<LitheBridge['preferences']['setPinnedGroupOpen']>().mockResolvedValue(undefined),
        setProjectGroupOpen: vi.fn<LitheBridge['preferences']['setProjectGroupOpen']>().mockResolvedValue(undefined),
        setSidebarOpen: vi.fn<LitheBridge['preferences']['setSidebarOpen']>().mockResolvedValue(undefined),
        setSidebarWidth: vi.fn<LitheBridge['preferences']['setSidebarWidth']>().mockResolvedValue(undefined),
        setTheme: vi.fn<(theme: Theme) => Promise<void>>(),
      },
      projects: {
        addDirectory: vi.fn<LitheBridge['projects']['addDirectory']>().mockResolvedValue(null),
        getNavigation: vi
          .fn<LitheBridge['projects']['getNavigation']>()
          .mockResolvedValue({ activeWorkspaceId: null, projects: [] }),
        selectWorkspace: vi.fn<LitheBridge['projects']['selectWorkspace']>().mockResolvedValue(undefined),
      },
      runtime: { getInfo: getRuntimeInfo },
    } as unknown as LitheBridge
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <HomePage />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Electron 43.1.1')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '刷新运行信息' }))

    expect(getRuntimeInfo).toHaveBeenCalledTimes(2)
    expect(await screen.findByText(/01:01/)).toBeInTheDocument()
  })
})
