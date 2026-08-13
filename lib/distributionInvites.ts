// ─────────────────────────────────────────────────────────────────────────────
// קישור רישום עם תוקף — הלוגיקה הטהורה.
//
// 🔴 מה הקישור עושה: פותח את הרישום לחלוקה *אחת*, בערוץ הפורטל *בלבד*, בתוך
// חלון זמן שהוגדר לו. הוא אינו נוגע במתג המחלקה, אינו משנה registration_open,
// ואינו פותח את הערוצים האחרים (שלוחה טלפונית, נדרים, מייל).
//
// עד היום החלופה היחידה הייתה לפתוח את הרישום לכולם ולסגור מיד — מה שפותח
// את כל הערוצים לכל העולם למשך אותן דקות.
//
// ⚠️ הקישור אינו חד-פעמי ואינו נעול למשפחה — במכוון. קישור אחד נשלח לקבוצת
// משפחות, וכל אחת מהן נרשמת דרכו. לכן **הזמן הוא ההגבלה היחידה**, וזו הסיבה
// שהתפוגה היא שדה חובה: קישור בלי תפוגה הוא מתג סגירה שנשאר פתוח לתמיד.
//
// ⚠️ מה שהקישור *אינו* מחליף: את האימות. מי שפותח אותו מתחבר לפורטל בת"ז +
// קוד חד-פעמי ונרשם כמשפחה שלו בלבד. הקישור מסיר את חסימת הסגירה, לא את
// הזיהוי — אחרת כל מי שהקישור הועבר אליו היה רושם משפחות שאינן שלו.
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes } from 'crypto'

export interface InviteRow {
  token: string
  distribution_id: string
  expires_at: string
  starts_at: string | null
  revoked_at: string | null
}

/**
 * למה הקישור נדחה — או שהוא תקף.
 *
 * ⚠️ הסיבות נפרדות כדי שההודעה למשפחה תהיה נכונה: "פג תוקף" ו"טרם נפתח"
 * מחייבים פעולה אחרת לגמרי מצד המשפחה, ו"לא תקין" גורף היה מייצר פניות
 * טלפוניות שאי אפשר לענות עליהן.
 */
export type InviteVerdict =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'expired' | 'not-started' | 'revoked' | 'wrong-distribution' }

/** הודעה למשפחה לכל סיבת דחייה. */
export const INVITE_MESSAGE: Record<Exclude<InviteVerdict, { ok: true }>['reason'], string> = {
  'not-found': 'הקישור אינו תקין. אנא פנו למשרד לקבלת קישור חדש.',
  'expired': 'תוקף הקישור פג והרישום נסגר. אנא פנו למשרד.',
  'not-started': 'הרישום בקישור זה טרם נפתח. אנא נסו שוב במועד שנמסר לכם.',
  'revoked': 'הקישור בוטל. אנא פנו למשרד.',
  'wrong-distribution': 'הקישור שייך לחלוקה אחרת. אנא פנו למשרד.',
}

/** תאריך ושעה בעברית — "12.08.2026 בשעה 14:30". */
function fmtHe(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // ⚠️ אזור זמן ישראל במפורש: השרת רץ ב-UTC, ובלעדיו משפחה שהקישור פג
  // אצלה ב-01:00 בלילה הייתה רואה שעה מוקדמת ביום הקודם.
  const date = d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })
  return `${date} בשעה ${time}`
}

/**
 * הודעת דחייה מפורטת — עם שם החלוקה ומועד הסגירה.
 *
 * ⚠️ למה זה חשוב: ההודעה הגנרית ("תוקף הקישור פג") אינה אומרת למשפחה
 * *מה* נסגר ו*מתי*. משפחה שלוחצת על קישור שנשלח לפני שבוע אינה יודעת אם
 * היא איחרה בשעה או בחודש, ואינה יודעת אם מדובר בחלוקה שהיא בכלל ציפתה
 * לה — ולכן היא מתקשרת למשרד לברר. המידע הזה עונה על שתי השאלות מראש.
 *
 * ⚠️ נופל בחזרה להודעה הגנרית כשחסר מידע: הודעה חלקית ("נסגרה ביום —")
 * גרועה מהודעה כללית.
 */
export function inviteMessageDetailed(
  reason: Exclude<InviteVerdict, { ok: true }>['reason'],
  ctx: { distributionName?: string | null; expiresAt?: string | null; startsAt?: string | null } = {},
): string {
  const name = String(ctx.distributionName ?? '').trim()

  if (reason === 'expired' && ctx.expiresAt) {
    const when = fmtHe(ctx.expiresAt)
    if (when) {
      return name
        ? `שימו לב: הרישום לחלוקת ${name} נסגר ביום ${when}.`
        : `שימו לב: הרישום נסגר ביום ${when}.`
    }
  }

  // ⚠️ גם "טרם נפתח" מקבל מועד: משפחה שהגיעה מוקדם צריכה לדעת מתי לחזור,
  // אחרת היא מתקשרת או מוותרת.
  if (reason === 'not-started' && ctx.startsAt) {
    const when = fmtHe(ctx.startsAt)
    if (when) {
      return name
        ? `הרישום לחלוקת ${name} ייפתח ביום ${when}.`
        : `הרישום ייפתח ביום ${when}.`
    }
  }

  if (reason === 'revoked' && name) {
    return `הקישור לחלוקת ${name} בוטל. אנא פנו למשרד.`
  }

  return INVITE_MESSAGE[reason]
}

/**
 * אורך הטוקן — 32 תווים hex = 128 ביט אקראיות.
 *
 * ⚠️ הטוקן *הוא* מה שפותח את הרישום, ולכן האקראיות כאן היא מה שמונע ניחוש.
 * זה חשוב כאן יותר מבקישור חד-פעמי: קישור מנוחש אינו נשרף אחרי שימוש אחד,
 * אלא נשאר פתוח עד התפוגה.
 */
export function newInviteToken(): string {
  return randomBytes(16).toString('hex')
}

/**
 * האם הקישור תקף לשימוש עכשיו.
 *
 * @param now הזמן הנוכחי.
 * @param distributionId החלוקה שאליה מנסים להירשם, כשידועה. הקישור נעול
 *   לחלוקה אחת, כדי שקישור מפסח לא ישמש לרישום לתשרי.
 */
export function checkInvite(
  invite: InviteRow | null | undefined,
  now: Date,
  distributionId?: string | null,
): InviteVerdict {
  if (!invite) return { ok: false, reason: 'not-found' }
  if (invite.revoked_at) return { ok: false, reason: 'revoked' }

  const exp = new Date(invite.expires_at)
  // ⚠️ תאריך תפוגה פגום נחשב פג, ולא תקף. ברירת מחדל לטובת הפותח הייתה
  // הופכת שורה פגומה לקישור נצחי — והזמן הוא ההגבלה היחידה שיש כאן.
  if (Number.isNaN(exp.getTime()) || exp.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' }
  }

  // פתיחה מושהית — קישור שנשלח מראש ונפתח רק במועד. null = תקף מיד.
  if (invite.starts_at) {
    const start = new Date(invite.starts_at)
    // ⚠️ מועד התחלה פגום מתעלמים ממנו (הקישור תקף), ולא הופכים אותו לחסום
    // לנצח: התפוגה כבר נבדקה למעלה, ולכן אין כאן סיכון של דלת פתוחה.
    if (!Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) {
      return { ok: false, reason: 'not-started' }
    }
  }

  if (distributionId && invite.distribution_id !== distributionId) {
    return { ok: false, reason: 'wrong-distribution' }
  }
  return { ok: true }
}

/**
 * מועד תפוגה מברירת מחדל של ימים.
 *
 * ⚠️ מוגבל לטווח שפוי: תפוגה של שנים היא חור קבוע במתג הסגירה, וכזה שאיש
 * לא זוכר שקיים.
 */
export const MAX_INVITE_DAYS = 60
export function inviteExpiry(now: Date, days: number): string {
  const d = Math.min(Math.max(Math.floor(days) || 1, 1), MAX_INVITE_DAYS)
  return new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * נרמול מועד תפוגה שהוגדר ידנית.
 *
 * ⚠️ תאריך בעבר או פגום נדחה ולא "מתוקן" בשקט: מנהל שהקליד תאריך שגוי צריך
 * לדעת, ולא לגלות אחר כך שהקישור שיצר כבר פג או תקף לחודשיים.
 */
export function normalizeExpiry(input: string, now: Date): { ok: true; iso: string } | { ok: false; error: string } {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return { ok: false, error: 'תאריך תפוגה לא תקין' }
  if (d.getTime() <= now.getTime()) return { ok: false, error: 'מועד התפוגה חייב להיות בעתיד' }
  const maxMs = now.getTime() + MAX_INVITE_DAYS * 24 * 60 * 60 * 1000
  if (d.getTime() > maxMs) return { ok: false, error: `מועד התפוגה מוגבל ל-${MAX_INVITE_DAYS} יום` }
  return { ok: true, iso: d.toISOString() }
}
