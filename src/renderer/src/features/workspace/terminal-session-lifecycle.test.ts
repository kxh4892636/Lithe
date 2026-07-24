import { describe, expect, it, vi } from 'vitest'

import { createTerminalSessionCoordinator } from './terminal-session-lifecycle'

describe('terminal session lifecycle', (): void => {
  it('closes an earlier mount before reopening the same panel identity', async (): Promise<void> => {
    const events: string[] = []
    const coordinator = createTerminalSessionCoordinator()
    const first = coordinator.acquire(
      'terminal-1',
      async (): Promise<void> => {
        events.push('open:first')
      },
      async (): Promise<void> => {
        events.push('close:first')
      },
    )

    const firstRelease = first.release()
    const secondOpen = vi.fn<() => Promise<void>>(async (): Promise<void> => {
      events.push('open:second')
    })
    const second = coordinator.acquire('terminal-1', secondOpen, async (): Promise<void> => undefined)

    await second.ready

    expect(events).toEqual(['open:first', 'close:first', 'open:second'])
    expect(secondOpen).toHaveBeenCalledOnce()
    await firstRelease
    await second.release()
  })
})
