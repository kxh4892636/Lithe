import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const markerName = '.lithe-managed.json'
const defaultLogError = (message: string, error: unknown): void => {
  process.stderr.write(`${message}: ${error instanceof Error ? error.message : String(error)}\n`)
}

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

const installCopy = (
  directory: string,
  content: string,
  logError: (message: string, error: unknown) => void,
): 'conflict' | 'installed' | 'unchanged' | 'updated' => {
  const markerPath = join(directory, markerName)
  if (existsSync(directory) && !isManagedCopy(directory)) return 'conflict'
  if (existsSync(directory) && readFileSync(join(directory, 'SKILL.md'), 'utf8') === content) return 'unchanged'
  const status = existsSync(directory) ? 'updated' : 'installed'
  const skillPath = join(directory, 'SKILL.md')
  let previousSkill: string | undefined
  let previousMarker: string | undefined
  try {
    previousSkill = status === 'updated' ? readFileSync(skillPath, 'utf8') : undefined
    previousMarker = status === 'updated' ? readFileSync(markerPath, 'utf8') : undefined
    mkdirSync(directory, { recursive: true })
    writeFileSync(skillPath, content, 'utf8')
    writeFileSync(markerPath, `${JSON.stringify(marker(content), null, 2)}\n`, 'utf8')
    return status
  } catch (error: unknown) {
    try {
      if (status === 'installed') {
        rmSync(directory, { force: true, recursive: true })
      } else {
        writeFileSync(skillPath, previousSkill ?? '', 'utf8')
        writeFileSync(markerPath, previousMarker ?? '', 'utf8')
      }
    } catch (rollbackError: unknown) {
      logError(`Lithe Tool Skill rollback failed for ${directory}`, rollbackError)
    }
    logError(`Lithe Tool Skill installation failed for ${directory}`, error)
    return 'conflict'
  }
}

export const installLitheToolSkill = (
  homeDirectory: string,
  content: string,
  logError: (message: string, error: unknown) => void = defaultLogError,
): SkillInstallResult => {
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
    let status: 'conflict' | 'installed' | 'unchanged' | 'updated'
    try {
      status = installCopy(target, content, logError)
    } catch (error: unknown) {
      logError(`Lithe Tool Skill inspection failed for ${target}`, error)
      status = 'conflict'
    }
    statuses.push(status)
    if (status === 'installed' || status === 'updated') result.installed.push(target)
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
