import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// טוקן פורטל ההלוואות — חייב להיפסל כשמחליפים סיסמה.
//
// הפורטל עובד עם סיסמה משותפת אחת. כשמחליפים אותה כדי לחסום מישהו,
// הטוקן שכבר בידיו חייב להפסיק לעבוד — אחרת ההחלפה חסרת משמעות והוא
// נשאר בפנים עד 14 יום.
// ─────────────────────────────────────────────────────────────────────────────

let storedHash = 'hash-ראשון'

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { value: storedHash } }) }),
      }),
    }),
  }),
}))

const load = async () => import('./loansPortalAuth')

describe('טוקן פורטל ההלוואות', () => {
  beforeEach(() => {
    process.env.LOANS_PORTAL_SECRET = 'סוד-לבדיקה'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
    storedHash = 'hash-ראשון'
  })

  it('טוקן תקין מתקבל', async () => {
    const { issuePortalToken, verifyPortalToken } = await load()
    const token = await issuePortalToken()
    expect(await verifyPortalToken(token)).toBe(true)
  })

  it('החלפת סיסמה פוסלת טוקן קיים', async () => {
    const { issuePortalToken, verifyPortalToken } = await load()
    const token = await issuePortalToken()
    expect(await verifyPortalToken(token)).toBe(true)

    storedHash = 'hash-אחרי-החלפה'   // כמו setPortalPassword
    expect(await verifyPortalToken(token), 'טוקן ישן שרד החלפת סיסמה!').toBe(false)
  })

  it('טוקן מזויף נדחה', async () => {
    const { verifyPortalToken } = await load()
    const day = Math.floor(Date.now() / 86_400_000)
    expect(await verifyPortalToken(`${day}.${'0'.repeat(64)}`)).toBe(false)
  })

  it('טוקן ריק/משובש נדחה', async () => {
    const { verifyPortalToken } = await load()
    expect(await verifyPortalToken(undefined)).toBe(false)
    expect(await verifyPortalToken('בלי-נקודה')).toBe(false)
    expect(await verifyPortalToken('abc.def')).toBe(false)
  })
})
