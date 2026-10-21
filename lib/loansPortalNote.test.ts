import { describe, it, expect } from 'vitest'
import { normalizePortalNote, PORTAL_NOTE_MAX } from './loansPortalNote'

describe('normalizePortalNote', () => {
  it('חותך רווחים', () => {
    expect(normalizePortalNote('  יש לו הלוואה ')).toEqual({ ok: true, value: 'יש לו הלוואה' })
  })
  it('ריק או null הופך ל-null', () => {
    expect(normalizePortalNote('   ')).toEqual({ ok: true, value: null })
    expect(normalizePortalNote(null)).toEqual({ ok: true, value: null })
  })
  it('דוחה לא-טקסט וטקסט ארוך מדי', () => {
    expect(normalizePortalNote(5).ok).toBe(false)
    expect(normalizePortalNote('א'.repeat(PORTAL_NOTE_MAX + 1)).ok).toBe(false)
    expect(normalizePortalNote('א'.repeat(PORTAL_NOTE_MAX)).ok).toBe(true)
  })
})
