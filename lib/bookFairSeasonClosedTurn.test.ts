import { describe, it, expect } from 'vitest'
import { seasonClosedTurn, initialState, MESSAGE_FALLBACKS } from './bookFairYemotIvr'

// 28.10: היריד סגור לעונה ⇒ הודעת תודה וניתוק, בלי אפשרות להשאיר פנייה.

describe('סגור לעונה — הודעת תודה', () => {
  it('משמיעה את ההודעה ומנתקת, בלי הקשה', () => {
    const t = seasonClosedTurn(initialState())
    expect(t.state.step).toBe('done')
    expect(t.response).toContain(MESSAGE_FALLBACKS.season_notice)
    expect(t.response).toContain('go_to_folder=hangup')
    expect(t.response).not.toMatch(/^read=/)
  })

  it('הקשה על 1 אינה פותחת הקלטה', () => {
    const menu = { ...initialState(), step: 'season_menu' as const }
    const t = seasonClosedTurn(menu, { value: '1' })
    expect(t.state.step).toBe('done')
    expect(t.response).not.toContain('record')
  })
})
