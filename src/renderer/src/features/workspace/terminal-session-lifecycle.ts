export interface TerminalSessionLease {
  ready: Promise<void>
  release: () => Promise<void>
}

export interface TerminalSessionCoordinator {
  acquire: (panelId: string, open: () => Promise<void>, close: () => Promise<void>) => TerminalSessionLease
}

export const createTerminalSessionCoordinator = (): TerminalSessionCoordinator => {
  const lifecycles = new Map<string, Promise<void>>()

  return {
    acquire: (panelId: string, open: () => Promise<void>, close: () => Promise<void>): TerminalSessionLease => {
      const previous = lifecycles.get(panelId) ?? Promise.resolve()
      let finishLifecycle: () => void = (): void => undefined
      const lifecycleFinished = new Promise<void>((resolve): void => {
        finishLifecycle = resolve
      })
      const ready = previous.catch((): void => undefined).then(open)
      let releasePromise: Promise<void> | undefined

      lifecycles.set(panelId, lifecycleFinished)
      return {
        ready,
        release: (): Promise<void> => {
          if (releasePromise) return releasePromise
          releasePromise = ready.then(close).finally((): void => {
            if (lifecycles.get(panelId) === lifecycleFinished) lifecycles.delete(panelId)
            finishLifecycle()
          })
          return releasePromise
        },
      }
    },
  }
}

export const terminalSessionCoordinator = createTerminalSessionCoordinator()
