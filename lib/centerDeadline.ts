// ─────────────────────────────────────────────────────────────────────────────
// מועד אחרון לבחירת מוקד, וספירה לאחור.
//
// 🔴 המשפחה צריכה לדעת כמה זמן נשאר — בטלפון ובאתר. בלי זה היא דוחה
// את הבחירה ומגלה בדיעבד שנסגר.
//
// ⚠️ המועד *מתווסף* ל-centers_open ואינו מחליף אותו: מתג סגור גובר
// תמיד. כך אפשר לסגור מיידית בלי לגעת בתאריך, ולהפך.
//
// ⚠️ תאריך פגום אינו סוגר. נעילת אלפי משפחות בגלל שגיאת הקלדה גרועה
// בהרבה מהשארת הבחירה פתוחה יום נוסף.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeadlineState {
  /** האם המועד חלף. */
  closed: boolean
  /** מילישניות שנותרו. null = אין מועד מוגדר. */
  msLeft: number | null
}

export function deadlineState(
  deadlineIso: string | null | undefined,
  now: Date = new Date(),
): DeadlineState {
  const s = String(deadlineIso ?? '').trim()
  if (!s) return { closed: false, msLeft: null }

  const at = new Date(s)
  // ⚠️ תאריך פגום → פתוח. ראו ההערה בראש הקובץ.
  if (Number.isNaN(at.getTime())) return { closed: false, msLeft: null }

  const msLeft = at.getTime() - now.getTime()
  // ⚠️ <= ולא <: ברגע המועד עצמו כבר סגור. גבול חייב להיות חד-משמעי.
  return { closed: msLeft <= 0, msLeft }
}

/**
 * ניסוח הספירה בעברית.
 *
 * ⚠️ יחידה ריקה אינה מוצגת ("40 דקות" ולא "0 שעות ו-40 דקות") — היא
 * מוסיפה רעש ומקשה על קריאה מהירה.
 *
 * ⚠️ מוחזר ריק כשהזמן אזל: הקורא מציג "נסגר" ולא ספירה שלילית.
 */
export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''

  const totalMin = Math.floor(ms / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60

  // ⚠️ צורת הזוגי בעברית ("יומיים") ולא "2 ימים".
  const dayText = days === 1 ? 'יום אחד' : days === 2 ? 'יומיים' : days > 0 ? `${days} ימים` : ''
  const hourText = hours === 1 ? 'שעה אחת' : hours === 2 ? 'שעתיים' : hours > 0 ? `${hours} שעות` : ''
  const minText = mins === 1 ? 'דקה אחת' : mins === 2 ? 'שתי דקות' : mins > 0 ? `${mins} דקות` : ''

  // ⚠️ שתי יחידות לכל היותר: "יומיים, 3 שעות ו-14 דקות" ארוך מדי
  // להקראה בטלפון, והדקות חסרות משמעות כשנותרו ימים.
  const parts = days > 0 ? [dayText, hourText] : hours > 0 ? [hourText, minText] : [minText]
  const shown = parts.filter(Boolean)
  if (!shown.length) return ''
  if (shown.length === 1) return shown[0]
  // ⚠️ מקף רק לפני ספרה ("ו-3 שעות"). לפני מילה הוא שגוי — "ושעה אחת",
  // לא "ו-שעה אחת" — וגם נקרא שגוי ב-TTS של ימות.
  const sep = /^[0-9]/.test(shown[1]) ? 'ו-' : 'ו'
  return `${shown[0]} ${sep}${shown[1]}`
}

/**
 * ISO → הערך ש-`<input type="datetime-local">` מצפה לו.
 *
 * 🔴 הקלט אינו מקבל ISO עם Z: הוא מצפה ל-"YYYY-MM-DDTHH:mm" **בשעון
 * המקומי**. הזנת ISO גולמי מציגה למנהל שעה מוסטת (שלוש שעות בישראל),
 * והוא "מתקן" אותה — ובכך משנה את המועד באמת.
 *
 * ⚠️ toISOString() אינו מתאים כאן: הוא מחזיר UTC. הבנייה היא מרכיבי
 * הזמן המקומיים, שהם מה שהקלט מציג.
 */
export function toLocalInput(iso: string | null | undefined): string {
  const s = String(iso ?? '').trim()
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─────────────────────────────────────────────────────────────────────────────
// מועד מוארך לקבוצה מוגדרת.
//
// 🔴 למה זה נדרש: משפחה שנוספה ידנית נרשמת מאוחר — בדיוק משום שפספסה את
// הרישום הרגיל — והמועד הכללי חולף עליה לפני שהספיקה לבחור. שעת סגירה אחת
// לכולם מענישה את מי שנוסף באיחור שלא באשמתו.
//
// מי בקבוצה: כל מי ש-source='admin' (הוספה ידנית) **או** שסומן ידנית
// בדגל deadline_extended. שני המסלולים במכוון — הראשון חוסך סימון חוזר
// של כל תוספת חדשה, השני מאפשר להאריך גם למי שנרשם בערוץ אחר והתקשר.
// ─────────────────────────────────────────────────────────────────────────────

export interface RecipientDeadlineInput {
  /** ערוץ הרישום. 'admin' = הוספה ידנית. */
  source?: string | null
  /** סומן ידנית לקבלת ההארכה. */
  deadline_extended?: boolean | null
}

/** האם השורה זכאית למועד המוארך. */
export function isExtendedRecipient(rec: RecipientDeadlineInput | null | undefined): boolean {
  if (!rec) return false
  return rec.source === 'admin' || rec.deadline_extended === true
}

/**
 * המועד החל על שורה מסוימת.
 *
 * 🔴 מאריך בלבד — לעולם לא מקצר.
 *
 * ⚠️ אילו המועד המוארך היה גובר תמיד, תאריך שהוקלד מוקדם מדי היה **נועל
 * את הקבוצה לפני כולם** — ההפך הגמור מכוונת ההגדרה. לכן נבחר המאוחר
 * מבין השניים, וטעות הקלדה יכולה רק להשאיר פתוח, לא לסגור.
 */
export function effectiveDeadline(
  base: string | null | undefined,
  extended: string | null | undefined,
  rec: RecipientDeadlineInput | null | undefined,
): string | null {
  const b = String(base ?? '').trim() || null
  if (!isExtendedRecipient(rec)) return b

  const e = String(extended ?? '').trim() || null
  if (!e) return b
  if (!b) return e

  const bt = new Date(b).getTime()
  const et = new Date(e).getTime()
  // ⚠️ תאריך פגום אינו מבטל את השני — עקבי עם deadlineState שאינו סוגר על פגום.
  if (Number.isNaN(et)) return b
  if (Number.isNaN(bt)) return e
  return et > bt ? e : b
}

/** מצב המועד לשורה מסוימת — הצירוף שהקוראים צריכים בפועל. */
export function recipientDeadlineState(
  base: string | null | undefined,
  extended: string | null | undefined,
  rec: RecipientDeadlineInput | null | undefined,
  now: Date = new Date(),
): DeadlineState & { extended: boolean } {
  const eff = effectiveDeadline(base, extended, rec)
  const state = deadlineState(eff, now)
  return { ...state, extended: isExtendedRecipient(rec) && eff !== (String(base ?? '').trim() || null) }
}
