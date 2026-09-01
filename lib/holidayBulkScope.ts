// ─────────────────────────────────────────────────────────────────────────────
// פילוח הסימון לפעולות קבוצתיות בחלוקת חגים.
//
// 🔴 למה זה קיים: הסימון חוצה עמודים ומגיע למאות שורות, ורק חלקן זכאיות.
// בלי פילוח מראש, ההפרש בין "סומנו 800" ל"נטענו 340" נראה כתקלה — והמנהל
// לוחץ שוב ושוב על אותן שורות שאינן זכאות ממילא.
//
// 🔴 הכללים חייבים להיות זהים ל-eligibleForLoad (lib/holidayCardLoad) —
// השרת הוא המחסום האמיתי, וזה כאן קיים כדי *להראות* מה יקרה. אם השניים
// ייפרדו, המסך יבטיח משהו שהשרת לא יעשה.
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkRow {
  id: string
  approval_status?: string | null
  load_status?: string | null
  id_number?: string | null
  center_id?: string | null
  email?: string | null
}

export interface LoadScope<T> {
  eligible: T[]
  alreadyLoaded: number
  notApproved: number
  noId: number
  /** 🔴 טרם בחרו מוקד — אינם נטענים. */
  noCenter: number
}

/**
 * מי ייטען בפועל.
 *
 * ⚠️ 'failed' *נכלל* במכוון — ניסיון חוזר הוא בדיוק מה שרוצים ממנו.
 *
 * 🔴 היעדר מוקד חוסם. קודם היה כתוב כאן ש"הכסף אינו תלוי במוקד, רק
 * השובר" — וזה שגוי: הכרטיס נמסר פיזית *במוקד*. טעינה למי שטרם בחר
 * יוצרת כרטיס טעון בכסף אמיתי שאין לאיש דרך למסור, והכסף יושב עליו
 * עד שמישהו מבחין.
 *
 * ⚠️ eligibleForLoad בשרת כבר חסם זאת, כך שהשורות האלה נספרו כ"ייטענו"
 * ואז נשרו בשקט — ההפרש בין "סומנו 800" ל"נטענו 340" נראה כתקלה.
 */
export function scopeBulkLoad<T extends BulkRow>(rows: T[]): LoadScope<T> {
  const out: LoadScope<T> = {
    eligible: [], alreadyLoaded: 0, notApproved: 0, noId: 0, noCenter: 0,
  }
  for (const r of rows) {
    if (r.load_status === 'loaded') { out.alreadyLoaded++; continue }
    if (r.approval_status !== 'approved') { out.notApproved++; continue }
    if (!String(r.id_number ?? '').trim()) { out.noId++; continue }
    if (!String(r.center_id ?? '').trim()) { out.noCenter++; continue }
    out.eligible.push(r)
  }
  return out
}

export interface VoucherScope<T> {
  eligible: T[]
  noCenter: number
  noEmail: number
}

/**
 * למי יישלח שובר.
 *
 * 🔴 בלי מוקד אין שובר: הוא בנוי כולו סביב המוקד, הכתובת והשעות, ובלעדיו
 * הוא דף ריק שמבלבל יותר משהוא עוזר.
 */
export function scopeBulkVoucher<T extends BulkRow>(rows: T[]): VoucherScope<T> {
  const out: VoucherScope<T> = { eligible: [], noCenter: 0, noEmail: 0 }
  for (const r of rows) {
    if (!r.center_id) { out.noCenter++; continue }
    if (!String(r.email ?? '').trim()) { out.noEmail++; continue }
    out.eligible.push(r)
  }
  return out
}
