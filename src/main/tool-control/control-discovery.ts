import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { posix, win32 } from 'node:path'

import { z } from 'zod'

const controlDiscoverySchema = z
  .object({
    endpoint: z.string().min(1).max(512),
    token: z.string().min(32).max(256),
  })
  .strict()

export type ControlDiscovery = z.infer<typeof controlDiscoverySchema>

export const resolveControlDiscoveryPath = (runtimeDirectory: string, platform: NodeJS.Platform): string =>
  (platform === 'win32' ? win32 : posix).join(runtimeDirectory, 'control.json')

export const readControlDiscovery = (path: string): ControlDiscovery =>
  controlDiscoverySchema.parse(JSON.parse(readFileSync(path, 'utf8')))

export const writeControlDiscovery = (path: string, discovery: ControlDiscovery): void => {
  writeFileSync(path, JSON.stringify(discovery), { encoding: 'utf8', mode: 0o600 })
  if (process.platform !== 'win32') chmodSync(path, 0o600)
}

export const removeControlDiscovery = (path: string): void => rmSync(path, { force: true })
