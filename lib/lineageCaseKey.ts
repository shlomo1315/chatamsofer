// ─────────────────────────────────────────────────────────────────────────────
// מפתח יציב לממצא בעץ הדורות.
//
// 🔴 הבעיה שזה פותר: הממצאים אינם שורות בטבלה — הם מחושבים מחדש בכל סריקה,
// ולכן אין להם מזהה. בלי מפתח יציב אי אפשר לזכור שהוכרעו, וכל מקרה שנבדק
// ונדחה ("אלה שני אנשים שונים") חזר ברשימה בסריקה הבאה. המנהל עבד שעות
// והרשימה נשארה באותו אורך.
//
// המפתח נבנה מסוג הממצא + מזהי הצמתים המעורבים, **ממוינים**. המיון הוא
// העיקר: זוג (א,ב) וזוג (ב,א) הם אותו מקרה, ובלי מיון היו שני מפתחות
// והכרעה על אחד לא הייתה חלה על השני.
//
// ⚠️ המפתח אינו כולל שמות או מונים — רק זהויות. שם משתנה בעריכה, ומונה
// ילדים משתנה בכל הוספה; מפתח שתלוי בהם היה "מאבד" את ההכרעה בשינוי
// חסר משמעות, והמקרה היה צץ מחדש כאילו לא הוכרע מעולם.
// ─────────────────────────────────────────────────────────────────────────────

/** סוגי הממצאים שמרכז הבקרה מציג. */
export type CaseKind =
  | 'duplicate'      // אותו אדם פעמיים תחת אותו אב
  | 'self_duplicate' // מוטב שנרשם יותר מפעם אחת
  | 'ghost_child'    // ילד ללא אב קיים
  | 'unlinked'       // מוטב בלי צומת בעץ
  | 'many_children'  // חריג ילדים — חשד לכפילות לא-ממוזגת
  | 'blocked_link'   // קישור חסום

export type CaseDecision = 'resolved' | 'dismissed' | 'later'

/**
 * בונה מפתח יציב לממצא.
 *
 * ⚠️ מזהים ריקים מסוננים — צומת חסר אינו הופך את המפתח למקרה אחר.
 */
export function caseKey(kind: CaseKind, nodeIds: (string | null | undefined)[]): string {
  const ids = nodeIds
    .map(id => String(id ?? '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
  return `${kind}:${ids.join('+')}`
}

/** האם ההכרעה מסירה את המקרה מרשימת הפתוחים. */
export function isClosed(decision: CaseDecision | null | undefined): boolean {
  return decision === 'resolved' || decision === 'dismissed'
}

export const DECISION_LABEL: Record<CaseDecision, string> = {
  resolved: 'טופל',
  dismissed: 'אינו בעיה',
  later: 'לטיפול בהמשך',
}

export const KIND_LABEL: Record<CaseKind, string> = {
  duplicate: 'כפילות בין אחים',
  self_duplicate: 'מוטב רשום פעמיים',
  ghost_child: 'ילד ללא אב',
  unlinked: 'מוטב ללא צומת',
  many_children: 'חריג ילדים',
  blocked_link: 'קישור חסום',
}
