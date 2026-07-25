import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { PanelLeftCloseIcon } from 'lucide-react'
import { type CSSProperties, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useProjectStore } from '@/features/projects/project-store'
import { useTaskStore } from '@/features/tasks/task-store'

import { AppSidebar } from './app-sidebar'
import { useNavigationAppearance } from './navigation-appearance'

export const AppShell = (): React.JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const appearance = useNavigationAppearance()
  const isSettings = useRouterState({ select: (state): boolean => state.location.pathname === '/settings' })
  const [isMaximized, setIsMaximized] = useState(false)
  useEffect((): (() => void) => {
    void window.lithe.window.getMaximized().then(setIsMaximized).catch(globalThis.console.error)
    return window.lithe.window.onMaximizedChanged(setIsMaximized)
  }, [])
  useEffect(
    (): (() => void) =>
      window.lithe.tasks.onNavigate((taskId: string): void => {
        const task = Object.values(useTaskStore.getState().tasksByWorkspace)
          .flat()
          .find((candidate): boolean => candidate.id === taskId)
        if (!task) return
        void useProjectStore
          .getState()
          .selectWorkspace(task.workspaceId)
          .then((): void => {
            useTaskStore.getState().openTask(task.id)
            void navigate({ to: '/' })
          })
      }),
    [navigate],
  )
  useEffect(
    (): (() => void) =>
      window.lithe.agents.onBackgroundLaunch((event): void => {
        useTaskStore.getState().addBackgroundLaunch(event)
      }),
    [],
  )
  useEffect(
    (): (() => void) =>
      window.lithe.tasks.onChanged((event): void => {
        useTaskStore.getState().applyChange(event)
      }),
    [],
  )
  useEffect(
    (): (() => void) =>
      window.lithe.projects.onNavigationChanged((): void => {
        void useProjectStore.getState().hydrate()
      }),
    [],
  )

  return (
    <div
      className={
        isMaximized
          ? 'bg-background grid size-full grid-rows-[3rem_minmax(0,1fr)_1.5rem] overflow-hidden'
          : 'bg-background grid size-full grid-rows-[3rem_minmax(0,1fr)_1.5rem] overflow-hidden rounded-xl border'
      }
    >
      <header
        className="drag-region flex items-center border-b px-3 pr-36"
        onDoubleClick={(event): void => {
          if (event.target !== event.currentTarget) return
          void window.lithe.window.toggleMaximized().then(setIsMaximized).catch(globalThis.console.error)
        }}
      >
        <Button
          aria-label={t('navigation.toggleSidebar')}
          className="no-drag"
          onClick={(): void => {
            const nextOpen = !appearance.isSidebarOpen
            appearance.setIsSidebarOpen(nextOpen)
          }}
          onMouseEnter={(): void => appearance.setIsSidebarHovered(true, 'trigger')}
          onMouseLeave={(): void => appearance.setIsSidebarHovered(false, 'trigger')}
          size="icon-sm"
          variant="ghost"
        >
          <PanelLeftCloseIcon />
        </Button>
      </header>
      <SidebarProvider
        className="min-h-0"
        onOpenChange={appearance.setIsSidebarOpen}
        open={appearance.isSidebarOpen || appearance.isSidebarHovered}
        style={{ '--sidebar-width': `${appearance.sidebarWidth}px` } as CSSProperties}
      >
        <AppSidebar appearance={appearance} settings={isSettings} />
        <SidebarInset className="bg-background min-h-0 min-w-0 overflow-hidden">
          <main className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
      <footer className="border-t" aria-label="应用状态栏" />
    </div>
  )
}
