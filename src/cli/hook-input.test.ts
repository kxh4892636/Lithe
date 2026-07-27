import { describe, expect, it } from 'vitest'

import { parseSessionStartHookInput } from './hook-input'

describe('SessionStart hook input', (): void => {
  it('accepts only a non-empty session id from SessionStart JSON', (): void => {
    expect(
      parseSessionStartHookInput(
        JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'provider-session-1', cwd: 'D:\\project' }),
      ),
    ).toBe('provider-session-1')
    expect(() => parseSessionStartHookInput(JSON.stringify({ hook_event_name: 'Stop', session_id: 'one' }))).toThrow(
      'SessionStart',
    )
    expect(() =>
      parseSessionStartHookInput(JSON.stringify({ hook_event_name: 'SessionStart', session_id: '' })),
    ).toThrow('session_id')
  })
})
