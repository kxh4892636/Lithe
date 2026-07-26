import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LitheBridge, RuntimeInfo } from '../../../shared/app-contract'
import { AppShell } from './app-shell'

const projectState = {
  hydrate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  selectWorkspace: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}
const toggleMaximizedProbe = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)

vi.mock('@tanstack/react-router', () => ({
  Outlet: (): React.JSX.Element => <div />,
  useNavigate: (): (() => Promise<void>) => vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  useRouterState: (): boolean => false,
}))

vi.mock('@/components/ui/sidebar', () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }): React.JSX.Element => <div>{children}</div>,
  SidebarProvider: ({ children, open }: { children: React.ReactNode; open: boolean }): React.JSX.Element => (
    <div data-open={String(open)} data-testid="sidebar-provider">
      {children}
    </div>
  ),
}))

vi.mock('@/features/projects/project-store', () => ({
  useProjectStore: Object.assign(
    (selector: (state: typeof projectState) => unknown): unknown => selector(projectState),
    { getState: (): typeof projectState => projectState },
  ),
}))

vi.mock('@/features/tasks/task-store', () => ({
  useTaskStore: {
    getState: (): {
      addBackgroundLaunch: () => void
      applyChange: () => void
      openTask: () => void
      tasksByWorkspace: Record<string, never[]>
    } => ({
      addBackgroundLaunch: vi.fn<() => void>(),
      applyChange: vi.fn<() => void>(),
      openTask: vi.fn<() => void>(),
      tasksByWorkspace: {},
    }),
  },
}))

vi.mock('./app-sidebar', () => ({
  AppSidebar: ({
    appearance,
  }: {
    appearance: { isSidebarHovered: boolean; isSidebarOpen: boolean }
  }): React.JSX.Element => (
    <div data-testid="app-sidebar">
      {appearance.isSidebarOpen ? 'open' : 'closed'}:{appearance.isSidebarHovered ? 'hovered' : 'not-hovered'}
    </div>
  ),
}))

const createBridge = ({
  isMaximized = false,
  isSnapped = false,
}: {
  isMaximized?: boolean
  isSnapped?: boolean
} = {}): LitheBridge =>
  ({
    agents: {
      onBackgroundLaunch: vi.fn<LitheBridge['agents']['onBackgroundLaunch']>((): (() => void) => (): void => undefined),
    },
    preferences: {
      getPinnedGroupOpen: vi.fn<LitheBridge['preferences']['getPinnedGroupOpen']>().mockResolvedValue(true),
      getProjectGroupOpen: vi.fn<LitheBridge['preferences']['getProjectGroupOpen']>().mockResolvedValue(true),
      getSidebarOpen: vi.fn<LitheBridge['preferences']['getSidebarOpen']>().mockResolvedValue(true),
      getSidebarWidth: vi.fn<LitheBridge['preferences']['getSidebarWidth']>().mockResolvedValue(256),
      setPinnedGroupOpen: vi.fn<LitheBridge['preferences']['setPinnedGroupOpen']>().mockResolvedValue(undefined),
      setProjectGroupOpen: vi.fn<LitheBridge['preferences']['setProjectGroupOpen']>().mockResolvedValue(undefined),
      setSidebarOpen: vi.fn<LitheBridge['preferences']['setSidebarOpen']>().mockResolvedValue(undefined),
      setSidebarWidth: vi.fn<LitheBridge['preferences']['setSidebarWidth']>().mockResolvedValue(undefined),
    },
    projects: {
      onNavigationChanged: vi.fn<LitheBridge['projects']['onNavigationChanged']>(
        (): (() => void) => (): void => undefined,
      ),
    },
    runtime: {
      getInfo: vi.fn<() => Promise<RuntimeInfo>>().mockResolvedValue({
        appVersion: '1.0.0',
        architecture: 'x64',
        electronVersion: '43.1.1',
        platform: 'win32',
        refreshedAt: '2026-07-26T00:00:00.000Z',
      }),
    },
    tasks: {
      onChanged: vi.fn<LitheBridge['tasks']['onChanged']>(() => (): void => undefined),
      onNavigate: vi.fn<LitheBridge['tasks']['onNavigate']>(() => (): void => undefined),
    },
    window: {
      getMaximized: vi.fn<LitheBridge['window']['getMaximized']>().mockResolvedValue(isMaximized),
      getSnapped: vi.fn<LitheBridge['window']['getSnapped']>().mockResolvedValue(isSnapped),
      onMaximizedChanged: vi.fn<LitheBridge['window']['onMaximizedChanged']>(() => (): void => undefined),
      onSnappedChanged: vi.fn<LitheBridge['window']['onSnappedChanged']>(() => (): void => undefined),
      toggleMaximized: toggleMaximizedProbe,
    },
  }) as unknown as LitheBridge

afterEach((): void => {
  cleanup()
  vi.clearAllMocks()
})

describe('app shell', (): void => {
  it('keeps the rounded framed shell while arranged by Windows Snap', async (): Promise<void> => {
    window.lithe = createBridge({ isSnapped: true })

    const { container } = render(<AppShell />)

    const shell = container.querySelector('[data-slot="app-shell"]')
    if (!(shell instanceof HTMLElement)) throw new Error('应用壳未渲染')
    await waitFor((): void => {
      expect(shell).toHaveAttribute('data-window-state', 'snapped')
    })
    expect(shell).toHaveClass('rounded-[12px]')
    expect(shell).toHaveClass('ring-1')
    expect(shell.className).toContain('shadow-[')
  })

  it('toggles maximize when the draggable title bar is double-clicked', (): void => {
    window.lithe = createBridge()

    const { container } = render(<AppShell />)
    const titlebar = container.querySelector('[data-slot="app-titlebar"]')
    if (!(titlebar instanceof HTMLElement)) throw new Error('应用标题栏未渲染')
    fireEvent.doubleClick(titlebar)

    expect(toggleMaximizedProbe).toHaveBeenCalledOnce()
  })

  it('hides the sidebar immediately and requires leaving the trigger before hover expansion', async (): Promise<void> => {
    window.lithe = createBridge()

    render(<AppShell />)
    await act(async (): Promise<void> => await Promise.resolve())
    const trigger = screen.getByRole('button', { name: '切换侧栏' })
    fireEvent.mouseEnter(trigger)
    fireEvent.click(trigger)

    await waitFor((): void => {
      expect(screen.getByTestId('app-sidebar')).toHaveTextContent('closed:not-hovered')
    })
    expect(screen.getByTestId('sidebar-provider')).toHaveAttribute('data-open', 'false')

    fireEvent.mouseEnter(trigger)
    expect(screen.getByTestId('app-sidebar')).toHaveTextContent('closed:not-hovered')
    fireEvent.mouseLeave(trigger)
    fireEvent.mouseEnter(trigger)
    expect(screen.getByTestId('app-sidebar')).toHaveTextContent('closed:hovered')
  })
})
