import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

test('E2E-LITHE-002 theme persists after application restart', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  let window = await electronSession.application.firstWindow()

  await window.getByLabel('用户菜单').click()
  await window.getByRole('link', { name: '设置' }).click()
  await expect(window.getByRole('heading', { name: '让界面适应你的工作环境' })).toBeVisible()
  await window.getByText('深色', { exact: true }).click()
  await expect(window.locator('html')).toHaveClass(/dark/)
  await window.screenshot({ path: 'test-results/E2E-LITHE-002-dark-theme.png' })

  const restartedApplication = await electronSession.restart()
  window = await restartedApplication.firstWindow()
  await window.getByLabel('用户菜单').click()
  await window.getByRole('link', { name: '设置' }).click()

  await expect(window.locator('html')).toHaveClass(/dark/)
  await expect(window.getByRole('radio', { name: /深色/ })).toHaveAttribute('aria-checked', 'true')
})
