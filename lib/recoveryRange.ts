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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ימי שהייה שאינם רצופים (11.10).
//
// ברירת המחדל נשארת רצף: לחיצה ראשונה מסמנת את יום ההגעה ואת הימים שאחריו
// עד מלוא הזכאות. אבל יולדת יכולה לשהות יום אחד, ועוד יום כעבור כמה ימים —
// ולכן אפשר לבטל יום מסומן וללחוץ על יום אחר במקומו.
//
// ⚠️ התקרה לא משתנה: לעולם לא יותר ימים מימי הזכאות.
// ─────────────────────────────────────────────────────────────────────────────

/** כל הימים בטווח, כולל שני הקצוות (לרשומות ישנות שנשמרו כ-from/to בלבד). */
export function datesInRange(fromIso: string | null | undefined, toIso: string | null | undefined): string[] {
  if (!fromIso || !toIso) return []
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  const from = new Date(fy, fm - 1, fd).getTime()
  const to = new Date(ty, tm - 1, td).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return []
  const out: string[] = []
  // ⚠️ תקרה מגוננת — טווח פגום לא ייצר אלפי ימים
  for (let t = from; t <= to && out.length < 60; t += DAY_MS) out.push(iso(new Date(t)))
  return out
}

/**
 * לחיצה על יום בלוח.
 *   • אין סימון            → רצף מלא מהיום שנלחץ (ברירת המחדל)
 *   • היום כבר מסומן       → מבוטל
 *   • יש מקום בזכאות       → נוסף כיום נפרד
 *   • הזכאות מלאה          → מתחילים מחדש: רצף מלא מהיום שנלחץ
 *
 * ⚠️ המקרה האחרון שומר על ההתנהגות המוכרת: מי שלוחץ על יום אחר כשהכול
 * מסומן מתכוון ל"הגיעה ביום אחר", לא ל"הוסף יום" — אין לאן להוסיף.
 */
export function toggleStayDay(selected: string[], dayIso: string, maxDays: number): string[] {
  const max = Math.max(1, Number(maxDays) || 1)
  const set = [...new Set(selected)].sort()
  const fullRange = () => { const r = recoveryRange(dayIso, max); return datesInRange(r.from, r.to) }
  if (set.length === 0) return fullRange()
  if (set.includes(dayIso)) return set.filter(d => d !== dayIso)
  if (set.length < max) return [...set, dayIso].sort()
  return fullRange()
}

/** האם הימים רצופים — לתצוגה ("26.09–27.09" מול רשימת ימים). */
export function isConsecutive(dates: string[]): boolean {
  const s = [...dates].sort()
  for (let i = 1; i < s.length; i++) {
    const [ay, am, ad] = s[i - 1].split('-').map(Number)
    const [by, bm, bd] = s[i].split('-').map(Number)
    if (Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / DAY_MS) !== 1) return false
  }
  return true
}
