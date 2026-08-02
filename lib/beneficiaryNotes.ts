import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// כתיבה לתיעוד המשפחה ("צ'אט" ההערות בראש הכרטסת) — מקור אחד לכל הכותבים.
//
// ⚠️ עד כה רק המזכיר יכול היה לכתוב לשם ידנית. החלטות שהמערכת ביצעה — ובראשן
// *דחיית בקשת לידה* — נשמרו רק בעמודה rejection_reason של אותו תיק. הסיבה
// נשלחה במייל ליולדת ונעלמה מהתיעוד: חודשיים אחר כך אי אפשר היה לענות על
// השאלה הפשוטה "למה דחינו לה את הלידה?" בלי לחפור בתיק הספציפי.
//
// לכן כל החלטה משמעותית נרשמת גם כאן, חתומה בשם מי שביצע אותה.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * שם התצוגה של חבר הצוות — לנוחות תצוגה בלי join בכל שליפה.
 *
 * ⚠️ נשלפות רק העמודות שקיימות בטבלה. קודם נשלף גם 'name', שאינו קיים
 * ב-profiles — ו-PostgREST מכשיל את *כל* השאילתה על עמודה לא מוכרת, לא
 * מתעלם ממנה. התוצאה: data חזר null תמיד, שם הכותב נשמר ריק, וכל רשומות
 * התיעוד הוצגו כ"משתמש" במקום בשם האמיתי.
 */
export async function resolveAuthorName(
  db: SupabaseClient,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null
  const { data, error } = await db.from('profiles').select('full_name, email').eq('id', userId).maybeSingle()
  if (error) { console.error('[beneficiaryNotes] שליפת שם הכותב נכשלה:', error.message); return null }
  if (!data) return null
  const p = data as { full_name?: string | null; email?: string | null }
  return (p.full_name?.trim() || p.email?.trim()) ?? null
}

/**
 * הוספת רשומת תיעוד למשפחה.
 * ⚠️ best-effort במכוון: תיעוד שנכשל לא יפיל דחייה/אישור שכבר בוצעו.
 * מחזיר true אם נשמר, כדי שהקורא יוכל לדווח אם ירצה.
 */
export async function addBeneficiaryNote(
  db: SupabaseClient,
  opts: { beneficiaryId: string; body: string; authorId?: string | null; authorName?: string | null },
): Promise<boolean> {
  const text = opts.body.trim()
  if (!opts.beneficiaryId || !text) return false
  const authorName = opts.authorName ?? (await resolveAuthorName(db, opts.authorId))
  const { error } = await db.from('beneficiary_notes').insert({
    beneficiary_id: opts.beneficiaryId,
    body: text,
    author_id: opts.authorId ?? null,
    author_name: authorName,
  })
  if (error) {
    console.error('[beneficiaryNotes] כתיבת התיעוד נכשלה:', error.message)
    return false
  }
  return true
}
