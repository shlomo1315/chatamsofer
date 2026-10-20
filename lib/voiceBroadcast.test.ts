import { describe, it, expect } from 'vitest'
import { pickVoiceRecipientList, voiceMarkerCovers } from './voiceBroadcast'

describe('pickVoiceRecipientList', () => {
  const o = (customer_phone: string | null, status: string, delivery_method: string) => ({ customer_phone, status, delivery_method, customer_name: 'א' })
  it('רק משלוח: איסוף עצמי לא נכנס לרשימה', () => {
    const r = pickVoiceRecipientList([o('0501111111', 'paid', 'pickup'), o('0502222222', 'paid', 'shipping')])
    expect(r.map(x => x.phone)).toEqual(['0502222222'])
  })
  it('מי שהזמין גם איסוף וגם משלוח נשאר פעם אחת, ומי שרק איסוף לא', () => {
    const r = pickVoiceRecipientList([o('0501111111', 'paid', 'pickup'), o('050-111-1111', 'shipped', 'shipping'), o('0501111111', 'paid', 'shipping'), o('0503333333', 'paid', 'pickup')])
    expect(r.map(x => x.phone)).toEqual(['0501111111'])
  })
  it('מסיר ריקים, לא תקינים וסטטוסים שבוטלו', () => {
    const r = pickVoiceRecipientList([o('052-7101315', 'paid', 'shipping'), o('0527101315', 'shipped', 'shipping'), o('0501234567', 'cancelled', 'shipping'), o('', 'paid', 'shipping'), o('123', 'paid', 'shipping'), o(null, 'paid', 'shipping')])
    expect(r.map(x => x.phone)).toEqual(['0527101315'])
  })
})

describe('voiceMarkerCovers', () => {
  const future = new Date(Date.now() + 60000).toISOString()
  const past = new Date(Date.now() - 60000).toISOString()
  it('בדיקה: רק המספר שברשימה', () => {
    const raw = JSON.stringify({ until: future, phones: ['0527101315'] })
    expect(voiceMarkerCovers(raw, '0527101315')).toBe(true)
    expect(voiceMarkerCovers(raw, '0501234567')).toBe(false)
  })
  it('כולם, ופג תוקף', () => {
    expect(voiceMarkerCovers(JSON.stringify({ until: future, phones: 'all' }), '0501234567')).toBe(true)
    expect(voiceMarkerCovers(JSON.stringify({ until: past, phones: 'all' }), '0501234567')).toBe(false)
    expect(voiceMarkerCovers(null, '0501234567')).toBe(false)
    expect(voiceMarkerCovers('xx', '0501234567')).toBe(false)
  })
})
