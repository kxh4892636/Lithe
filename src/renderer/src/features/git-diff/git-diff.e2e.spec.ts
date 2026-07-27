import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { simpleGit } from 'simple-git'

import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

test('E2E-LITHE-012 reviews staged and unstaged views as distinct read-only panels', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const root = mkdtempSync(join(tmpdir(), 'lithe-git-diff-'))
  const git = simpleGit(root)
  try {
    await git.init(['--initial-branch=main'])
    await git.addConfig('user.name', 'Lithe E2E')
    await git.addConfig('user.email', 'lithe@example.test')
    writeFileSync(join(root, 'shared.txt'), 'base\n')
    await git.add('shared.txt')
    await git.commit('initial')
    mkdirSync(join(root, 'unopened', 'deep'), { recursive: true })
    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] })
    }, root)
    const window = await electronSession.application.firstWindow()
    await window.getByRole('button', { name: '添加项目' }).click()
    await window.getByRole('button', { name: '选择已有文件夹' }).click()
    await window.getByRole('button', { name: '创建项目' }).click()
    await expect(window.getByText(basename(root), { exact: true }).first()).toBeVisible()

    writeFileSync(join(root, 'shared.txt'), 'staged\n')
    await git.add('shared.txt')
    writeFileSync(join(root, 'shared.txt'), 'unstaged\n')
    writeFileSync(join(root, 'new.txt'), 'untracked\n')
    for (let index = 0; index < 100; index += 1) {
      writeFileSync(join(root, `untracked-${String(index).padStart(2, '0')}.txt`), `${index}\n`)
    }
    await expect(window.getByRole('button', { name: '变更' })).toBeVisible()
    await window.getByRole('button', { name: '变更' }).click()
    const staged = window.getByRole('region', { name: '已暂存' })
    const unstaged = window.getByRole('region', { name: '未暂存' })
    await expect(staged.getByRole('button', { name: 'shared.txt' })).toBeVisible()
    await expect(unstaged.getByRole('button', { name: 'shared.txt' })).toBeVisible()
    await expect(window.getByRole('region', { name: '未跟踪' }).getByRole('button', { name: 'new.txt' })).toBeVisible()
    writeFileSync(join(root, 'unopened', 'deep', 'late.txt'), 'late\n')
    await expect(
      window.getByRole('region', { name: '未跟踪' }).getByRole('button', { name: 'unopened/deep/late.txt' }),
    ).toBeVisible({ timeout: 8_000 })

    await staged.getByRole('button', { name: 'shared.txt' }).click()
    await expect(window.getByLabel('Git Diff staged shared.txt')).toHaveCount(1)
    await staged.getByRole('button', { name: 'shared.txt' }).click()
    await expect(window.getByLabel('Git Diff staged shared.txt')).toHaveCount(2)
    await unstaged.getByRole('button', { name: 'shared.txt' }).click()
    await expect(window.getByLabel('Git Diff unstaged shared.txt')).toHaveCount(1)
    await git.add('shared.txt')
    await expect(window.getByLabel('Git Diff staged shared.txt').first()).toHaveAttribute('data-modified-length', '9')
    const tree = window.getByLabel('Git 变更树')
    const dimensions = await tree.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }))
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight)
    await tree.evaluate((element): void => {
      element.scrollTop = 300
      element.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await expect
      .poll(
        async (): Promise<number> =>
          window.evaluate((): number =>
            Math.max(
              0,
              ...Object.keys(localStorage)
                .filter((key): boolean => key.startsWith('lithe:git-changes:'))
                .map((key): number => Number(localStorage.getItem(key)) || 0),
            ),
          ),
      )
      .toBeGreaterThan(250)
    await window.getByRole('button', { name: '关闭右侧导航' }).click()
    await window.getByRole('button', { name: '打开右侧文件导航' }).click()
    await expect(window.getByLabel('Git 变更树')).toBeVisible()
    await expect
      .poll(async (): Promise<number> => await window.getByLabel('Git 变更树').evaluate((element) => element.scrollTop))
      .toBeGreaterThan(250)
  } finally {
    await electronSession.application.close()
    rmSync(root, { force: true, recursive: true })
  }
})

test('E2E-LITHE-013 hides the Changes tab outside a Git repository', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const root = mkdtempSync(join(tmpdir(), 'lithe-no-git-diff-'))
  try {
    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] })
    }, root)
    const window = await electronSession.application.firstWindow()
    await window.getByRole('button', { name: '添加项目' }).click()
    await window.getByRole('button', { name: '选择已有文件夹' }).click()
    await window.getByRole('button', { name: '创建项目' }).click()
    await expect(window.getByText(basename(root), { exact: true }).first()).toBeVisible()
    await expect(window.getByRole('complementary', { name: '工作区文件导航' })).toHaveAttribute(
      'data-git-repository',
      'false',
    )
    await expect(window.getByRole('button', { name: '变更' })).toHaveCount(0)
    await simpleGit(root).init(['--initial-branch=main'])
    await expect(window.getByRole('button', { name: '变更' })).toBeVisible()
  } finally {
    await electronSession.application.close()
    rmSync(root, { force: true, recursive: true })
  }
})
