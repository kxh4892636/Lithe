import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, it } from 'vitest'

import { createWorkspaceRecoveryStore, type WorkspaceCreateRecovery } from './create-recovery-store'

it('writes a recovery marker even when an orphaned temporary marker exists', (): void => {
  const root = mkdtempSync(join(process.cwd(), 'temp', 'recovery-store-'))
  const workspaceRoot = join(root, 'managed')
  const workspacePath = join(workspaceRoot, 'project', 'Review')
  const recovery: WorkspaceCreateRecovery = {
    branch: 'feature/review',
    kind: 'new',
    projectId: 'project-1',
    rootPath: workspacePath,
    sourceRoot: join(root, 'repository'),
  }

  try {
    mkdirSync(join(workspaceRoot, 'project'), { recursive: true })
    writeFileSync(`${workspacePath}.lithe-create.json.orphan.tmp`, 'partial')
    const store = createWorkspaceRecoveryStore(workspaceRoot)

    store.save(recovery)

    expect(store.load(workspacePath)).toEqual(recovery)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
