import { create } from 'zustand'

interface NavigationSearchState {
  query: string
  setQuery: (query: string) => void
}

export const useNavigationSearchStore = create<NavigationSearchState>((set) => ({
  query: '',
  setQuery: (query): void => set({ query }),
}))
