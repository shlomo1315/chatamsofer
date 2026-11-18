// ─────────────────────────────────────────────────────────────────────────────
// מסך "שליחה חיה" של גיליון: קצב, זמן משוער לסיום, עמודות לפי דקה ועצירות.
// פונקציה טהורה, בלי מסד, כדי שאפשר לבדוק אותה. הנתונים: זמני sent_at של המשלוחים.
//
// אין באפליקציה מקור אמין לזמני פריסה, ולכן מסומנות "עצירות": פער של 2 דקות ומעלה
// בין שני מיילים (ה-worker רץ כל דקה, כך שבשליחה תקינה אין פער כזה).
// ─────────────────────────────────────────────────────────────────────────────

const MIN = 60_000
export const LIVE_MINUTES = 40
export const GAP_MS = 2 * MIN
const RATE_WINDOW_MS = 5 * MIN

export interface LiveGap {
  /** המייל האחרון לפני העצירה */
  from: string
  /** המייל הראשון אחריה; null = העצירה עדיין נמשכת */
  to: string | null
  minutes: number
  /** מספר הנמען שממנו השליחה המשיכה (1 = הראשון) */
  resumedAt: number | null
}

export interface LiveMinute { t: string; count: number; gap: boolean }

export interface LiveView {
  /** מיילים בשנייה, לפי 5 הדקות האחרונות */
  rate: number
  /** שניות עד הסיום; null = אין קצב לחשב לפיו */
  etaSec: number | null
  /** האם נשלח מייל בדקה וחצי האחרונות */
  active: boolean
  firstSent: string | null
  lastSent: string | null
  /** 40 דקות, מהחדשה (0) לישנה */
  minutes: LiveMinute[]
  gaps: LiveGap[]
}

export function buildLiveView(sentTimes: number[], pending: number, opts: { now?: Date; status: string; completedAt?: string | null }): LiveView {
  const times = [...sentTimes].filter(t => !Number.isNaN(t)).sort((a, b) => a - b)
  const now = (opts.now ?? new Date()).getTime()
  const sending = opts.status === 'sending'
  const last = times.length ? times[times.length - 1] : null
  const first = times.length ? times[0] : null

  const gaps: LiveGap[] = []
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] >= GAP_MS) {
      gaps.push({ from: new Date(times[i - 1]).toISOString(), to: new Date(times[i]).toISOString(), minutes: Math.round((times[i] - times[i - 1]) / MIN), resumedAt: i + 1 })
    }
  }
  if (sending && last !== null && pending > 0 && now - last >= GAP_MS) {
    gaps.push({ from: new Date(last).toISOString(), to: null, minutes: Math.round((now - last) / MIN), resumedAt: null })
  }

  // קצב: מיילים בחלון האחרון. בתחילת שליחה החלון קצר יותר (לפחות 30 שניות).
  let rate = 0
  if (sending && first !== null) {
    const win = Math.max(30_000, Math.min(RATE_WINDOW_MS, now - first))
    rate = times.filter(t => t > now - win).length / (win / 1000)
  }
  const etaSec = sending && rate > 0 ? Math.round(pending / rate) : null

  const end = !sending && opts.completedAt ? Date.parse(opts.completedAt) : now
  const endMinute = Math.floor(end / MIN) * MIN
  const minutes: LiveMinute[] = Array.from({ length: LIVE_MINUTES }, (_, i) => ({ t: new Date(endMinute - i * MIN).toISOString(), count: 0, gap: false }))
  for (const t of times) {
    const i = Math.floor((endMinute - Math.floor(t / MIN) * MIN) / MIN)
    if (i >= 0 && i < LIVE_MINUTES) minutes[i].count++
  }
  for (const g of gaps) {
    const a = Date.parse(g.from), b = g.to ? Date.parse(g.to) : now
    for (const m of minutes) {
      const s = Date.parse(m.t)
      if (s > a && s + MIN <= b) m.gap = true
    }
  }

  return {
    rate: Math.round(rate * 10) / 10,
    etaSec,
    active: sending && last !== null && now - last < 90_000,
    firstSent: first !== null ? new Date(first).toISOString() : null,
    lastSent: last !== null ? new Date(last).toISOString() : null,
    minutes,
    gaps,
  }
}
