import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { installLitheToolSkill } from './skill-installer'

const directories: string[] = []
const temporaryHome = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'lithe-skill-'))
  directories.push(directory)
  return directory
}

afterEach((): void => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe('Lithe Tool Skill installer', (): void => {
  it('installs and updates the managed authoritative and discovery copies', (): void => {
    const home = temporaryHome()

    const first = installLitheToolSkill(home, 'version one')
    const second = installLitheToolSkill(home, 'version two')

    expect(first.installed).toHaveLength(3)
    expect(first.status).toBe('installed')
    expect(second.conflicts).toEqual([])
    expect(second.status).toBe('updated')
    expect(readFileSync(join(home, '.agents', 'skills', 'lithe-tool', 'SKILL.md'), 'utf8')).toBe('version two')

    const third = installLitheToolSkill(home, 'version two')
    expect(third.status).toBe('unchanged')
  })

  it('does not overwrite an unmanaged skill directory', (): void => {
    const home = temporaryHome()
    const target = join(home, '.claude', 'skills', 'lithe-tool')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'SKILL.md'), 'user content', 'utf8')

    const result = installLitheToolSkill(home, 'managed content')

    expect(result.conflicts).toContain(target)
    expect(result.status).toBe('conflict')
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toBe('user content')
  })

  it('does not overwrite a user-modified managed copy', (): void => {
    const home = temporaryHome()
    const target = join(home, '.agents', 'skills', 'lithe-tool')
    installLitheToolSkill(home, 'managed content')
    writeFileSync(join(target, 'SKILL.md'), 'user modification', 'utf8')

    const result = installLitheToolSkill(home, 'next managed content')

    expect(result.conflicts).toContain(target)
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toBe('user modification')
  })
})
