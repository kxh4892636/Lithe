import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { RuntimeInfo, Theme } from '../../../../shared/app-contract'
import { SettingsPage } from './settings-page'
import { useThemeStore } from './theme-store'

describe('settings page', (): void => {
  it('persists and applies a selected theme', async (): Promise<void> => {
    const setTheme = vi.fn<(theme: Theme) => Promise<void>>().mockResolvedValue(undefined)
    window.lithe = {
      preferences: {
        getTheme: vi.fn<() => Promise<Theme>>().mockResolvedValue('system'),
        setTheme,
      },
      runtime: { getInfo: vi.fn<() => Promise<RuntimeInfo>>() },
    }
    useThemeStore.setState({ theme: 'system', isHydrated: true })

    render(<SettingsPage />)
    await userEvent.click(screen.getByRole('radio', { name: '深色' }))

    expect(setTheme).toHaveBeenCalledWith('dark')
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
  })
})
