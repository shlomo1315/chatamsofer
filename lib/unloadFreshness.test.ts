import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 שומר-הסף על הפריקה: UNLOAD_EXPIRED_DISABLED הודלק ב-Railway ונשאר דלוק
// שבועיים בלי שאיש שם לב — 9 יולדות נשארו עם ₪600 נעולים בכרטיס. הבדיקה
// היחידה שהייתה קיימת (UnloadsPanel) היא תצוגה פסיבית שאיש לא הביט בה.
//
// checkUnloadFreshness אמורה להתריע במייל כשעבר יותר מיום בלי ריצה מוצלחת,
// ולא להציף כשכבר התרענו היום. ⚠️ קריטי: היא חייבת לרוץ מחוץ לתנאי
// UNLOAD_EXPIRED_DISABLED (instrumentation.ts) — טסט זה בודק רק את הלוגיקה
// עצמה, לא את החיווט; ראו את ההערה שם.
// ─────────────────────────────────────────────────────────────────────────────

let settings: Record<string, string> = {}
let sent: { to: string; subject: string }[] = []
let aidsDueCount = 0

vi.mock('./sendMail', () => ({
  deliverMail: async (to: string, subject: string) => {
    sent.push({ to, subject })
    return { ok: true }
  },
}))

function makeDb() {
  return {
    from: (table: string) => {
      if (table === 'maternity_aids') {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          not: () => q,
          lte: async () => ({ count: aidsDueCount, error: null }),
        }
        return q
      }
      // app_settings
      let key = ''
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (_c: string, v: string) => { key = v; return q },
        maybeSingle: async () => ({ data: settings[key] ? { value: settings[key] } : null }),
        upsert: async (row: { key: string; value: string }) => {
          settings[row.key] = row.value
          return { error: null }
        },
      }
      return q
    },
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => makeDb(),
}))

const load = async () => import('./unloadExpired')

const dayKey = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

describe('checkUnloadFreshness', () => {
  beforeEach(() => {
    settings = {}
    sent = []
    aidsDueCount = 0
    vi.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  it('🔴 התרחיש בפועל: לא רצה שבועיים — מתריע', async () => {
    const twoWeeksAgo = dayKey(new Date(Date.now() - 14 * 86400000))
    settings['unload_expired_last_run'] = twoWeeksAgo
    aidsDueCount = 9

    const { checkUnloadFreshness } = await load()
    await checkUnloadFreshness()

    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toContain('לא רצה')
  })

  it('רץ אתמול בלילה — לא מתריע', async () => {
    const yesterday = dayKey(new Date(Date.now() - 86400000))
    settings['unload_expired_last_run'] = yesterday

    const { checkUnloadFreshness } = await load()
    await checkUnloadFreshness()

    expect(sent).toHaveLength(0)
  })

  it('רץ היום — לא מתריע', async () => {
    settings['unload_expired_last_run'] = dayKey(new Date())

    const { checkUnloadFreshness } = await load()
    await checkUnloadFreshness()

    expect(sent).toHaveLength(0)
  })

  it('⚠️ כבר התרענו היום — לא כופל את המייל', async () => {
    settings['unload_expired_last_run'] = dayKey(new Date(Date.now() - 14 * 86400000))
    settings['unload_expired_alert_date'] = dayKey(new Date()) // ההתראה כבר יצאה היום

    const { checkUnloadFreshness } = await load()
    await checkUnloadFreshness()

    expect(sent).toHaveLength(0)
  })

  it('אין רישום ריצה כלל — מתריע', async () => {
    const { checkUnloadFreshness } = await load()
    await checkUnloadFreshness()

    expect(sent).toHaveLength(1)
  })
})
