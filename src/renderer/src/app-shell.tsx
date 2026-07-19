import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { HomeIcon, PanelLeftCloseIcon, Settings2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'

export const AppShell = (): React.JSX.Element => {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state): string => state.location.pathname })

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="p-3">
          <div className="flex items-center gap-3 overflow-hidden rounded-xl px-2 py-2">
            <div className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold">
              LI
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold">{t('app.name')}</p>
              <p className="text-muted-foreground truncate text-[11px]">{t('app.description')}</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>工作区</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname === '/'}
                    render={<Link to="/" />}
                    tooltip={t('navigation.home')}
                  >
                    <HomeIcon />
                    <span>{t('navigation.home')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname === '/settings'}
                    render={<Link to="/settings" />}
                    tooltip={t('navigation.settings')}
                  >
                    <Settings2Icon />
                    <span>{t('navigation.settings')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <p className="text-muted-foreground px-2 font-mono text-[10px] group-data-[collapsible=icon]:hidden">
            LOCAL / TRUSTED
          </p>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="drag-region flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger className="no-drag" aria-label="折叠侧栏">
            <PanelLeftCloseIcon />
          </SidebarTrigger>
          <div className="h-4 w-px bg-border" />
          <p className="text-muted-foreground text-xs font-medium">
            {pathname === '/settings' ? t('navigation.settings') : t('navigation.home')}
          </p>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
