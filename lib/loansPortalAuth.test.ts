import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// טוקן פורטל ההלוואות.
//
// 🔴 הפגם שנסגר: הטוקן היה `<יום>.<hmac>` מיום + טביעת-סיסמה בלבד — שני
// ערכים שזהים לכל המשתמשים. כלומר **כל מי שנכנס באותו יום קיבל בדיוק
// אותה מחרוזת**: העתקת עוגייה נתנה גישה מלאה בלי סיסמה, ולא הייתה דרך
// לנתק אדם אחד בלי להחליף סיסמה לכולם.
//
// הפורטל עובד עם סיסמה משותפת אחת, ולכן ההחלפה חייבת להמשיך לפסול
// טוקנים קיימים — זו תכונה נכונה שאסור שתאבד בשינוי.
// ─────────────────────────────────────────────────────────────────────────────

let storedHash = 'hash-ראשון'
/** token_hash → השורה שנשמרה, כמו portal_sessions */
let sessions: Record<string, { revoked_at: string | null; expires_at: string }> = {}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'portal_sessions') {
        // ⚠️ בונה-שאילתה משורשר: הקוד קורא .eq() פעמיים ואז .maybeSingle(),
        // ובמסלול העדכון גם .eq().eq() ואז await. אובייקט אחד שמחזיר את
        // עצמו מכל שלב, וצובר את ה-hash שנמסר, מכסה את שני המסלולים.
        const make = (patch?: { revoked_at?: string }) => {
          let hash = ''
          const self: Record<string, unknown> = {
            eq: (col: string, val: string) => {
              if (col === 'token_hash') {
                hash = val
                if (patch?.revoked_at && sessions[hash]) sessions[hash].revoked_at = patch.revoked_at
              }
              return self
            },
            maybeSingle: async () => ({
              data: sessions[hash] ? { id: hash, ...sessions[hash] } : null,
              error: null,
            }),
            // מאפשר await ישיר על שרשרת העדכון
            then: (r: (v: { error: null }) => unknown) => Promise.resolve(r({ error: null })),
          }
          return self
        }
        return {
          insert: async (row: { token_hash: string; expires_at: string }) => {
            sessions[row.token_hash] = { revoked_at: null, expires_at: row.expires_at }
            return { error: null }
          },
          select: () => make(),
          update: (patch: { revoked_at?: string }) => make(patch),
        }
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { value: storedHash } }) }) }),
      }
    },
  }),
}))

const load = async () => import('./loansPortalAuth')

describe('טוקן פורטל ההלוואות', () => {
  beforeEach(() => {
    process.env.LOANS_PORTAL_SECRET = 'סוד-לבדיקה'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
    storedHash = 'hash-ראשון'
    sessions = {}
  })

  it('טוקן תקין מתקבל', async () => {
    const { issuePortalToken, verifyPortalToken } = await load()
    const token = await issuePortalToken()
    expect(await verifyPortalToken(token)).toBe(true)
  })

  // 🔴 הבדיקה המרכזית — הפגם עצמו.
  it('שתי כניסות מייצרות טוקנים שונים', async () => {
    const { issuePortalToken } = await load()
    const a = await issuePortalToken()
    const b = await issuePortalToken()
    expect(a, 'שני משתמשים קיבלו את אותו טוקן — העתקת עוגייה תעבוד').not.toBe(b)
  })

  it('שני הטוקנים תקפים במקביל', async () => {
    const { issuePortalToken, verifyPortalToken } = await load()
    const a = await issuePortalToken()
    const b = await issuePortalToken()
    expect(await verifyPortalToken(a)).toBe(true)
    expect(await verifyPortalToken(b)).toBe(true)
  })

  // 🔴 היכולת שלא הייתה קיימת כלל.
  it('ניתוק סשן אחד אינו פוגע באחר', async () => {
    const { issuePortalToken, verifyPortalToken, revokePortalToken } = await load()
    const a = await issuePortalToken()
    const b = await issuePortalToken()

    await revokePortalToken(a)
    expect(await verifyPortalToken(a), 'הסשן שנותק עדיין תקף').toBe(false)
    expect(await verifyPortalToken(b), 'סשן אחר נפגע מהניתוק').toBe(true)
  })

  it('החלפת סיסמה פוסלת טוקן קיים', async () => {
    const { issuePortalToken, verifyPortalToken } = await load()
    const token = await issuePortalToken()
    expect(await verifyPortalToken(token)).toBe(true)

    storedHash = 'hash-אחרי-החלפה'   // כמו setPortalPassword
    expect(await verifyPortalToken(token), 'טוקן ישן שרד החלפת סיסמה!').toBe(false)
  })

  it('טוקן חתום שאין לו סשן במסד נדחה', async () => {
    // ⚠️ החתימה לבדה אינה מספיקה: סשן שנמחק/פג חייב להיפסל גם כשהחתימה
    // עדיין מתאימה.
    const { issuePortalToken, verifyPortalToken } = await load()
    const token = await issuePortalToken()
    sessions = {}
    expect(await verifyPortalToken(token)).toBe(false)
  })

  it('סשן שפג נדחה', async () => {
    const { issuePortalToken, verifyPortalToken } = await load()
    const token = await issuePortalToken()
    for (const k of Object.keys(sessions)) {
      sessions[k].expires_at = new Date(Date.now() - 1000).toISOString()
    }
    expect(await verifyPortalToken(token)).toBe(false)
  })

  it('טוקן מזויף נדחה', async () => {
    const { verifyPortalToken } = await load()
    const day = Math.floor(Date.now() / 86_400_000)
    expect(await verifyPortalToken(`${day}.${'0'.repeat(64)}`)).toBe(false)
    expect(await verifyPortalToken(`${'a'.repeat(64)}.${'0'.repeat(64)}`)).toBe(false)
  })

  it('טוקן ריק/משובש נדחה', async () => {
    const { verifyPortalToken } = await load()
    expect(await verifyPortalToken(undefined)).toBe(false)
    expect(await verifyPortalToken('בלי-נקודה')).toBe(false)
    expect(await verifyPortalToken('abc.def')).toBe(false)
  })
})

// ⚠️ תאימות לאחור: הפריסה אינה מנתקת את מי שמחובר כרגע.
describe('טוקן בפורמט הישן', () => {
  beforeEach(() => {
    process.env.LOANS_PORTAL_SECRET = 'סוד-לבדיקה'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
    storedHash = 'hash-ראשון'
    sessions = {}
  })

  const legacyToken = async (dayOffset = 0) => {
    const { createHmac } = await import('crypto')
    const day = Math.floor(Date.now() / 86_400_000) + dayOffset
    const fp = createHmac('sha256', 'סוד-לבדיקה').update(`pw:${storedHash}`).digest('hex').slice(0, 16)
    const sig = createHmac('sha256', 'סוד-לבדיקה').update(`loans_portal:${day}:${fp}`).digest('hex')
    return `${day}.${sig}`
  }

  it('טוקן ישן תקף עדיין מתקבל', async () => {
    const { verifyPortalToken } = await load()
    expect(await verifyPortalToken(await legacyToken())).toBe(true)
  })

  it('טוקן ישן שפג נדחה', async () => {
    const { verifyPortalToken } = await load()
    expect(await verifyPortalToken(await legacyToken(-20))).toBe(false)
  })

  it('החלפת סיסמה פוסלת גם טוקן ישן', async () => {
    const { verifyPortalToken } = await load()
    const token = await legacyToken()
    storedHash = 'hash-אחרי-החלפה'
    expect(await verifyPortalToken(token)).toBe(false)
  })
})
