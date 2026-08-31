// ─────────────────────────────────────────────────────────────────────────────
// טווח ימי ההחלמה, וקפיצת התצוגה כשהוא חוצה חודש.
//
// 🔴 הבעיה שנצפתה: ביום האחרון של החודש הלועזי, סימון "היום" מסמן גם את
// יום המחרת — אבל המחרת נופל בחודש הבא, והלוח נשאר על החודש הנוכחי.
// היולדת רואה תא אחד מסומן ומניחה שהסימון נכשל.
//
// ⚠️ החישוב עצמו תמיד היה נכון: חיבור מילישניות עובר חודשים ושנים.
// מה שחסר היה קפיצת התצוגה אל החודש שבו היציאה נמצאת.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * טווח הזכאות מיום ההגעה.
 *
 * ⚠️ maxDays כולל את יום ההגעה: זכאות של יומיים היא שני תאים ולא שלושה.
 */
export function recoveryRange(arrivalIso: string, maxDays: number): { from: string; to: string } {
  const [y, m, d] = String(arrivalIso).split('-').map(Number)
  const arrival = new Date(y, (m ?? 1) - 1, d ?? 1)
  const days = Math.max(1, Number(maxDays) || 1)
  // ⚠️ חיבור מילישניות ולא setDate: setDate על יום 31 בחודש בן 30
  // מתגלגל בשקט ליום הבא, וחיבור ימים פשוט אינו סובל מכך.
  const departure = new Date(arrival.getTime() + (days - 1) * DAY_MS)
  return { from: iso(arrival), to: iso(departure) }
}

/**
 * האם התצוגה צריכה לקפוץ לחודש אחר.
 *
 * 🔴 זה מה שהיה חסר: בלי הקפיצה, יום היציאה בחודש הבא פשוט אינו נראה,
 * והסימון נראה כאילו לא נקלט.
 *
 * ⚠️ מושווים גם החודש וגם השנה — ינואר 2027 מול ינואר 2026 היו נראים
 * זהים בהשוואת חודש בלבד.
 */
export function shouldJumpMonth(departureIso: string, viewMonth: Date): boolean {
  const s = String(departureIso ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m] = s.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return false
  return y !== viewMonth.getFullYear() || (m - 1) !== viewMonth.getMonth()
}
