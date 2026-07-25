import { createHash } from 'node:crypto'
import { posix } from 'node:path'

interface LocalEndpointOptions {
  homeDirectory: string
  platform: NodeJS.Platform
  userIdentity: string
}

export const resolveLocalControlEndpoint = ({
  homeDirectory,
  platform,
  userIdentity,
}: LocalEndpointOptions): string => {
  if (platform === 'win32') {
    const identityHash = createHash('sha256')
      .update(`${userIdentity}\0${homeDirectory.toLowerCase()}`)
      .digest('hex')
      .slice(0, 20)
    return `\\\\.\\pipe\\lithe-${identityHash}`
  }
  return posix.join(homeDirectory, '.lithe', 'control.sock')
}
