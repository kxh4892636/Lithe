import { describe, expect, it } from 'vitest'

import { resolvePersistedWindowState, resolveWindowFrameOptions, resolveWindowOptions } from './window-state'

describe('window state', (): void => {
  it('centers the first window at 61 percent of the display work area', (): void => {
    expect(resolveWindowOptions(undefined, { x: 0, y: 0, width: 1920, height: 1040 })).toEqual({
      height: 634,
      minHeight: 360,
      minWidth: 480,
      width: 1171,
      x: 375,
      y: 203,
    })
  })

  it('clamps a small display to the minimum window size', (): void => {
    expect(resolveWindowOptions(undefined, { x: 10, y: 20, width: 600, height: 500 })).toMatchObject({
      height: 360,
      width: 480,
      x: 70,
      y: 90,
    })
  })

  it('keeps the Windows frame opaque and resizable for native Snap', (): void => {
    expect(resolveWindowFrameOptions('win32')).toEqual({
      accentColor: false,
      backgroundColor: '#f4f4f5',
      hasShadow: true,
      roundedCorners: true,
      thickFrame: true,
      titleBarOverlay: { color: '#00000000', height: 44, symbolColor: '#52525b' },
      titleBarStyle: 'hidden',
    })
  })

  it('persists the current snapped bounds instead of the pre-snap normal bounds', (): void => {
    expect(
      resolvePersistedWindowState({
        bounds: { height: 1040, width: 960, x: 0, y: 0 },
        isMaximized: false,
        normalBounds: { height: 760, width: 1100, x: 220, y: 120 },
      }),
    ).toEqual({ height: 1040, isMaximized: false, width: 960, x: 0, y: 0 })
  })

  it('persists the restore bounds while retaining the maximized state', (): void => {
    expect(
      resolvePersistedWindowState({
        bounds: { height: 1040, width: 1920, x: 0, y: 0 },
        isMaximized: true,
        normalBounds: { height: 760, width: 1100, x: 220, y: 120 },
      }),
    ).toEqual({ height: 760, isMaximized: true, width: 1100, x: 220, y: 120 })
  })
})
