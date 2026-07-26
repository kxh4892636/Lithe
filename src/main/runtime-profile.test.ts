import { win32 } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveRuntimeProfile } from './runtime-profile'

describe('runtime profile', (): void => {
  it('keeps the installed profile on the existing production paths', (): void => {
    const profile = resolveRuntimeProfile({
      appDataDirectory: 'C:\\Users\\kxh\\AppData\\Roaming',
      homeDirectory: 'C:\\Users\\kxh',
      isDevelopment: false,
      platform: 'win32',
    })

    expect(profile).toEqual({
      appUserModelId: 'com.kxh.lithe',
      displayName: 'Lithe',
      isDevelopment: false,
      runtimeDirectory: win32.join('C:\\Users\\kxh', '.lithe'),
    })
  })

  it('separates development identity, user data, and managed runtime files', (): void => {
    const profile = resolveRuntimeProfile({
      appDataDirectory: 'C:\\Users\\kxh\\AppData\\Roaming',
      homeDirectory: 'C:\\Users\\kxh',
      isDevelopment: true,
      platform: 'win32',
    })

    expect(profile).toEqual({
      appUserModelId: 'com.kxh.lithe.development',
      displayName: 'Lithe Development',
      isDevelopment: true,
      runtimeDirectory: win32.join('C:\\Users\\kxh', '.lithe-development'),
      userDataDirectory: win32.join('C:\\Users\\kxh\\AppData\\Roaming', 'Lithe Development'),
    })
  })

  it('keeps explicit test data and runtime roots isolated', (): void => {
    const profile = resolveRuntimeProfile({
      appDataDirectory: 'C:\\Users\\kxh\\AppData\\Roaming',
      homeDirectory: 'C:\\Users\\kxh',
      isDevelopment: true,
      platform: 'win32',
      runtimeDirectory: 'D:\\temp\\lithe-runtime',
      userDataDirectory: 'D:\\temp\\lithe-user-data',
    })

    expect(profile.runtimeDirectory).toBe('D:\\temp\\lithe-runtime')
    expect(profile.userDataDirectory).toBe('D:\\temp\\lithe-user-data')
  })
})
