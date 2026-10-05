import { describe, it, expect } from 'vitest'
import { safeError } from './safeError'

describe('🔴 safeError', () => {
  it('שגיאת gaxios — הטוקן לא מופיע בפלט', () => {
    const err = Object.assign(new Error('invalid_grant'), {
      code: 400,
      config: { data: new URLSearchParams({ refresh_token: '1//SECRET-REFRESH', client_id: 'x' }) },
      response: { status: 400, data: { error: 'invalid_grant' } },
    })
    const out = safeError(err)
    expect(out).toContain('invalid_grant')
    expect(out).toContain('status=400')
    expect(out).not.toContain('SECRET-REFRESH')
  })
  it('ערכים פשוטים', () => {
    expect(safeError('boom')).toBe('boom')
    expect(safeError(null)).toBe('null')
    expect(safeError({})).toBe('[שגיאה ללא הודעה]')
  })
})
