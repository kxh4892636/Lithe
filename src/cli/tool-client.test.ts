import { describe, expect, it } from 'vitest'

import { requestContext, responseToStdout } from './tool-client'

describe('lithe-tool client', (): void => {
  it('returns a stable not-running failure without starting Lithe', async (): Promise<void> => {
    const response = await requestContext({
      authorization: { kind: 'external', token: 'e'.repeat(32) },
      endpoint: process.platform === 'win32' ? '\\\\.\\pipe\\lithe-missing-test' : '/tmp/lithe-missing-test.sock',
      timeoutMilliseconds: 100,
    })

    expect(response).toEqual({
      id: null,
      ok: false,
      error: { code: 'LITHE_NOT_RUNNING', message: 'Lithe is not running' },
    })
    expect(responseToStdout(response).trim().split('\n')).toHaveLength(1)
  })
})
