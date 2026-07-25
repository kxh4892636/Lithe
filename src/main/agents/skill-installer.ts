import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const markerName = '.lithe-managed.json'

export interface SkillInstallResult {
  conflicts: string[]
  installed: string[]
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

const installCopy = (directory: string, content: string): 'conflict' | 'installed' => {
  const markerPath = join(directory, markerName)
  if (existsSync(directory) && !isManagedCopy(directory)) return 'conflict'
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'SKILL.md'), content, 'utf8')
  writeFileSync(markerPath, `${JSON.stringify(marker(content), null, 2)}\n`, 'utf8')
  return 'installed'
}

export const installLitheToolSkill = (homeDirectory: string, content: string): SkillInstallResult => {
  const authoritative = join(homeDirectory, '.lithe', 'skills', 'lithe-tool')
  const targets = [
    authoritative,
    join(homeDirectory, '.agents', 'skills', 'lithe-tool'),
    join(homeDirectory, '.claude', 'skills', 'lithe-tool'),
  ]
  const result: SkillInstallResult = { conflicts: [], installed: [] }
  result.conflicts = targets.filter((target: string): boolean => existsSync(target) && !isManagedCopy(target))
  if (result.conflicts.length > 0) return result
  for (const target of targets) {
    if (installCopy(target, content) === 'installed') result.installed.push(target)
  }
  return result
}

export const readLitheToolSkill = (resourcePath: string): string =>
  readFileSync(join(resourcePath, 'lithe-tool', 'SKILL.md'), 'utf8')
