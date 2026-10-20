import { describe, it, expect } from 'vitest'
import { pickVoiceRecipients, voiceMarkerCovers } from './voiceBroadcast'

describe('pickVoiceRecipients', () => {
  it('מסיר כפילויות, ריקים, לא תקינים וסטטוסים שבוטלו', () => {
    const r = pickVoiceRecipients([
      { customer_phone: '052-7101315', status: 'paid' },
      { customer_phone: '0527101315', status: 'shipped' },
      { customer_phone: '0501234567', status: 'cancelled' },
      { customer_phone: '', status: 'paid' },
      { customer_phone: '123', status: 'paid' },
      { customer_phone: null, status: 'paid' },
    ])
    expect(r).toEqual(['0527101315'])
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
