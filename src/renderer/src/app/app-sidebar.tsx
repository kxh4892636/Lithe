import { Link } from '@tanstack/react-router'
import { ArchiveIcon, CircleUserRoundIcon, InfoIcon, Settings2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from '@/components/ui/sidebar'
import { PinnedNavigation, ProjectNavigation } from '@/features/projects/project-navigation'

import type { NavigationAppearance } from './navigation-appearance'

const AppSidebarFooter = (): React.JSX.Element => {
  const { t } = useTranslation()
  return (
    <SidebarFooter className="flex-row items-center justify-between">
      <details className="relative">
        <summary
          aria-label={t('appMenu.user')}
          className="hover:bg-sidebar-accent grid size-8 cursor-pointer list-none place-items-center rounded-md"
        >
          <CircleUserRoundIcon className="size-4" />
          <span className="sr-only">{t('appMenu.user')}</span>
        </summary>
        <div className="bg-popover text-popover-foreground absolute bottom-10 left-0 z-50 w-44 rounded-lg border p-1 shadow-lg">
          <Link className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm" to="/settings">
            <Settings2Icon className="size-4" />
            {t('navigation.settings')}
          </Link>
          <button
            className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            type="button"
          >
            <InfoIcon className="size-4" />
            {t('appMenu.about')}
          </button>
        </div>
      </details>
      <button
        className="hover:bg-sidebar-accent grid size-8 place-items-center rounded-md"
        title={t('appMenu.archive')}
        type="button"
      >
        <ArchiveIcon className="size-4" />
        <span className="sr-only">{t('appMenu.archive')}</span>
      </button>
    </SidebarFooter>
  )
}

const SidebarResizeHandle = ({ appearance }: { appearance: NavigationAppearance }): React.JSX.Element => {
  const { t } = useTranslation()
  return (
    <hr
      aria-label={t('navigation.resizeSidebar')}
      aria-orientation="vertical"
      className="absolute inset-y-0 right-0 z-30 m-0 h-auto w-1 cursor-col-resize border-0 group-data-[collapsible=icon]:hidden"
      {...appearance.resizeHandlers}
    />
  )
}

export const AppSidebar = ({ appearance }: { appearance: NavigationAppearance }): React.JSX.Element => {
  const { t } = useTranslation()
  return (
    <Sidebar
      className="bg-sidebar/75 backdrop-blur-xl"
      collapsible="icon"
      innerClassName="bg-transparent"
      overlayExpanded={!appearance.isSidebarOpen && appearance.isSidebarHovered}
      onMouseEnter={(): void => {
        if (!appearance.isSidebarOpen) appearance.setIsSidebarHovered(true)
      }}
      onMouseLeave={(): void => appearance.setIsSidebarHovered(false)}
    >
      <SidebarHeader className={appearance.platform === 'darwin' ? 'px-3 pt-12 pb-3' : 'p-3'}>
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
        <PinnedNavigation isOpen={appearance.isPinnedGroupOpen} onOpenChange={appearance.setIsPinnedGroupOpen} />
        <ProjectNavigation isOpen={appearance.isProjectGroupOpen} onOpenChange={appearance.setIsProjectGroupOpen} />
      </SidebarContent>
      <AppSidebarFooter />
      <SidebarResizeHandle appearance={appearance} />
      <SidebarRail />
    </Sidebar>
  )
}
