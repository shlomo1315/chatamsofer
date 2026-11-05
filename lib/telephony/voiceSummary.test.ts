import { describe, it, expect } from 'vitest'
import { describeVoiceSync } from './voiceSummary'

describe('describeVoiceSync', () => {
  it('הצלחה: כמה נוצרו', () => {
    expect(describeVoiceSync(true, { ok: true, total: 20, created: 5, failed: 0 })).toEqual({ ok: true, text: 'נוצרו 5 הקלטות חדשות (מתוך 20 הודעות).' })
  })
  it('הכול מעודכן', () => {
    expect(describeVoiceSync(true, { ok: true, total: 20, created: 0, failed: 0 }).text).toContain('הכול מעודכן')
  })
  it('כשל מכסה: נוצרו חלק, נכשלו חלק, שגיאה בעברית', () => {
    const r = describeVoiceSync(true, { ok: false, total: 20, created: 3, failed: 17, error: 'מכסת ElevenLabs נגמרה' })
    expect(r.ok).toBe(false)
    expect(r.text).toContain('נוצרו 3'); expect(r.text).toContain('17 נכשלו'); expect(r.text).toContain('מכסת ElevenLabs נגמרה')
  })
  it('403 בלי גוף', () => {
    expect(describeVoiceSync(false, {})).toEqual({ ok: false, text: 'היצירה נכשלה. נסו שוב.' })
  })
  it('403 עם הודעת שגיאה', () => {
    expect(describeVoiceSync(false, { error: 'אין הרשאה' }).text).toContain('אין הרשאה')
  })
})
