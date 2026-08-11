// ─────────────────────────────────────────────────────────────────────────────
// חלון הרישום של חלוקת חגים — האם פתוח *עכשיו*, ומה להגיד כשלא.
//
// ⚠️ מודול טהור בלי גישה למסד: הוא מקבל את שדות החלוקה ואת "עכשיו" ומחזיר
// הכרעה. כך אפשר לבדוק אותו על גבולות מדויקים (שנייה לפני הסגירה, שנייה
// אחריה) בלי להריץ בסיס נתונים ובלי להמתין לשעון.
//
// ⚠️ המתג הידני (registration_open) והחלון המתוזמן הם *שני* תנאים שחייבים
// להתקיים יחד. המתג אומר "זו החלוקה הפעילה", החלון אומר "ומתי מקבלים בה
// רישומים". מתג כבוי סוגר מיידית גם באמצע החלון — זו עצירת החירום.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduleFields {
  registration_open?: boolean | null
  registration_opens_at?: string | null
  registration_closes_at?: string | null
}

export type ScheduleState =
  | 'open'          // מקבל רישומים
  | 'switch_off'    // המתג הידני כבוי
  | 'before_open'   // טרם נפתח — יש מועד פתיחה עתידי
  | 'after_close'   // נסגר — עבר מועד הסגירה

export interface ScheduleResult {
  open: boolean
  state: ScheduleState
  /** מועד הפתיחה/סגירה הרלוונטי להודעה (ISO), אם קיים */
  at: string | null
}

/**
 * תאריך תקין בלבד — ערך פגום נחשב כ"לא הוגדר" ולא חוסם רישום.
 *
 * ⚠️ fail-open מכוון: ערך זמן שנשמר פגום הוא באג בהגדרה, ואם הוא יחסום את
 * הרישום כל המשפחות ייחסמו בשקט בלי שאיש יבין למה. חלון שאינו קריא מתנהג
 * כאילו לא הוגדר, והמתג הידני נשאר ההגנה.
 */
function ts(v?: string | null): number | null {
  if (!v) return null
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

export function getScheduleState(d: ScheduleFields, now: Date = new Date()): ScheduleResult {
  if (d.registration_open !== true) return { open: false, state: 'switch_off', at: null }

  const n = now.getTime()
  const opens = ts(d.registration_opens_at)
  const closes = ts(d.registration_closes_at)

  // ⚠️ הפתיחה נכללת והסגירה אינה: חלון "08:00 עד 20:00" מקבל רישום שהגיע
  // ב-08:00:00 בדיוק, ודוחה רישום שהגיע ב-20:00:00 בדיוק. בלי הכרעה מפורשת
  // כאן, רישום שנשלח בדיוק על השנייה היה מתקבל או נדחה לפי מקריות.
  if (opens !== null && n < opens) return { open: false, state: 'before_open', at: d.registration_opens_at ?? null }
  if (closes !== null && n >= closes) return { open: false, state: 'after_close', at: d.registration_closes_at ?? null }

  return { open: true, state: 'open', at: d.registration_closes_at ?? null }
}

/** האם הרישום פתוח כרגע — קיצור נוח כשלא צריך את הסיבה. */
export function isRegistrationOpenNow(d: ScheduleFields, now: Date = new Date()): boolean {
  return getScheduleState(d, now).open
}

/**
 * מועד בעברית לתצוגה למשתמש — "ביום חמישי, 14.08.2026 בשעה 20:00".
 *
 * ⚠️ אזור הזמן מקובע לישראל ולא נלקח מהדפדפן: הנרשמים והמשרד באותו אזור,
 * וההודעה נשלחת גם מהשרת (מייל, הקראה בשלוחה) שרץ ב-UTC. בלי קיבוע, אותו
 * מועד היה מוצג בשעה אחרת בכל ערוץ.
 */
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export function formatDeadline(iso?: string | null): string {
  const t = ts(iso)
  if (t === null) return ''
  const d = new Date(t)
  const parts = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem', weekday: 'long',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (k: string) => parts.find(p => p.type === k)?.value ?? ''
  const wd = get('weekday') || HE_DAYS[d.getDay()]
  return `ביום ${wd}, ${get('day')}.${get('month')}.${get('year')} בשעה ${get('hour')}:${get('minute')}`
}

/**
 * ההודעה שהנרשם רואה. אומרת *מה קרה ומתי* ולא "אין חלוקה פתוחה" —
 * מי שאיחר בשעה צריך לדעת שאיחר, לא לחשוב שהמערכת תקולה.
 */
export function closedMessage(r: ScheduleResult): string {
  if (r.open) return ''
  if (r.state === 'before_open' && r.at) {
    return `הרישום לחלוקה טרם נפתח. הוא ייפתח ${formatDeadline(r.at)}.`
  }
  if (r.state === 'after_close' && r.at) {
    return `הרישום לחלוקה נסגר ${formatDeadline(r.at)}.`
  }
  return 'אין כרגע חלוקה שהרישום אליה פתוח'
}
