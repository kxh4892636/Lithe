import type { BrowserWindowConstructorOptions, Rectangle } from 'electron'
import { screen } from 'electron'

import type { WindowState } from '../shared/app-contract'

const minimumVisibleSize = 80

export const resolveWindowFrameOptions = (
  platform: NodeJS.Platform = process.platform,
): BrowserWindowConstructorOptions => ({
  backgroundColor: '#00000000',
  ...(platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', vibrancy: 'under-window', visualEffectState: 'active' }
    : { titleBarOverlay: { color: '#00000000', height: 44, symbolColor: '#64748b' }, titleBarStyle: 'hidden' }),
  transparent: true,
})

const intersectsDisplay = (bounds: Rectangle, workArea: Rectangle): boolean => {
  const horizontal = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
  const vertical = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
  return horizontal >= minimumVisibleSize && vertical >= minimumVisibleSize
}

export const resolveWindowOptions = (
  state: WindowState | undefined,
  primaryWorkArea: Rectangle = screen.getPrimaryDisplay().workArea,
): BrowserWindowConstructorOptions => {
  const width = Math.max(800, Math.round(primaryWorkArea.width * 0.61))
  const height = Math.max(560, Math.round(primaryWorkArea.height * 0.61))
  const defaults = {
    height,
    minHeight: 560,
    minWidth: 800,
    width,
    x: Math.round(primaryWorkArea.x + (primaryWorkArea.width - width) / 2),
    y: Math.round(primaryWorkArea.y + (primaryWorkArea.height - height) / 2),
  }
  if (!state) return defaults
  const bounds = { height: state.height, width: state.width, x: state.x, y: state.y }
  const isVisible = screen.getAllDisplays().some((display): boolean => intersectsDisplay(bounds, display.workArea))
  return isVisible ? { ...defaults, ...bounds } : defaults
}
