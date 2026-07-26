import { Link } from '@tanstack/react-router'
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BotIcon,
  CircleUserRoundIcon,
  InfoIcon,
  Settings2Icon,
  SearchIcon,
  SlidersHorizontalIcon,
  SquareTerminalIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'
import { PinnedNavigation, ProjectNavigation } from '@/features/projects/project-navigation'
import { type SettingsCategory, useSettingsNavigationStore } from '@/features/settings/settings-navigation-store'

import type { NavigationAppearance } from './navigation-appearance'
import { useNavigationSearchStore } from './navigation-search-store'

const AppSidebarFooter = (): React.JSX.Element => {
  const { t } = useTranslation()
  return (
    <SidebarFooter className="flex-row items-center justify-between">
      <Popover>
        <PopoverTrigger
          render={
            <button
              aria-label={t('appMenu.user')}
              className="hover:bg-sidebar-accent grid size-8 place-items-center rounded-md"
              type="button"
            />
          }
        >
          <CircleUserRoundIcon className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 gap-0 p-1" side="top">
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
        </PopoverContent>
      </Popover>
      <Link
        className="hover:bg-sidebar-accent grid size-8 place-items-center rounded-md"
        title={t('appMenu.archive')}
        to="/archive"
      >
        <ArchiveIcon className="size-4" />
        <span className="sr-only">{t('appMenu.archive')}</span>
      </Link>
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

const SettingsSidebar = ({ appearance }: { appearance: NavigationAppearance }): React.JSX.Element => {
  const category = useSettingsNavigationStore((state) => state.category)
  const select = useSettingsNavigationStore((state) => state.select)
  const items: Array<{
    category: SettingsCategory
    icon: React.ComponentType<{ className?: string }>
    label: string
  }> = [
    { category: 'general', icon: SlidersHorizontalIcon, label: '通用' },
    { category: 'agents', icon: BotIcon, label: 'Coding Agent' },
    { category: 'terminal', icon: SquareTerminalIcon, label: '终端' },
  ]
  return (
    <Sidebar
      className="top-[44px] bottom-6 h-auto bg-sidebar/75 backdrop-blur-xl"
      collapsible="offcanvas"
      innerClassName="bg-transparent"
      overlayExpanded={!appearance.isSidebarOpen && appearance.isSidebarHovered}
      onMouseEnter={(): void => appearance.setIsSidebarHovered(true)}
      onMouseLeave={(): void => appearance.setIsSidebarHovered(false)}
    >
      <SidebarHeader className="p-3">
        <Link
          className="hover:bg-sidebar-accent flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium"
          to="/"
        >
          <ArrowLeftIcon className="size-4" />
          返回中间主界面
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-2">
        {items.map(({ category: value, icon: Icon, label }) => (
          <button
            aria-current={value === category ? 'page' : undefined}
            className={
              value === category
                ? 'bg-sidebar-accent flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium'
                : 'hover:bg-sidebar-accent flex h-8 items-center gap-2 rounded-md px-2 text-xs'
            }
            key={value}
            onClick={(): void => select(value)}
            type="button"
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </SidebarContent>
      <SidebarResizeHandle appearance={appearance} />
    </Sidebar>
  )
}

export const AppSidebar = ({
  appearance,
  settings = false,
}: {
  appearance: NavigationAppearance
  settings?: boolean
}): React.JSX.Element => {
  const { t } = useTranslation()
  const query = useNavigationSearchStore((state) => state.query)
  const setQuery = useNavigationSearchStore((state) => state.setQuery)
  if (settings) return <SettingsSidebar appearance={appearance} />
  return (
    <Sidebar
      className="top-[44px] bottom-6 h-auto bg-sidebar/75 backdrop-blur-xl"
      collapsible="offcanvas"
      innerClassName="bg-transparent"
      overlayExpanded={!appearance.isSidebarOpen && appearance.isSidebarHovered}
      onMouseEnter={(): void => {
        if (!appearance.isSidebarOpen) appearance.setIsSidebarHovered(true)
      }}
      onMouseLeave={(): void => appearance.setIsSidebarHovered(false)}
    >
      <SidebarHeader className={appearance.platform === 'darwin' ? 'px-3 pt-12 pb-3' : 'p-3'}>
        <div className="flex items-center gap-3 overflow-hidden rounded-xl">
          <div className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold">
            LI
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">{t('app.name')}</p>
            <p className="text-muted-foreground truncate text-[11px]">{t('app.description')}</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-2">
        <div className="relative px-2 py-1">
          <SearchIcon className="text-muted-foreground absolute top-3 left-4 size-3" />
          <Input
            aria-label="搜索项目、工作区和任务"
            className="h-7 bg-sidebar-accent/50 pl-7 text-xs"
            onChange={(event): void => setQuery(event.target.value)}
            placeholder="搜索"
            value={query}
          />
        </div>
        <PinnedNavigation isOpen={appearance.isPinnedGroupOpen} onOpenChange={appearance.setIsPinnedGroupOpen} />
        <ProjectNavigation isOpen={appearance.isProjectGroupOpen} onOpenChange={appearance.setIsProjectGroupOpen} />
      </SidebarContent>
      <AppSidebarFooter />
      <SidebarResizeHandle appearance={appearance} />
    </Sidebar>
  )
}
