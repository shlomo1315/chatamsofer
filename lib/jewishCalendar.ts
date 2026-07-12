import { HDate, HebrewCalendar, flags } from '@hebcal/core'

// ─────────────────────────────────────────────────────────────────────────────
// חסימת שליחת מיילים בשבת ובחג.
//
// הכלל: אסור לשלוח מייל בשבת, ביום טוב, או בערב שבת/חג מ-14:00 והלאה.
// חול המועד מותר (יום עבודה בפועל בישראל), וכך גם חנוכה/פורים/ראש חודש.
//
// הערת מימוש: החסימה מ-14:00 שמרנית בכוונה — היא מוקדמת מזמן הדלקת הנרות
// בכל עונה ובכל מקום בארץ, ולכן תמיד בטוחה ואינה תלויה במיקום גיאוגרפי.
// ─────────────────────────────────────────────────────────────────────────────

const EVE_CUTOFF_HOUR = 14    // מ-14:00 בערב שבת/חג — חסום
const SEND_HOUR = 9           // שעת השליחה ביום המותר הבא
const MAX_LOOKAHEAD_DAYS = 14 // תקרת בטיחות (אין 14 ימי מנוחה רצופים בלוח)

// פירוק תאריך לפי שעון ישראל — עמיד לשעון קיץ/חורף.
// (אותו דפוס כמו israelParts() ב-instrumentation.ts)
function israelParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false, weekday: 'short',
  })
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]))
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24, // en-CA מחזיר 24 בחצות — מנרמלים ל-0
    weekday: String(p.weekday),
  }
}

// האם היום הקלנדרי הזה הוא יום טוב (יום שאסור בו במלאכה).
// מסננים החוצה: חגים מודרניים, חול המועד, ראש חודש, צומות, חנוכה, פורים —
// כולם ימי עבודה רגילים בישראל.
function isYomTov(year: number, month: number, day: number): boolean {
  try {
    const hd = new HDate(new Date(year, month - 1, day))
    const events = HebrewCalendar.getHolidaysOnDate(hd, true) ?? [] // true = לוח ארץ ישראל
    return events.some(ev => {
      const f = ev.getFlags()
      if (f & flags.MODERN_HOLIDAY) return false
      if (f & flags.CHOL_HAMOED) return false
      if (f & flags.ROSH_CHODESH) return false
      if (f & flags.MINOR_FAST) return false
      if (f & flags.MINOR_HOLIDAY) return false // חנוכה, פורים, ל"ג בעומר
      return Boolean(f & flags.CHAG)
    })
  } catch {
    // כשל בחישוב — נוקטים בצד הבטוח ומחשיבים כיום טוב (לא שולחים)
    return true
  }
}

// האם המחרת הוא שבת או יום טוב — כלומר היום הנוכחי הוא ערב.
function isEveOfRest(year: number, month: number, day: number): boolean {
  const next = new Date(year, month - 1, day + 1) // Date מנרמל גלישת חודש/שנה
  const isSaturday = next.getDay() === 6
  return isSaturday || isYomTov(next.getFullYear(), next.getMonth() + 1, next.getDate())
}

/** האם אסור לשלוח מייל בנקודת הזמן הזו. */
export function isBlockedForMail(when: Date): boolean {
  const { year, month, day, hour, weekday } = israelParts(when)

  if (weekday === 'Sat') return true                  // שבת
  if (isYomTov(year, month, day)) return true         // יום טוב

  // ערב שבת/חג מ-14:00
  if (hour >= EVE_CUTOFF_HOUR && isEveOfRest(year, month, day)) return true

  return false
}

/**
 * מועד השליחה החוקי הקרוב ביותר.
 * מועד מותר — מוחזר כמות שהוא. מועד חסום — נדחה ליום המותר הבא, 09:00 שעון ישראל.
 */
export function nextAllowedSendTime(desired: Date): Date {
  if (!isBlockedForMail(desired)) return desired

  for (let i = 1; i <= MAX_LOOKAHEAD_DAYS; i++) {
    const candidate = atIsraelHour(addDays(desired, i), SEND_HOUR)
    if (!isBlockedForMail(candidate)) return candidate
  }
  return atIsraelHour(addDays(desired, MAX_LOOKAHEAD_DAYS), SEND_HOUR)
}

/** מוסיף ימים לתאריך (ללא שינוי המקור). */
export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime())
  out.setDate(out.getDate() + n)
  return out
}

// קובע את השעה לפי שעון ישראל, תוך שמירה על היום הקלנדרי הישראלי.
// מחשבים את הפער מול השעה הנוכחית ומתקנים — נכון גם בשעון קיץ.
// לולאת התיקון מטפלת במעבר DST שעלול להזיז את השעה בשעה אחת.
function atIsraelHour(d: Date, hour: number): Date {
  let out = new Date(d.getTime())
  for (let i = 0; i < 3; i++) {
    const cur = israelParts(out)
    if (cur.hour === hour) break
    out = new Date(out.getTime() + (hour - cur.hour) * 3600_000)
  }
  // מאפסים דקות/שניות (הן זהות בכל אזור זמן עם היסט שלם)
  out.setUTCMinutes(0, 0, 0)
  return out
}
