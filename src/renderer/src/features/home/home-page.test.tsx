import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { RuntimeInfo, Theme } from '../../../../shared/app-contract'
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
        getTheme: vi.fn<() => Promise<Theme>>(),
        setTheme: vi.fn<(theme: Theme) => Promise<void>>(),
      },
      runtime: { getInfo: getRuntimeInfo },
    }
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
