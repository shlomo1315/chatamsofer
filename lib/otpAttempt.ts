import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 תפיסת ניסיון אימות — אטומית (ביקורת אבטחה 05.10).
//
// הבאג: הקוד קרא את מונה הניסיונות, השווה את הקוד, ורק אז כתב +1.
// בקשות מקבילות ראו כולן את אותו ערך, ולכן "5 ניסיונות לקוד" לא החזיק:
// עשרות ניחושים במקביל על קוד בן 6 ספרות = השתלטות על חשבון.
//
// עכשיו כל ניחוש *תופס* ניסיון לפני ההשוואה, בעדכון מותנה (compare-and-
// swap): העדכון מצליח רק אם המונה עדיין בערך שנקרא. מבין בקשות מקבילות
// רק אחת זוכה בכל ערך — השאר נדחות בלי לבדוק קוד בכלל.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_CODE_ATTEMPTS = 5

export async function claimCodeAttempt(
  admin: SupabaseClient,
  beneficiaryId: string,
  column: 'portal_reset_attempts' | 'portal_phone_code_attempts',
  current: number | null,
): Promise<boolean> {
  const cur = current ?? 0
  if (cur >= MAX_CODE_ATTEMPTS) return false
  let q = admin.from('beneficiaries').update({ [column]: cur + 1 }).eq('id', beneficiaryId)
  // ⚠️ null ו-0 שונים ב-SQL: "= 0" לא תופס null, ולכן ענף נפרד.
  q = current === null ? q.is(column, null) : q.eq(column, cur)
  const { data } = await q.select('id')
  return !!data?.length
}
