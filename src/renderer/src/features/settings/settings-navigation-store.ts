import { create } from 'zustand'

export type SettingsCategory = 'general' | 'agents' | 'terminal'

interface SettingsNavigationState {
  category: SettingsCategory
  select: (category: SettingsCategory) => void
}

export const useSettingsNavigationStore = create<SettingsNavigationState>((set) => ({
  category: 'general',
  select: (category): void => set({ category }),
}))
