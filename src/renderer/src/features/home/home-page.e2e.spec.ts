import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

test('E2E-LITHE-001 application starts with runtime information', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const window = await electronSession.application.firstWindow()

  await expect(window.getByRole('heading', { name: '一眼确认应用状态' })).toBeVisible()
  await expect(window.getByText(/Electron 43/)).toBeVisible()
})
