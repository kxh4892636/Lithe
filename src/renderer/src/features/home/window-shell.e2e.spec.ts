import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

test('E2E-LITHE-014 restores the framed shell after maximizing and exits without missing IPC handlers', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const application = electronSession.application
  const window = await application.firstWindow()
  const stderr: string[] = []
  application.process().stderr?.on('data', (chunk: Buffer): void => {
    stderr.push(chunk.toString())
  })

  await window.locator('[data-slot="app-titlebar"]').dblclick({ position: { x: 300, y: 20 } })
  await expect
    .poll(
      async (): Promise<boolean> =>
        application.evaluate(({ BrowserWindow }): boolean => BrowserWindow.getAllWindows()[0]?.isMaximized() ?? false),
    )
    .toBe(true)

  await window.locator('[data-slot="app-titlebar"]').dblclick({ position: { x: 300, y: 20 } })
  await expect
    .poll(
      async (): Promise<boolean> =>
        application.evaluate(({ BrowserWindow }): boolean => BrowserWindow.getAllWindows()[0]?.isMaximized() ?? true),
    )
    .toBe(false)
  await expect
    .poll(
      async (): Promise<number> =>
        window
          .locator('[data-slot="app-shell"]')
          .evaluate((element): number => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)),
    )
    .toBeGreaterThan(0)

  const splitBounds = await application.evaluate(({ BrowserWindow, screen }) => {
    const nativeWindow = BrowserWindow.getAllWindows()[0]
    if (!nativeWindow) throw new Error('Lithe window is missing')
    const workArea = screen.getDisplayMatching(nativeWindow.getBounds()).workArea
    const bounds = {
      height: workArea.height,
      width: Math.floor(workArea.width / 2),
      x: workArea.x,
      y: workArea.y,
    }
    nativeWindow.setBounds(bounds)
    return bounds
  })
  await expect
    .poll(
      async (): Promise<boolean> =>
        application.evaluate(({ BrowserWindow }, expected) => {
          const bounds = BrowserWindow.getAllWindows()[0]?.getBounds()
          return (
            Math.abs((bounds?.height ?? 0) - expected.height) <= 4 &&
            Math.abs((bounds?.width ?? 0) - expected.width) <= 4
          )
        }, splitBounds),
    )
    .toBe(true)
  await expect
    .poll(async (): Promise<number> => window.evaluate((): number => globalThis.innerWidth))
    .toBeLessThanOrEqual(splitBounds.width)

  await electronSession.close()

  expect(stderr.join('')).not.toContain('No handler registered')
})
