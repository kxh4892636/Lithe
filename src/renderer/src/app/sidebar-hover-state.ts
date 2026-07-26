import { useEffect, useRef, useState } from 'react'

type SidebarHoverSource = 'sidebar' | 'trigger'

interface SidebarHoverState {
  allowTriggerHover: () => void
  closeUntilTriggerLeaves: () => void
  isHovered: boolean
  setHovered: (isHovered: boolean, source?: SidebarHoverSource) => void
}

export const useSidebarHoverState = (): SidebarHoverState => {
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverSources = useRef({ sidebar: false, trigger: false })
  const triggerHoverSuppressed = useRef(false)
  const [isHovered, setIsHovered] = useState(false)

  const cancelClose = (): void => {
    if (!closeTimeout.current) return
    globalThis.clearTimeout(closeTimeout.current)
    closeTimeout.current = null
  }
  const setHovered = (nextHovered: boolean, source: SidebarHoverSource = 'sidebar'): void => {
    if (source === 'trigger') {
      if (!nextHovered) triggerHoverSuppressed.current = false
      else if (triggerHoverSuppressed.current) return
    }
    cancelClose()
    hoverSources.current[source] = nextHovered
    if (nextHovered) {
      setIsHovered(true)
      return
    }
    closeTimeout.current = globalThis.setTimeout((): void => {
      setIsHovered(hoverSources.current.sidebar || hoverSources.current.trigger)
      closeTimeout.current = null
    }, 120)
  }
  useEffect((): (() => void) => cancelClose, [])

  return {
    allowTriggerHover: (): void => {
      triggerHoverSuppressed.current = false
    },
    closeUntilTriggerLeaves: (): void => {
      cancelClose()
      hoverSources.current = { sidebar: false, trigger: false }
      triggerHoverSuppressed.current = true
      setIsHovered(false)
    },
    isHovered,
    setHovered,
  }
}
