import { useCallback, useEffect, useRef } from 'react'

export const useNavigatorResize = (
  width: number,
  onWidthChange: (width: number) => void,
): ((event: React.PointerEvent) => void) => {
  const cleanup = useRef<() => void>(() => undefined)
  useEffect((): (() => void) => (): void => cleanup.current(), [])
  return useCallback(
    (event: React.PointerEvent): void => {
      cleanup.current()
      const startX = event.clientX
      const startWidth = width
      const move = (moveEvent: PointerEvent): void => onWidthChange(startWidth + startX - moveEvent.clientX)
      const stop = (): void => {
        globalThis.removeEventListener('pointermove', move)
        globalThis.removeEventListener('pointerup', stop)
        globalThis.removeEventListener('pointercancel', stop)
        globalThis.removeEventListener('blur', stop)
      }
      cleanup.current = stop
      globalThis.addEventListener('pointermove', move)
      globalThis.addEventListener('pointerup', stop)
      globalThis.addEventListener('pointercancel', stop)
      globalThis.addEventListener('blur', stop)
    },
    [onWidthChange, width],
  )
}
