import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const markerName = '.lithe-managed.json'

export interface SkillInstallResult {
  conflicts: string[]
  installed: string[]
  status: 'conflict' | 'installed' | 'unchanged' | 'updated'
}

interface ManagedMarker {
  contentHash: string
  version: number
}

const marker = (content: string): ManagedMarker => ({
  contentHash: createHash('sha256').update(content).digest('hex'),
  version: 1,
})

const isManagedCopy = (directory: string): boolean => {
  const markerPath = join(directory, markerName)
  const skillPath = join(directory, 'SKILL.md')
  if (!existsSync(markerPath) || !existsSync(skillPath)) return false
  try {
    const saved = JSON.parse(readFileSync(markerPath, 'utf8')) as Partial<ManagedMarker>
    return saved.version === 1 && saved.contentHash === marker(readFileSync(skillPath, 'utf8')).contentHash
  } catch {
    return false
  }
}

const installCopy = (directory: string, content: string): 'conflict' | 'installed' | 'unchanged' | 'updated' => {
  const markerPath = join(directory, markerName)
  if (existsSync(directory) && !isManagedCopy(directory)) return 'conflict'
  if (existsSync(directory) && readFileSync(join(directory, 'SKILL.md'), 'utf8') === content) return 'unchanged'
  const status = existsSync(directory) ? 'updated' : 'installed'
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'SKILL.md'), content, 'utf8')
  writeFileSync(markerPath, `${JSON.stringify(marker(content), null, 2)}\n`, 'utf8')
  return status
}

export const installLitheToolSkill = (homeDirectory: string, content: string): SkillInstallResult => {
  const authoritative = join(homeDirectory, '.lithe', 'skills', 'lithe-tool')
  const targets = [
    authoritative,
    join(homeDirectory, '.agents', 'skills', 'lithe-tool'),
    join(homeDirectory, '.claude', 'skills', 'lithe-tool'),
  ]
  const result: SkillInstallResult = { conflicts: [], installed: [], status: 'unchanged' }
  result.conflicts = targets.filter((target: string): boolean => existsSync(target) && !isManagedCopy(target))
  if (result.conflicts.length > 0) return { ...result, status: 'conflict' }
  const statuses: Array<'conflict' | 'installed' | 'unchanged' | 'updated'> = []
  for (const target of targets) {
    const status = installCopy(target, content)
    statuses.push(status)
    if (status !== 'unchanged') result.installed.push(target)
  }
  return {
    ...result,
    status: statuses.includes('conflict')
      ? 'conflict'
      : statuses.includes('installed')
        ? 'installed'
        : statuses.includes('updated')
          ? 'updated'
          : 'unchanged',
  }
}

export const readLitheToolSkill = (resourcePath: string): string =>
  readFileSync(join(resourcePath, 'lithe-tool', 'SKILL.md'), 'utf8')
