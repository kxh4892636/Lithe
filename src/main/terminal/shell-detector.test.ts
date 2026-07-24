import { describe, expect, it } from 'vitest'

import { detectShells } from './shell-detector'

describe('shell detection', (): void => {
  it('uses the Windows priority order', async (): Promise<void> => {
    const shells = await detectShells({
      environment: {},
      exists: async (command: string): Promise<boolean> => ['pwsh.exe', 'cmd.exe'].includes(command),
      platform: 'win32',
    })

    expect(shells).toEqual(['pwsh.exe', 'cmd.exe'])
  })

  it('uses the login shell on Unix platforms', async (): Promise<void> => {
    const shells = await detectShells({
      environment: { SHELL: '/bin/zsh' },
      exists: async (): Promise<boolean> => true,
      platform: 'darwin',
    })

    expect(shells).toEqual(['/bin/zsh'])
  })

  it('does not invent a fallback shell and propagates detector failures', async (): Promise<void> => {
    await expect(
      detectShells({
        environment: {},
        exists: async (): Promise<boolean> => {
          throw new Error('detector unavailable')
        },
        platform: 'linux',
      }),
    ).rejects.toThrow('detector unavailable')

    await expect(
      detectShells({
        environment: {},
        exists: async (): Promise<boolean> => false,
        platform: 'win32',
      }),
    ).resolves.toEqual([])
  })
})
