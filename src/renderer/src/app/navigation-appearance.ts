import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'

import { useProjectStore } from '@/features/projects/project-store'

import { useSidebarHoverState } from './sidebar-hover-state'

const persistPreference = (operation: string, promise: Promise<void>): void => {
  void promise.catch((error: unknown): void => {
    globalThis.console.error(`Lithe ${operation} failed`, error)
  })
}

const clampSidebarWidth = (width: number): number => Math.min(360, Math.max(280, width))

interface SidebarResizeHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLHRElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLHRElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLHRElement>) => void
}

export interface NavigationAppearance {
  isPinnedGroupOpen: boolean
  isProjectGroupOpen: boolean
  isSidebarHovered: boolean
  isSidebarOpen: boolean
  platform: string
  resizeHandlers: SidebarResizeHandlers
  setIsPinnedGroupOpen: (isOpen: boolean) => void
  setIsProjectGroupOpen: (isOpen: boolean) => void
  setIsSidebarHovered: (isHovered: boolean, source?: 'sidebar' | 'trigger') => void
  setIsSidebarOpen: (isOpen: boolean) => void
  sidebarWidth: number
}

const useSidebarResize = (sidebarWidth: number, setSidebarWidth: (width: number) => void): SidebarResizeHandlers => {
  const resizeStart = useRef<{ pointerX: number; width: number } | null>(null)
  const resolveWidth = (event: ReactPointerEvent<HTMLElement>): number => {
    const start = resizeStart.current
    return start ? clampSidebarWidth(start.width + event.clientX - start.pointerX) : sidebarWidth
  }

  return {
    onPointerDown: (event: ReactPointerEvent<HTMLHRElement>): void => {
      resizeStart.current = { pointerX: event.clientX, width: sidebarWidth }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: ReactPointerEvent<HTMLHRElement>): void => {
      if (resizeStart.current) setSidebarWidth(resolveWidth(event))
    },
    onPointerUp: (event: ReactPointerEvent<HTMLHRElement>): void => {
      const width = resolveWidth(event)
      resizeStart.current = null
      setSidebarWidth(width)
      persistPreference('sidebar width persistence', window.lithe.preferences.setSidebarWidth(width))
      event.currentTarget.releasePointerCapture(event.pointerId)
    },
  }
}

export const useNavigationAppearance = (): NavigationAppearance => {
  const hydrateProjects = useProjectStore((state) => state.hydrate)
  const sidebarHover = useSidebarHoverState()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isPinnedGroupOpen, setIsPinnedGroupOpenState] = useState(true)
  const [isProjectGroupOpen, setIsProjectGroupOpenState] = useState(true)
  const [platform, setPlatform] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const resizeHandlers = useSidebarResize(sidebarWidth, setSidebarWidth)

  useEffect((): void => {
    void hydrateProjects()
    void Promise.all([
      window.lithe.preferences.getSidebarOpen(),
      window.lithe.preferences.getSidebarWidth(),
      window.lithe.preferences.getPinnedGroupOpen(),
      window.lithe.preferences.getProjectGroupOpen(),
      window.lithe.runtime.getInfo(),
    ])
      .then(([sidebarOpen, width, pinnedOpen, projectOpen, runtime]): void => {
        setIsSidebarOpen(sidebarOpen)
        setSidebarWidth(width)
        setIsPinnedGroupOpenState(pinnedOpen)
        setIsProjectGroupOpenState(projectOpen)
        setPlatform(runtime.platform)
      })
      .catch((error: unknown): void => {
        globalThis.console.error('Lithe navigation preference hydration failed', error)
      })
  }, [hydrateProjects])

  return {
    isPinnedGroupOpen,
    isProjectGroupOpen,
    isSidebarHovered: sidebarHover.isHovered,
    isSidebarOpen,
    platform,
    resizeHandlers,
    setIsPinnedGroupOpen: (isOpen: boolean): void => {
      setIsPinnedGroupOpenState(isOpen)
      persistPreference('pinned group preference persistence', window.lithe.preferences.setPinnedGroupOpen(isOpen))
    },
    setIsProjectGroupOpen: (isOpen: boolean): void => {
      setIsProjectGroupOpenState(isOpen)
      persistPreference('project group preference persistence', window.lithe.preferences.setProjectGroupOpen(isOpen))
    },
    setIsSidebarHovered: sidebarHover.setHovered,
    setIsSidebarOpen: (isOpen: boolean): void => {
      if (isOpen) sidebarHover.allowTriggerHover()
      else sidebarHover.closeUntilTriggerLeaves()
      setIsSidebarOpen(isOpen)
      persistPreference('sidebar preference persistence', window.lithe.preferences.setSidebarOpen(isOpen))
    },
    sidebarWidth,
  }
}
