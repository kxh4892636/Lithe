import { describe, expect, it, vi } from 'vitest'

import { closeRendererWindow } from './shutdown-sequence'

describe('shutdown sequence', (): void => {
  it('waits for renderer close before removing IPC handlers', async (): Promise<void> => {
    const events: string[] = []
    let closed = (): void => undefined
    const window = {
      close: (): void => {
        events.push('renderer-close-requested')
        closed()
      },
      isDestroyed: (): boolean => false,
      once: (_event: 'closed', listener: () => void): void => {
        closed = (): void => {
          events.push('renderer-closed')
          listener()
        }
      },
    }
    const removeIpc = vi.fn<() => void>((): void => {
      events.push('ipc-removed')
    })

    await closeRendererWindow(window)
    removeIpc()

    expect(events).toEqual(['renderer-close-requested', 'renderer-closed', 'ipc-removed'])
  })
})
