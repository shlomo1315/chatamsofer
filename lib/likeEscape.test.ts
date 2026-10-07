import { describe, it, expect } from 'vitest'
import { escapeLike } from './likeEscape'

describe('escapeLike', () => {
  it('כתובת רגילה לא משתנה', () => {
    expect(escapeLike('office@chasamsofer.info')).toBe('office@chasamsofer.info')
  })

  // 🔴 הבאג: `_` התאים לכל תו, `%` לכל רצף
  it('מנטרל תווים כלליים', () => {
    expect(escapeLike('a_b@x.com')).toBe('a\\_b@x.com')
    expect(escapeLike('%@x.com')).toBe('\\%@x.com')
  })

  it('מנטרל גם את תו המילוט עצמו', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b')
  })
})
