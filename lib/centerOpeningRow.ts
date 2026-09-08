import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// שורת הפתיחה של מוקד בחלוקה (holiday_center_openings).
//
// 🔴 בחירת מוקד היא שיוצרת את השורה — לא פעולה נפרדת של המשרד.
//
// ⚠️ הרקע: בחלוקת תשרי נרשמו 6,108 משפחות ל-26 מוקדים, אך שורת פתיחה
// הייתה רק ל-4 מהם. כפתור "טרם מחלק" עושה update ולא upsert (במכוון —
// upsert היה יוצר מוקד "מחלק כרטיסים" שאיש לא נרשם אליו), וכשאין שורה
// הוא מוצא 0 שורות ומחזיר 404. התוצאה: 22 מוקדים ו-4,651 משפחות לא יכלו
// לעבור לשלב חלוקת הכרטיסים, והכפתור נראה כאילו "אינו מגיב".
//
// התיקון הוא במקור ולא בכפתור: מי שנרשם למוקד יוצר לו שורה. כך ההגנה
// שבכפתור נשמרת במלואה — שורה נולדת מרישום אמיתי בלבד.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * מוודאת שקיימת שורת פתיחה למוקד בחלוקה. מחזירה האם נכתבה שורה.
 *
 * 🔴 אינה פותחת את המוקד לחלוקת כרטיסים: pickup_open_at נשאר ריק, וזה
 * מה שמפריד בין "אפשר לבחור כאן" ל"אפשר לקבל כאן כרטיס".
 *
 * ⚠️ לעולם אינה זורקת. הקריאה מגיעה *אחרי* שהבחירה של המשפחה כבר נשמרה,
 * וכשל כאן אסור שיוצג למשפחה ככשל בבחירה.
 */
export async function ensureCenterOpening(
  db: SupabaseClient,
  distributionId: string,
  centerId: string | null | undefined,
): Promise<boolean> {
  if (!distributionId || !centerId) return false

  const { error } = await db.from('holiday_center_openings').upsert(
    { distribution_id: distributionId, center_id: centerId },
    // ⚠️ ignoreDuplicates חיוני: בלעדיו upsert מעדכן שורה קיימת, ובחירה
    // של משפחה בודדת הייתה מאפסת את pickup_open_at של מוקד שכבר מחלק —
    // כלומר סוגרת בטעות מוקד פעיל באמצע החלוקה.
    { onConflict: 'distribution_id,center_id', ignoreDuplicates: true },
  )

  if (error) {
    console.error(`[centerOpening] יצירת שורת פתיחה נכשלה dist=${distributionId} center=${centerId}:`, error.message)
    return false
  }
  return true
}
