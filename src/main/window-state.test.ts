import { describe, expect, it } from 'vitest'

import { resolveWindowFrameOptions, resolveWindowOptions } from './window-state'

describe('window state', (): void => {
  it('centers the first window at 61 percent of the display work area', (): void => {
    expect(resolveWindowOptions(undefined, { x: 0, y: 0, width: 1920, height: 1040 })).toEqual({
      height: 634,
      minHeight: 560,
      minWidth: 800,
      width: 1171,
      x: 375,
      y: 203,
    })
  })

  it('clamps a small display to the minimum window size', (): void => {
    expect(resolveWindowOptions(undefined, { x: 10, y: 20, width: 1000, height: 700 })).toMatchObject({
      height: 560,
      width: 800,
      x: 110,
      y: 90,
    })
  })

  it('keeps native Windows controls compact without filling transparent corners', (): void => {
    expect(resolveWindowFrameOptions('win32')).toEqual({
      backgroundColor: '#00000000',
      titleBarOverlay: { color: '#00000000', height: 44, symbolColor: '#64748b' },
      titleBarStyle: 'hidden',
      transparent: true,
    })
  })
})
