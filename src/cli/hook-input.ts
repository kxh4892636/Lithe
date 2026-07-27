const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const parseSessionStartHookInput = (serialized: string): string => {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new TypeError('Hook input must be valid JSON')
  }
  if (!isRecord(value) || value.hook_event_name !== 'SessionStart') {
    throw new TypeError('Hook input must be a SessionStart event')
  }
  if (typeof value.session_id !== 'string' || !value.session_id.trim()) {
    throw new TypeError('Hook input requires session_id')
  }
  return value.session_id
}
