import { execFile } from 'node:child_process'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import which from 'which'

import { builtinAdapterVersions } from './builtin-adapters'
import { inspectAdapterAvailability } from './command-availability'

vi.mock('node:child_process')
vi.mock('which')

describe('Adapter availability', (): void => {
  beforeEach((): void => {
    vi.mocked(which).mockResolvedValue('C:\\tools\\kimi.exe')
    vi.mocked(execFile).mockImplementation(((
      ...arguments_: Parameters<typeof execFile>
    ): ReturnType<typeof execFile> => {
      const callback = arguments_.at(-1)
      if (typeof callback === 'function') {
        callback(null, 'Options:\n  -S, --session [id]\n', '')
      }
      return undefined as unknown as ReturnType<typeof execFile>
    }) as typeof execFile)
  })

  it('accepts Kimi from its own session contract without a Claude auth probe', async (): Promise<void> => {
    const kimi = builtinAdapterVersions.find((adapter): boolean => adapter.adapterId === 'builtin-kimi-code')
    if (!kimi) throw new Error('Kimi adapter is missing')

    await expect(inspectAdapterAvailability(kimi)).resolves.toEqual({
      forkAvailable: true,
      isAvailable: true,
      reason: null,
      resumeAvailable: true,
    })
    expect(execFile).toHaveBeenCalledOnce()
    expect(execFile).toHaveBeenCalledWith('C:\\tools\\kimi.exe', ['--help'], expect.any(Object), expect.any(Function))
  })

  it('disables Kimi resume and Fork when the installed CLI lacks --session', async (): Promise<void> => {
    vi.mocked(execFile).mockImplementation(((
      ...arguments_: Parameters<typeof execFile>
    ): ReturnType<typeof execFile> => {
      const callback = arguments_.at(-1)
      if (typeof callback === 'function') callback(null, 'Options:\n  --continue\n', '')
      return undefined as unknown as ReturnType<typeof execFile>
    }) as typeof execFile)
    const kimi = builtinAdapterVersions.find((adapter): boolean => adapter.adapterId === 'builtin-kimi-code')
    if (!kimi) throw new Error('Kimi adapter is missing')

    await expect(inspectAdapterAvailability(kimi)).resolves.toMatchObject({
      forkAvailable: false,
      resumeAvailable: false,
    })
  })
})
