import { describe, it, expect } from 'vitest'
import { kvitelPhoneTurn, recordingRef, KV_CONFIRM, KV_REC } from './kvitelPhone'
import type { KvitelLineInput } from './kvitel'

const saved: KvitelLineInput[] = [{ name: 'מאיר', relation: 'ben', parentName: 'פעשא לאה', requestType: 'refua' }]

describe('kvitelPhone', () => {
  it('מתקשר חוזר שומע את השמות השמורים, בלי מקף ונקודה בתוך ההקראה', () => {
    const r = kvitelPhoneTurn({}, saved)
    expect(r.action).toBeNull()
    expect(r.reply).toMatch(/^read=/)
    expect(r.reply).toContain('t-מאיר בן פעשא לאה לרפואה שלימה')
    expect(r.reply).toContain(`=${KV_CONFIRM},`)
    expect(r.reply.split('=').pop()!.split(',')).toHaveLength(14)
  })

  it('בלי שמות שמורים: ישר להקלטה', () => {
    const r = kvitelPhoneTurn({}, [])
    expect(r.reply).toContain(`=${KV_REC},,record,`)
    expect(r.action).toBeNull()
  })

  it('1 שולח את השמות השמורים, 2 עובר להקלטה', () => {
    expect(kvitelPhoneTurn({ [KV_CONFIRM]: '1' }, saved).action).toEqual({ kind: 'saved' })
    const two = kvitelPhoneTurn({ [KV_CONFIRM]: '2' }, saved)
    expect(two.reply).toContain(`=${KV_REC},,record,`)
    expect(two.reply).not.toContain('שלום')
    // אישור בלי שמות שמורים לא שולח כלום
    expect(kvitelPhoneTurn({ [KV_CONFIRM]: '1' }, []).action).toBeNull()
  })

  it('אחרי הקלטה: שמירה עם התמלול וניתוק; הקשות במקום הקלטה לא נשמרות', () => {
    const r = kvitelPhoneTurn({ [KV_CONFIRM]: '2', [KV_REC]: '120/5.wav', [`${KV_REC}_voice`]: 'משה בן שרה לרפואה' }, saved)
    expect(r.action).toEqual({ kind: 'recording', path: '120/5.wav', transcript: 'משה בן שרה לרפואה' })
    expect(r.reply).toContain('go_to_folder=hangup')
    expect(kvitelPhoneTurn({ [KV_REC]: 'Digits-1' }, []).action).toBeNull()
  })

  it('recordingRef', () => {
    expect(recordingRef('050-1234567', '1791146153')).toBe('yemot:0501234567:1791146153')
  })
})
