import { describe, expect, it, vi } from 'vitest'

import { isExistingDirectory } from './directory-validity'

describe('directory validity', (): void => {
  it('treats a missing path as invalid without reporting it', (): void => {
    const reportError = vi.fn<(message: string, error: unknown) => void>()
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })

    expect(
      isExistingDirectory('D:\\missing', reportError, (): never => {
        throw missing
      }),
    ).toBe(false)
    expect(reportError).not.toHaveBeenCalled()
  })

  it('reports an unexpected file-system failure before marking the path invalid', (): void => {
    const reportError = vi.fn<(message: string, error: unknown) => void>()
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' })

    expect(
      isExistingDirectory('D:\\protected', reportError, (): never => {
        throw denied
      }),
    ).toBe(false)
    expect(reportError).toHaveBeenCalledWith('无法检查目录：D:\\protected', denied)
  })
})
