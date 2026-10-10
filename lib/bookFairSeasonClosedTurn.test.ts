import { describe, it, expect } from 'vitest'
import { seasonClosedTurn, nextTurn, initialState, MESSAGE_FALLBACKS } from './bookFairYemotIvr'

// 10.10: היריד סגור לעונה ⇒ הודעה + "למקרים דחופים הקישו 1" ⇒ הקלטת פנייה.

describe('סגור לעונה — הודעה דחופה', () => {
  it('שיחה חדשה: הודעת הסגירה ואז האפשרות להקיש 1', () => {
    const t = seasonClosedTurn(initialState())
    expect(t.state.step).toBe('season_menu')
    expect(t.response).toMatch(/^read=/)
    expect(t.response).toContain('=bf_sc,')
    expect(t.response.indexOf(MESSAGE_FALLBACKS.season_closed))
      .toBeLessThan(t.response.indexOf(MESSAGE_FALLBACKS.season_urgent))
  })

  it('הקשה על 1 ⇒ הקלטה, באותו שלב כמו שלוחה 3', () => {
    const menu = seasonClosedTurn(initialState()).state
    const t = seasonClosedTurn(menu, { value: '1' })
    expect(t.state.step).toBe('record_inquiry')
    expect(t.response).toContain('=bf_inq,,record,120')
    expect(t.response).toContain(MESSAGE_FALLBACKS.season_inquiry_intro)
  })

  it('אחרי ההקלטה — השמירה עוברת דרך nextTurn כמו פנייה רגילה', () => {
    const rec = seasonClosedTurn(seasonClosedTurn(initialState()).state, { value: '1' }).state
    const t = nextTurn(rec, { recording: '9/001.wav', inquirySaved: true })
    expect(t.state.step).toBe('done')
    expect(t.response).toContain(MESSAGE_FALLBACKS.inquiry_saved)
  })

  it('כל הקשה אחרת ⇒ ניתוק', () => {
    const menu = seasonClosedTurn(initialState()).state
    const t = seasonClosedTurn(menu, { value: '5' })
    expect(t.state.step).toBe('done')
    expect(t.response).toContain('go_to_folder=hangup')
  })
})
