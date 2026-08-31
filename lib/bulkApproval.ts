// ─────────────────────────────────────────────────────────────────────────────
// אישור המוני של נרשמים לחלוקה.
//
// 🔴 אישור אינו פעולה קוסמטית: מאושר יכול לבחור מוקד, ומי שבחר מוקד
// ייטען בכסף אמיתי. לכן ההיקף נקבע כאן, בפונקציה טהורה שאפשר לבדוק,
// ולא בשאילתה שמפוזרת בין המסך לשרת.
//
// ⚠️ הכלל המרכזי: **לא נוגעים במי שכבר הוכרע ידנית**. "אשר את כולם"
// שהופך דחייה לאישור הוא בדיוק התקלה שאי אפשר לתקן אחורה — אי אפשר
// לדעת מי נדחה בכוונה ומי נסחף.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApprovalCandidate {
  id: string
  approval_status: string | null
  /** ת"ז המוטב. ריק = אי אפשר לטעון לו כרטיס בהמשך. */
  idNumber: string | null
}

export interface ApprovalScope {
  /** המזהים שיאושרו. */
  ids: string[]
  /** כמה נבדקו בסך הכל. */
  total: number
  skipped: {
    /** כבר מאושרים או נדחו — לא נוגעים בהם. */
    alreadyDecided: number
    /** בלי ת"ז. */
    noId: number
    /** אותה ת"ז הופיעה כבר. */
    duplicateId: number
  }
}

export function scopeBulkApproval(
  rows: ApprovalCandidate[],
  opts: { onlyIds?: Set<string> } = {},
): ApprovalScope {
  const skipped = { alreadyDecided: 0, noId: 0, duplicateId: 0 }
  const seen = new Set<string>()
  const ids: string[] = []

  for (const r of rows) {
    // ⚠️ הצמצום לרשימה שנבחרה קודם לכל השאר, אבל *אינו* עוקף אותו:
    // בחירה מפורשת של שורה פסולה עדיין נחסמת בכללים שלמטה.
    if (opts.onlyIds && !opts.onlyIds.has(r.id)) continue

    // 🔴 כל מי שאינו 'pending' כבר הוכרע — ידיים בכיסים.
    if (r.approval_status !== 'pending') { skipped.alreadyDecided++; continue }

    const key = String(r.idNumber ?? '').trim()
    // 🔴 בלי ת"ז אי אפשר להקים לקוח בנדרים ואי אפשר לטעון כרטיס.
    // אישור כזה יוצר שורה שנראית מוכנה ונופלת בשלב הטעינה.
    if (!key) { skipped.noId++; continue }

    // ⚠️ אותה ת"ז פעמיים = אותו אדם בשתי שורות. אישור שניהם מסתיים
    // בשתי טעינות לאותו כרטיס.
    if (seen.has(key)) { skipped.duplicateId++; continue }
    seen.add(key)

    ids.push(r.id)
  }

  return { ids, total: rows.length, skipped }
}

/**
 * הניסוח שמוצג לפני האישור.
 *
 * ⚠️ מפרט מי *לא* ייכלל ולמה: בלי זה ההפרש בין "6,047 ממתינים" ל"5,900
 * יאושרו" נראה כתקלה, והמנהל אינו יודע שחסרה ת"ז.
 */
export function describeApprovalScope(scope: ApprovalScope): string {
  if (!scope.ids.length) return 'אין מי לאשר — כל השורות כבר הוכרעו או שאינן זכאיות'

  const parts = [`יאושרו ${scope.ids.length.toLocaleString('he-IL')} משפחות`]
  const s = scope.skipped
  if (s.alreadyDecided) parts.push(`${s.alreadyDecided.toLocaleString('he-IL')} כבר הוכרעו ולא ייגעו`)
  if (s.noId) parts.push(`${s.noId.toLocaleString('he-IL')} בלי ת״ז — לא יאושרו`)
  if (s.duplicateId) parts.push(`${s.duplicateId.toLocaleString('he-IL')} כפילויות ת״ז`)
  return parts.join(' · ')
}
