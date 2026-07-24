import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { HomePage } from '../features/home/home-page'
import { SettingsPage } from '../features/settings/settings-page'
import { AppShell } from './app-shell'

const rootRoute = createRootRoute({ component: AppShell })
const homeRoute = createRoute({ component: HomePage, getParentRoute: (): typeof rootRoute => rootRoute, path: '/' })
const settingsRoute = createRoute({
  component: SettingsPage,
  getParentRoute: (): typeof rootRoute => rootRoute,
  path: '/settings',
})
const routeTree = rootRoute.addChildren([homeRoute, settingsRoute])

export const router = createRouter({ history: createHashHistory(), routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
