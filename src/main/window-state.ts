import type { BrowserWindowConstructorOptions, Rectangle } from 'electron'
import { screen } from 'electron'

import type { WindowState } from '../shared/app-contract'

const minimumVisibleSize = 80

const intersectsDisplay = (bounds: Rectangle, workArea: Rectangle): boolean => {
  const horizontal = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
  const vertical = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
  return horizontal >= minimumVisibleSize && vertical >= minimumVisibleSize
}

export const resolveWindowOptions = (state: WindowState | undefined): BrowserWindowConstructorOptions => {
  const defaults = { height: 720, minHeight: 560, minWidth: 800, width: 1100 }
  if (!state) return defaults
  const bounds = { height: state.height, width: state.width, x: state.x, y: state.y }
  const isVisible = screen.getAllDisplays().some((display): boolean => intersectsDisplay(bounds, display.workArea))
  return isVisible ? { ...defaults, ...bounds } : defaults
}
