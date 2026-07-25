import { describe, expect, it } from 'vitest'

import { parseToolResponse } from './tool-protocol'

describe('tool protocol', (): void => {
  it('recursively rejects non-JSON response payloads', (): void => {
    expect(() =>
      parseToolResponse({
        id: 'request-1',
        ok: true,
        data: { nested: { executable: (): void => undefined } },
      }),
    ).toThrow(/invalid/i)
  })
})
