import { create } from 'zustand'

import type { Theme } from '../../../../shared/app-contract'

interface ThemeState {
  hydrate: () => Promise<void>
  isHydrated: boolean
  setTheme: (theme: Theme) => Promise<void>
  theme: Theme
}

let systemListenerRegistered = false

const resolveDarkMode = (theme: Theme): boolean => {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

const applyTheme = (theme: Theme): void => {
  document.documentElement.classList.toggle('dark', resolveDarkMode(theme))
  document.documentElement.dataset.theme = theme
}

export const useThemeStore = create<ThemeState>(
  (set, get): ThemeState => ({
    hydrate: async (): Promise<void> => {
      const theme = await window.lithe.preferences.getTheme()
      applyTheme(theme)
      set({ isHydrated: true, theme })
      if (!systemListenerRegistered && typeof window.matchMedia === 'function') {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (): void => {
          if (get().theme === 'system') applyTheme('system')
        })
        systemListenerRegistered = true
      }
    },
    isHydrated: false,
    setTheme: async (theme: Theme): Promise<void> => {
      applyTheme(theme)
      set({ theme })
      await window.lithe.preferences.setTheme(theme)
    },
    theme: 'system',
  }),
)
