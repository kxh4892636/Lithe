import { createHash } from 'node:crypto'
import { posix } from 'node:path'

interface LocalEndpointOptions {
  platform: NodeJS.Platform
  runtimeDirectory: string
  userIdentity: string
}

export const resolveLocalControlEndpoint = ({
  platform,
  runtimeDirectory,
  userIdentity,
}: LocalEndpointOptions): string => {
  if (platform === 'win32') {
    const identityHash = createHash('sha256')
      .update(`${userIdentity}\0${runtimeDirectory.toLowerCase()}`)
      .digest('hex')
      .slice(0, 20)
    return `\\\\.\\pipe\\lithe-${identityHash}`
  }
  return posix.join(runtimeDirectory, 'control.sock')
}
