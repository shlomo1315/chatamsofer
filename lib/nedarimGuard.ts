// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כלל ברזל: שומר לפני *כל* פנייה לנדרים (בקשת המשתמש 05.10).
//
// למה: נדרים חוסמים את כתובת ה-IP כשמגיעים ממנה גלים של פניות, וכל חסימה
// מפילה את כל המחלקות (סליקת היריד, כרטיסי חגים ויולדות). זה קרה שוב ושוב:
// 15-16.09 (~2,500 פניות בשעה) ו-05.10 (~7,600 ביום) — שני המקרים מ-job רקע
// שחזר על פניות שנכשלו, והמפסק שלו ישב בזיכרון והתאפס בכל פריסה.
//
// מה השומר עושה — בשלוש שכבות, לכל ערוץ בנפרד (כרטיסים / סליקה):
//   1. נפח: יותר מ-X פניות בדקה או Y בשעה ⇒ השהיה של כל הערוץ.
//   2. חזרה: אותה פנייה בדיוק (אותה פעולה על אותה משפחה/הזמנה) יותר מדי
//      פעמים ב-10 דקות ⇒ הפנייה הזו נחסמת. זה מה שנדרים קוראים "לולאה".
//   3. כשלים רצופים: N כשלים ברצף (חסימה, אין הרשאה, תקלת רשת) ⇒ השהיה.
//      פנייה שנכשלת נספרת אצל נדרים כמו כל פנייה — המשך הפגזה רק מחמיר.
// בכל עצירה: שורת לוג 🔴 + מייל התראה (פעם בשעה לכל סוג, לא הצפה).
//
// 🔴 ההשהיה נשמרת במסד (app_settings 'nedarim_guard') — פריסה לא מאפסת
// אותה. זה בדיוק הפער שגרם ל-7,600 הפניות.
//
// ⚠️ ההשהיה זמנית (15 דקות) ולא קבועה: עצירה קבועה הייתה מפילה את סליקת
// היריד עד התערבות ידנית. עצירה חוזרת = מייל חוזר.
// ─────────────────────────────────────────────────────────────────────────────

export type GuardChannel = 'cards' | 'payments'

export type GuardLimits = {
  perMinute: number
  perHour: number
  repeatMax: number
  repeatWindowMs: number
  failStreak: number
}

/**
 * הספים — הרבה מעל השימוש הלגיטימי, הרבה מתחת למה שנדרים חוסמים.
 *
 * ⚠️ כרטיסים: שיחת שיוך כרטיס בטלפון = 2-5 פניות. גם 30 שיחות בשעה הן
 * ~150 פניות — רחוק מ-1,200. נדרים התלוננו על ~2,500-3,000 בשעה.
 * ⚠️ סליקה: פנייה אחת לכל תשלום. 400 בשעה = תשלום כל 9 שניות.
 */
export const GUARD_LIMITS: Record<GuardChannel, GuardLimits> = {
  cards:    { perMinute: 80, perHour: 1200, repeatMax: 8, repeatWindowMs: 10 * 60_000, failStreak: 15 },
  payments: { perMinute: 40, perHour: 400,  repeatMax: 5, repeatWindowMs: 10 * 60_000, failStreak: 12 },
}

export const PAUSE_MS = 15 * 60_000

export type GuardBlock = {
  kind: 'paused' | 'volume' | 'repeat'
  reason: string
  /** האם להשהות את כל הערוץ (נפח) או רק את הפנייה הזו (חזרה / כבר מושהה). */
  trip: boolean
}

/**
 * הליבה — טהורה לגמרי, "עכשיו" מוזרק. כך אפשר לבדוק אותה בלי רשת ובלי
 * לשלוח לנדרים פנייה אחת.
 */
export class GuardCore {
  private calls: Record<GuardChannel, number[]> = { cards: [], payments: [] }
  private repeats = new Map<string, number[]>()
  private fails: Record<GuardChannel, number> = { cards: 0, payments: 0 }
  pausedUntil: Record<GuardChannel, number> = { cards: 0, payments: 0 }

  constructor(private limits: Record<GuardChannel, GuardLimits> = GUARD_LIMITS) {}

  /** null = מותר (והפנייה נרשמה). אחרת — למה נחסמה. */
  check(channel: GuardChannel, opKey: string | null, now: number): GuardBlock | null {
    if (now < this.pausedUntil[channel]) {
      const mins = Math.ceil((this.pausedUntil[channel] - now) / 60_000)
      return { kind: 'paused', reason: `הפניות מושהות עוד ${mins} דקות`, trip: false }
    }
    const L = this.limits[channel]
    const recent = this.calls[channel].filter(t => now - t < 3_600_000)
    this.calls[channel] = recent
    const lastMinute = recent.filter(t => now - t < 60_000).length
    if (lastMinute >= L.perMinute) {
      return { kind: 'volume', reason: `${lastMinute} פניות בדקה האחרונה (תקרה ${L.perMinute})`, trip: true }
    }
    if (recent.length >= L.perHour) {
      return { kind: 'volume', reason: `${recent.length} פניות בשעה האחרונה (תקרה ${L.perHour})`, trip: true }
    }
    if (opKey) {
      const k = `${channel}|${opKey}`
      const times = (this.repeats.get(k) ?? []).filter(t => now - t < L.repeatWindowMs)
      if (times.length >= L.repeatMax) {
        this.repeats.set(k, times)
        return {
          kind: 'repeat',
          reason: `אותה פנייה (${opKey}) ${times.length} פעמים ב-${Math.round(L.repeatWindowMs / 60_000)} דקות`,
          trip: false,
        }
      }
      times.push(now)
      this.repeats.set(k, times)
      // ⚠️ ניקוי מפתחות ישנים — בלי זה המפה גדלה לאורך כל חיי התהליך.
      if (this.repeats.size > 5000) {
        for (const [key, ts] of this.repeats) {
          if (!ts.some(t => now - t < L.repeatWindowMs)) this.repeats.delete(key)
        }
      }
    }
    recent.push(now)
    return null
  }

  /** תוצאת הפנייה. מחזיר סיבה כשרצף הכשלים הגיע לתקרה (⇒ להשהות). */
  result(channel: GuardChannel, ok: boolean): string | null {
    if (ok) { this.fails[channel] = 0; return null }
    this.fails[channel]++
    if (this.fails[channel] >= this.limits[channel].failStreak) {
      const n = this.fails[channel]
      this.fails[channel] = 0
      return `${n} כשלים רצופים מול נדרים`
    }
    return null
  }

  pause(channel: GuardChannel, now: number, ms = PAUSE_MS) {
    this.pausedUntil[channel] = Math.max(this.pausedUntil[channel], now + ms)
  }
}

/** מפתח "אותה פנייה" — פעולה + מזהה המשפחה/הכרטיס. בלי מזהה ⇒ אין בדיקת חזרה. */
export function opKeyOf(mosad: string, action: string, params: Record<string, string | undefined>): string | null {
  const id = params.ClientId || params.Zeout || params.Tsad3Id || params.TlushId || params.MagneticCard
  return id ? `${mosad}:${action}:${id}` : null
}

export class NedarimGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NedarimGuardError'
  }
}

// ── שכבת התהליך: מצב משותף, שמירה במסד והתראה ───────────────────────────────

const core = new GuardCore()
const STATE_KEY = 'nedarim_guard'
const ALERT_TO = (process.env.NEDARIM_GUARD_ALERT_TO || 'office@chasamsofer.info')
  .split(',').map(s => s.trim()).filter(Boolean)
const CHANNEL_LABEL: Record<GuardChannel, string> = {
  cards: 'כרטיסים (חגים 7014553 / יולדות 7018265)',
  payments: 'סליקה (יריד 7004562)',
}

type Persisted = {
  pausedUntil?: Partial<Record<GuardChannel, string | null>>
  lastReason?: Partial<Record<GuardChannel, string>>
  lastAlert?: Record<string, string>
}

let persisted: Persisted = {}
let loadedAt = 0

async function db() {
  const { getServiceClient } = await import('@/lib/apiAuth')
  return getServiceClient()
}

/** טעינת ההשהיה מהמסד (במטמון 20 שניות). ⚠️ כשל קריאה = ממשיכים עם הזיכרון. */
async function refresh(now: number) {
  if (now - loadedAt < 20_000) return
  loadedAt = now
  try {
    const supa = await db()
    if (!supa) return
    const { data } = await supa.from('app_settings').select('value').eq('key', STATE_KEY).maybeSingle()
    const raw = (data as { value?: string } | null)?.value
    persisted = raw ? (JSON.parse(raw) as Persisted) : {}
    for (const ch of ['cards', 'payments'] as GuardChannel[]) {
      const until = Date.parse(persisted.pausedUntil?.[ch] ?? '')
      if (Number.isFinite(until) && until > core.pausedUntil[ch]) core.pausedUntil[ch] = until
    }
  } catch (e) {
    console.warn('[nedarim-guard] קריאת המצב מהמסד נכשלה:', e instanceof Error ? e.message : e)
  }
}

async function persist() {
  try {
    const supa = await db()
    if (!supa) return
    // ⚠️ app_settings.value היא text — חובה stringify.
    await supa.from('app_settings').upsert(
      { key: STATE_KEY, value: JSON.stringify(persisted), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  } catch (e) {
    console.warn('[nedarim-guard] שמירת המצב נכשלה:', e instanceof Error ? e.message : e)
  }
}

/** מייל התראה — לכל היותר פעם בשעה לכל (ערוץ + סוג). */
async function alert(dedupeKey: string, subject: string, lines: string[]) {
  const now = Date.now()
  const last = Date.parse(persisted.lastAlert?.[dedupeKey] ?? '')
  if (Number.isFinite(last) && now - last < 60 * 60_000) return
  persisted.lastAlert = { ...(persisted.lastAlert ?? {}), [dedupeKey]: new Date(now).toISOString() }
  await persist()
  try {
    const { deliverMail } = await import('@/lib/sendMail')
    const html = `<div dir="rtl" style="font-family:'Heebo',Arial,sans-serif;font-size:15px;line-height:1.6">
      ${lines.map(l => `<p style="margin:0 0 8px">${l}</p>`).join('')}
      <p style="margin:12px 0 0;color:#666;font-size:13px">הודעה אוטומטית מהשומר על הפניות לנדרים.</p>
    </div>`
    for (const to of ALERT_TO) {
      await deliverMail(to, subject, html, undefined, { fromEmail: 'office@chasamsofer.info', replyTo: 'office@chasamsofer.info', skipLog: true })
        .catch(() => {})
    }
  } catch { /* התראה שנכשלה לעולם אינה מפילה את הפנייה עצמה */ }
}

async function trip(channel: GuardChannel, reason: string, now: number) {
  core.pause(channel, now)
  const until = new Date(core.pausedUntil[channel])
  persisted.pausedUntil = { ...(persisted.pausedUntil ?? {}), [channel]: until.toISOString() }
  persisted.lastReason = { ...(persisted.lastReason ?? {}), [channel]: reason }
  await persist()
  console.error(`[nedarim-guard] 🔴 הושהה ${channel} עד ${until.toISOString()} — ${reason}`)
  const hhmm = until.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })
  await alert(`${channel}:trip`, '🔴 הפניות לנדרים נעצרו אוטומטית', [
    `<b>ערוץ:</b> ${CHANNEL_LABEL[channel]}`,
    `<b>סיבה:</b> ${reason}`,
    `<b>מה קרה:</b> המערכת זיהתה פניות חריגות לנדרים ועצרה אותן לפני שנדרים יחסמו את השרת. הפניות יתחדשו אוטומטית בשעה ${hhmm}.`,
    'אם ההתראה חוזרת — יש תקלה שצריך לבדוק. אפשר להעביר את המייל הזה למפתח.',
  ])
}

/**
 * לפני כל פנייה לנדרים. זורק NedarimGuardError כשהפנייה חסומה —
 * ⚠️ בלי לפנות לנדרים בכלל.
 */
export async function guardBeforeNedarim(channel: GuardChannel, opKey: string | null): Promise<void> {
  const now = Date.now()
  await refresh(now)
  const block = core.check(channel, opKey, now)
  if (!block) return
  if (block.trip) await trip(channel, block.reason, now)
  if (block.kind === 'repeat') {
    console.error(`[nedarim-guard] 🔴 לולאה נעצרה (${channel}) — ${block.reason}`)
    await alert(`${channel}:repeat`, '🔴 נעצרה לולאה של פניות לנדרים', [
      `<b>ערוץ:</b> ${CHANNEL_LABEL[channel]}`,
      `<b>מה זוהה:</b> ${block.reason}`,
      'הפנייה הזו נחסמה ולא נשלחה לנדרים. שאר הפעולות ממשיכות כרגיל.',
    ])
  }
  throw new NedarimGuardError('הפניות לנדרים נעצרו זמנית כדי למנוע עומס. נסו שוב בעוד כמה דקות או פנו למשרד')
}

/** אחרי כל פנייה לנדרים — הצלחה או כשל (כולל חסימה / אין הרשאה / רשת). */
export async function guardAfterNedarim(channel: GuardChannel, ok: boolean, detail?: string): Promise<void> {
  const streak = core.result(channel, ok)
  if (streak) await trip(channel, detail ? `${streak} (האחרון: ${detail.slice(0, 120)})` : streak, Date.now())
}
