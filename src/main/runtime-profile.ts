import { posix, win32 } from 'node:path'

export interface RuntimeProfile {
  appUserModelId: string
  displayName: string
  isDevelopment: boolean
  runtimeDirectory: string
  userDataDirectory?: string
}

interface RuntimeProfileOptions {
  appDataDirectory: string
  homeDirectory: string
  isDevelopment: boolean
  platform: NodeJS.Platform
  runtimeDirectory?: string
  userDataDirectory?: string
}

export const resolveRuntimeProfile = (options: RuntimeProfileOptions): RuntimeProfile => {
  const path = options.platform === 'win32' ? win32 : posix
  const userDataDirectory =
    options.userDataDirectory ??
    (options.isDevelopment ? path.join(options.appDataDirectory, 'Lithe Development') : undefined)
  const runtimeDirectory =
    options.runtimeDirectory ??
    (options.userDataDirectory
      ? path.join(options.userDataDirectory, 'runtime')
      : path.join(options.homeDirectory, options.isDevelopment ? '.lithe-development' : '.lithe'))

  return {
    appUserModelId: options.isDevelopment ? 'com.kxh.lithe.development' : 'com.kxh.lithe',
    displayName: options.isDevelopment ? 'Lithe Development' : 'Lithe',
    isDevelopment: options.isDevelopment,
    runtimeDirectory,
    ...(userDataDirectory ? { userDataDirectory } : {}),
  }
}
