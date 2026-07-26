interface ClosableRendererWindow {
  close: () => void
  isDestroyed: () => boolean
  once: (event: 'closed', listener: () => void) => void
}

export const closeRendererWindow = async (window: ClosableRendererWindow | undefined): Promise<void> => {
  if (!window || window.isDestroyed()) return
  await new Promise<void>((resolve): void => {
    window.once('closed', resolve)
    window.close()
  })
}
