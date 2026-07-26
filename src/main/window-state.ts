import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from 'electron'
import { screen } from 'electron'

import type { WindowState } from '../shared/app-contract'
import { ipcChannels } from '../shared/ipc-channels'

const minimumVisibleSize = 80
const minimumWindowHeight = 360
const minimumWindowWidth = 480

interface PersistedWindowStateInput {
  bounds: Rectangle
  isMaximized: boolean
  normalBounds: Rectangle
}

export interface WindowStatePersistence {
  cancel: () => void
  flush: (window: BrowserWindow) => void
  schedule: (window: BrowserWindow) => void
}

export const resolvePersistedWindowState = (input: PersistedWindowStateInput): WindowState => ({
  ...(input.isMaximized ? input.normalBounds : input.bounds),
  isMaximized: input.isMaximized,
})

export const createWindowStatePersistence = (save: (state: WindowState) => void): WindowStatePersistence => {
  let timer: NodeJS.Timeout | undefined
  const cancel = (): void => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  const flush = (window: BrowserWindow): void => {
    cancel()
    if (window.isDestroyed()) return
    save(
      resolvePersistedWindowState({
        bounds: window.getBounds(),
        isMaximized: window.isMaximized(),
        normalBounds: window.getNormalBounds(),
      }),
    )
  }
  return {
    cancel,
    flush,
    schedule: (window: BrowserWindow): void => {
      cancel()
      timer = setTimeout((): void => flush(window), 250)
    },
  }
}

export const attachWindowFrameStateEvents = (window: BrowserWindow, persistence: WindowStatePersistence): void => {
  window.on('maximize', (): void => {
    persistence.schedule(window)
    window.webContents.send(ipcChannels.windowMaximizedChanged, true)
  })
  const boundsChanged = (): void => {
    persistence.schedule(window)
    window.webContents.send(ipcChannels.windowSnappedChanged, window.snapped)
  }
  window.on('move', boundsChanged)
  window.on('resize', boundsChanged)
  window.on('unmaximize', (): void => {
    persistence.schedule(window)
    window.webContents.send(ipcChannels.windowMaximizedChanged, false)
    window.webContents.send(ipcChannels.windowSnappedChanged, window.snapped)
  })
}

export const resolveWindowFrameOptions = (
  platform: NodeJS.Platform = process.platform,
): BrowserWindowConstructorOptions => ({
  backgroundColor: '#f4f4f5',
  hasShadow: true,
  ...(platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', vibrancy: 'under-window', visualEffectState: 'active' }
    : {
        accentColor: false,
        roundedCorners: true,
        thickFrame: true,
        titleBarOverlay: { color: '#00000000', height: 44, symbolColor: '#52525b' },
        titleBarStyle: 'hidden',
      }),
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
  const width = Math.max(minimumWindowWidth, Math.round(primaryWorkArea.width * 0.61))
  const height = Math.max(minimumWindowHeight, Math.round(primaryWorkArea.height * 0.61))
  const defaults = {
    height,
    minHeight: minimumWindowHeight,
    minWidth: minimumWindowWidth,
    width,
    x: Math.round(primaryWorkArea.x + (primaryWorkArea.width - width) / 2),
    y: Math.round(primaryWorkArea.y + (primaryWorkArea.height - height) / 2),
  }
  if (!state) return defaults
  const bounds = { height: state.height, width: state.width, x: state.x, y: state.y }
  const isVisible = screen.getAllDisplays().some((display): boolean => intersectsDisplay(bounds, display.workArea))
  return isVisible ? { ...defaults, ...bounds } : defaults
}
