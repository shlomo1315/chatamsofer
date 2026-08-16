import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מענה כפול על מייל אחד.
//
// הבאג שהתגלה בפרודקשן: פונה ששלח מייל אחד ל-office קיבל את אותו מענה
// פעמיים, בהפרש 19 שניות. הלוג הראה שתי קליטות נפרדות ("נקלטו 3" ואז
// "נקלטו 1") — כלומר Google dual-delivery מסר את אותו מייל בשני עותקים,
// **כל אחד עם message_id משלו**.
//
// הנעילה מפתחה על messageId, ולכן לא זיהתה אותם כאותה הודעה. עכשיו היא
// מפתחת על שולח+תיבה, שנשאר זהה בין העותקים.
// ─────────────────────────────────────────────────────────────────────────────

/** app_settings — מפתחות הנעילה נשמרים כאן. */
let settings: Record<string, string> = {}
/** מיילים שיצאו בפועל. */
let sent: { to: string; subject: string }[] = []
let autoReplyLog: { to_email: string }[] = []

vi.mock('./sendMail', () => ({
  deliverMail: async (to: string, subject: string) => {
    sent.push({ to, subject })
    return { ok: true }
  },
}))

vi.mock('./autoReplyConfig', async (orig) => {
  const real = await orig<typeof import('./autoReplyConfig')>()
  return {
    ...real,
    getAutoReplyConfig: async () => real.defaultAutoReplyMap(),
  }
})

/** לקוח Supabase מדומה — app_settings + auto_reply_log. */
function makeDb() {
  return {
    from: (table: string) => {
      if (table === 'auto_reply_log') {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          gte: async () => ({ count: autoReplyLog.length, error: null }),
          // ⚠️ הקוד קורא .insert(...).then(undefined, onError) — הארגומנט
          // הראשון undefined. מוק שמניח פונקציה זורק TypeError, שנבלע
          // ב-catch של sendAutoReply ומחזיר false בשקט.
          insert: (row: { to_email: string }) => {
            autoReplyLog.push(row)
            return Promise.resolve({ error: null })
          },
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

const load = async () => import('./autoReplySender')

describe('מענה כפול על אותו מייל', () => {
  beforeEach(() => {
    settings = {}
    sent = []
    autoReplyLog = []
    vi.resetModules()
  })

  // 🔴 התרחיש המדויק מהלוג.
  it('שני עותקי dual-delivery — מענה אחד בלבד', async () => {
    const { sendAutoReply } = await load()
    const db = makeDb() as never

    // ⚠️ message_id שונה לכל עותק — זה בדיוק מה ששבר את הנעילה הקודמת.
    const a = await sendAutoReply(db, { fromEmail: 'x@gmail.com', department: 'main', messageId: '<copy-1@mx.google.com>' })
    const b = await sendAutoReply(db, { fromEmail: 'x@gmail.com', department: 'main', messageId: '<copy-2@mx.google.com>' })

    expect(a).toBe(true)
    expect(b, 'העותק השני נענה — הפונה קיבל מענה כפול').toBe(false)
    expect(sent).toHaveLength(1)
  })

  // ⚠️ התיקון הקודם חייב לשרוד: מייל לשני אגפים מקבל מענה משניהם.
  it('שתי תיבות — מענה מכל אחת', async () => {
    const { sendAutoReply } = await load()
    const db = makeDb() as never

    const a = await sendAutoReply(db, { fromEmail: 'x@gmail.com', department: 'main' })
    const b = await sendAutoReply(db, { fromEmail: 'x@gmail.com', department: 'igud' })

    expect(a).toBe(true)
    expect(b, 'התיבה הראשונה חסמה את השנייה').toBe(true)
    expect(sent).toHaveLength(2)
  })

  it('שולחים שונים לאותה תיבה — כל אחד מקבל', async () => {
    const { sendAutoReply } = await load()
    const db = makeDb() as never

    expect(await sendAutoReply(db, { fromEmail: 'a@gmail.com', department: 'main' })).toBe(true)
    expect(await sendAutoReply(db, { fromEmail: 'b@gmail.com', department: 'main' })).toBe(true)
    expect(sent).toHaveLength(2)
  })

  it('הנעילה פגה אחרי 10 דקות', async () => {
    const { sendAutoReply } = await load()
    const db = makeDb() as never

    await sendAutoReply(db, { fromEmail: 'x@gmail.com', department: 'main' })
    // מזייפים נעילה ישנה
    for (const k of Object.keys(settings)) {
      settings[k] = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    }
    expect(await sendAutoReply(db, { fromEmail: 'x@gmail.com', department: 'main' })).toBe(true)
    expect(sent).toHaveLength(2)
  })
})

describe('ההגנות מפני לולאה נשמרות', () => {
  beforeEach(() => { settings = {}; sent = []; autoReplyLog = []; vi.resetModules() })

  it('כתובת אוטומטית אינה מקבלת מענה', async () => {
    const { sendAutoReply } = await load()
    const db = makeDb() as never
    expect(await sendAutoReply(db, { fromEmail: 'mailer-daemon@googlemail.com', department: 'main' })).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('כתובת של הארגון עצמו אינה מקבלת מענה', async () => {
    const { sendAutoReply } = await load()
    const db = makeDb() as never
    expect(await sendAutoReply(db, { fromEmail: 'office@chasamsofer.info', department: 'main' })).toBe(false)
  })

  it('מייל שמצהיר שהוא אוטומטי אינו מקבל מענה', async () => {
    const { sendAutoReply } = await load()
    const db = makeDb() as never
    const headers = [{ name: 'Auto-Submitted', value: 'auto-replied' }]
    expect(await sendAutoReply(db, { fromEmail: 'x@gmail.com', department: 'main', headers })).toBe(false)
  })

  it('תקרה שבועית חוסמת', async () => {
    const { sendAutoReply } = await load()
    const db = makeDb() as never
    autoReplyLog = Array.from({ length: 10 }, () => ({ to_email: 'x@gmail.com' }))
    expect(await sendAutoReply(db, { fromEmail: 'x@gmail.com', department: 'main' })).toBe(false)
  })
})
