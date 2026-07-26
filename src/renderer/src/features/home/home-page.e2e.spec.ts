import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

test('E2E-LITHE-001 application starts with runtime information', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const window = await electronSession.application.firstWindow()

  await expect(window.getByRole('heading', { name: '一眼确认应用状态' })).toBeVisible()
  await expect(window.getByText(/Electron 43/)).toBeVisible()
  const shell = window.locator('[data-slot="app-shell"]')
  await expect(window.locator('[data-slot="app-titlebar"]')).toHaveCSS('height', '44px')
  await expect
    .poll(
      async (): Promise<number> =>
        Number.parseFloat(await shell.evaluate((element) => getComputedStyle(element).borderTopWidth)),
    )
    .toBeGreaterThan(0)
  await expect
    .poll(
      async (): Promise<number> =>
        Number.parseFloat(await shell.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)),
    )
    .toBeGreaterThan(0)
})
