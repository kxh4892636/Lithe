import { Outlet } from '@tanstack/react-router'
import { PanelLeftCloseIcon } from 'lucide-react'
import { type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'

import { AppSidebar } from './app-sidebar'
import { useNavigationAppearance } from './navigation-appearance'

export const AppShell = (): React.JSX.Element => {
  const { t } = useTranslation()
  const appearance = useNavigationAppearance()

  return (
    <SidebarProvider
      onOpenChange={appearance.setIsSidebarOpen}
      open={appearance.isSidebarOpen || appearance.isSidebarHovered}
      style={{ '--sidebar-width': `${appearance.sidebarWidth}px` } as CSSProperties}
    >
      <AppSidebar appearance={appearance} />
      <SidebarInset className="bg-background min-w-0 overflow-hidden">
        <header className="drag-region flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger className="no-drag" aria-label={t('navigation.toggleSidebar')}>
            <PanelLeftCloseIcon />
          </SidebarTrigger>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
