import { useEffect, useState } from 'react'

export type WindowFrameState = 'maximized' | 'snapped' | 'windowed'

const framedWindow =
  'bg-background grid size-full grid-rows-[44px_minmax(0,1fr)_1.5rem] overflow-hidden rounded-[12px] ring-1 ring-inset ring-foreground/25 shadow-[0_24px_64px_-28px_rgb(9_9_11/0.42)]'

export const windowFrameClassNames: Record<WindowFrameState, string> = {
  maximized: 'bg-background grid size-full grid-rows-[44px_minmax(0,1fr)_1.5rem] overflow-hidden',
  snapped: framedWindow,
  windowed: framedWindow,
}

export const useWindowFrameState = (): WindowFrameState => {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isSnapped, setIsSnapped] = useState(false)

  useEffect((): (() => void) => {
    void Promise.all([window.lithe.window.getMaximized(), window.lithe.window.getSnapped()])
      .then(([maximized, snapped]): void => {
        setIsMaximized(maximized)
        setIsSnapped(snapped)
      })
      .catch(globalThis.console.error)
    const removeMaximizedListener = window.lithe.window.onMaximizedChanged(setIsMaximized)
    const removeSnappedListener = window.lithe.window.onSnappedChanged(setIsSnapped)
    return (): void => {
      removeMaximizedListener()
      removeSnappedListener()
    }
  }, [])

  return isMaximized ? 'maximized' : isSnapped ? 'snapped' : 'windowed'
}
