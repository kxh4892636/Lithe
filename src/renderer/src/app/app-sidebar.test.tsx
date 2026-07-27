import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'

import { AppSidebar } from './app-sidebar'
import type { NavigationAppearance } from './navigation-appearance'

interface RouterLinkProps {
  children: React.ReactNode
  className?: string
  to: string
}

vi.mock('@tanstack/react-router', () => ({
  Link: (props: RouterLinkProps): React.JSX.Element => {
    const { children, className, to } = props
    return (
      <a className={className} href={to}>
        {children}
      </a>
    )
  },
}))

const appearance: NavigationAppearance = {
  isPinnedGroupOpen: true,
  isProjectGroupOpen: true,
  isSidebarHovered: false,
  isSidebarOpen: true,
  platform: 'win32',
  resizeHandlers: {
    onPointerDown: vi.fn<NavigationAppearance['resizeHandlers']['onPointerDown']>(),
    onPointerMove: vi.fn<NavigationAppearance['resizeHandlers']['onPointerMove']>(),
    onPointerUp: vi.fn<NavigationAppearance['resizeHandlers']['onPointerUp']>(),
  },
  setIsPinnedGroupOpen: vi.fn<NavigationAppearance['setIsPinnedGroupOpen']>(),
  setIsProjectGroupOpen: vi.fn<NavigationAppearance['setIsProjectGroupOpen']>(),
  setIsSidebarHovered: vi.fn<NavigationAppearance['setIsSidebarHovered']>(),
  setIsSidebarOpen: vi.fn<NavigationAppearance['setIsSidebarOpen']>(),
  sidebarWidth: 280,
}

window.matchMedia = vi.fn<(query: string) => MediaQueryList>((query: string): MediaQueryList => {
  return {
    addEventListener: vi.fn<MediaQueryList['addEventListener']>(),
    addListener: vi.fn<MediaQueryList['addListener']>(),
    dispatchEvent: vi.fn<MediaQueryList['dispatchEvent']>(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn<MediaQueryList['removeEventListener']>(),
    removeListener: vi.fn<MediaQueryList['removeListener']>(),
  }
})

describe('app sidebar', (): void => {
  it('shows the archive category with the settings navigation typography and spacing', (): void => {
    const { container } = render(
      <SidebarProvider>
        <AppSidebar appearance={appearance} settings />
      </SidebarProvider>,
    )

    expect(screen.getByRole('link', { name: '返回主界面' })).toHaveClass('text-sm')
    expect(screen.getByRole('button', { name: '归档' })).toHaveClass('text-sm')
    expect(container.querySelector('[data-slot="sidebar-content"]')).toHaveClass('gap-1')
  })
})
