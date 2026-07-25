import { readdirSync, type Dirent } from 'node:fs'
import { join } from 'node:path'

export const countDirectoryEntries = (path: string): number => {
  let count = 0
  const pending = [path]
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue
    let entries: Dirent[]
    try {
      entries = readdirSync(current, { encoding: 'utf8', withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      count += 1
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(join(current, entry.name))
    }
  }
  return count
}
