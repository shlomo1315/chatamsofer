import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 שומר-הסף השבועי על דגלי *_DISABLED: מתריע כשדגל כזה דלוק, כדי שאף
// דגל לא יישכח פתוח שבועות בלי שאיש ישים לב (בדיוק מה שקרה עם
// UNLOAD_EXPIRED_DISABLED). מתריע פעם בשבוע בלבד — לא בכל שעה.
// ─────────────────────────────────────────────────────────────────────────────

let settings: Record<string, string> = {}
let sent: { to: string; subject: string }[] = []

vi.mock('./sendMail', () => ({
  deliverMail: async (to: string, subject: string) => {
    sent.push({ to, subject })
    return { ok: true }
  },
}))

function makeDb() {
  let key = ''
  const q: Record<string, unknown> = {
    from: () => q,
    select: () => q,
    eq: (_c: string, v: string) => { key = v; return q },
    maybeSingle: async () => ({ data: settings[key] ? { value: settings[key] } : null }),
    upsert: async (row: { key: string; value: string }) => {
      settings[row.key] = row.value
      return { error: null }
    },
  }
  return q
}

vi.mock('./apiAuth', () => ({
  getServiceClient: () => makeDb(),
}))

const load = async () => import('./schedulerFlagsWatch')

const ENV_KEYS = [
  'UNLOAD_EXPIRED_DISABLED', 'LIVE_BALANCES_DISABLED', 'GOV_SYNC_DISABLED',
  'LOANS_REPORT_DISABLED', 'SCHEDULED_MAIL_DISABLED', 'MATERNITY_CARD_RETRY_DISABLED',
  'LEGACY_SYNC_DISABLED', 'GMAIL_WATCH_RENEW_DISABLED', 'DAILY_BACKUP_DISABLED',
  'NEWSLETTER_DISABLED', 'BOOK_FAIR_AUTO_OPEN_DISABLED', 'BOOK_FAIR_CLEANUP_DISABLED',
  'VOICE_REBUILD_DISABLED',
]

describe('checkSchedulerFlags', () => {
  beforeEach(() => {
    settings = {}
    sent = []
    vi.resetModules()
    for (const k of ENV_KEYS) delete process.env[k]
  })

  it('אין דגלים דלוקים — לא מתריע', async () => {
    const { checkSchedulerFlags } = await load()
    await checkSchedulerFlags()
    expect(sent).toHaveLength(0)
  })

  it('🔴 התרחיש בפועל: UNLOAD_EXPIRED_DISABLED דלוק — מתריע ומזכיר אותו', async () => {
    process.env.UNLOAD_EXPIRED_DISABLED = '1'
    const { checkSchedulerFlags } = await load()
    await checkSchedulerFlags()

    expect(sent).toHaveLength(1)
  })

  it('⚠️ כבר התרענו השבוע — לא כופל את המייל', async () => {
    process.env.UNLOAD_EXPIRED_DISABLED = '1'
    settings['scheduler_flags_alert_at'] = new Date().toISOString() // עכשיו ממש

    const { checkSchedulerFlags } = await load()
    await checkSchedulerFlags()

    expect(sent).toHaveLength(0)
  })

  it('התראה קודמת לפני יותר משבוע — מתריע שוב', async () => {
    process.env.UNLOAD_EXPIRED_DISABLED = '1'
    settings['scheduler_flags_alert_at'] = new Date(Date.now() - 8 * 86400000).toISOString()

    const { checkSchedulerFlags } = await load()
    await checkSchedulerFlags()

    expect(sent).toHaveLength(1)
  })

  it('ערך שאינו "1" (למשל "true") אינו נחשב דלוק', async () => {
    // ⚠️ עקבי עם instrumentation.ts: הבדיקה שם היא !== '1' בדיוק, כלומר
    // "true" לא היה מכבה את המתזמן — ולכן גם כאן אסור שיזוהה כדולק.
    process.env.UNLOAD_EXPIRED_DISABLED = 'true'
    const { checkSchedulerFlags } = await load()
    await checkSchedulerFlags()
    expect(sent).toHaveLength(0)
  })
})
