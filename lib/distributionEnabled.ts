import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// חלוקות חגים — מתג פעילה / מושבתת (distributions.enabled).
//
// חלוקה מושבתת אינה עובדת כלל: הטלפון, הפורטל, המייל וטופס נדרים מתנהגים
// כאילו אינה קיימת, ופעולות הניהול עליה (טעינה, שוברים, שיוך, הודעות) נחסמות.
//
// ⚠️ !== false ולא === true: חלוקה בלי ערך (לפני שהמיגרציה רצה) נחשבת פעילה,
// כדי שהעלאת הקוד לבדה לא תכבה דבר בייצור. מאותה סיבה השאילתות שולפות '*'
// ולא את העמודה בשמה — שליפה של עמודה חסרה הייתה מפילה את השאילתה כולה.
// ─────────────────────────────────────────────────────────────────────────────

export function isDistributionEnabled(row: { enabled?: boolean | null } | null | undefined): boolean {
  return !!row && row.enabled !== false
}

/** הראשונה הפעילה מתוך רשימה ממוינת ("האחרונה" שאינה מושבתת). */
export function firstEnabled<T>(rows: T[] | null | undefined): T | null {
  return (rows ?? []).find(r => isDistributionEnabled(r as { enabled?: boolean | null })) ?? null
}

/**
 * חלוקה "חיה" — לא מושבתת ולא מבוטלת. אותה הגדרה כמו getLiveDistribution
 * (lib/holidayDistributions), שעליה נשענים הטלפון והפורטל.
 */
export function isLiveDistribution(row: { enabled?: boolean | null; status?: string | null } | null | undefined): boolean {
  return isDistributionEnabled(row) && row!.status !== 'cancelled'
}

/**
 * החלוקה החיה מתוך רשימה ממוינת מהחדשה לישנה. כשיש כמה — העדכנית.
 * ⚠️ מושבתת או מבוטלת לעולם אינה נבחרת, גם אם היא החדשה ביותר.
 */
export function pickLiveDistribution<T extends { enabled?: boolean | null; status?: string | null }>(rows: T[] | null | undefined): T | null {
  return (rows ?? []).find(r => isLiveDistribution(r)) ?? null
}

export const DISTRIBUTION_DISABLED_ERROR = 'החלוקה מושבתת. יש להפעיל אותה במסך "חלוקות חגים" לפני כל פעולה בה.'

/**
 * הודעת חסימה לפעולת ניהול על חלוקה מושבתת, או null כשמותר.
 * ⚠️ חלוקה שלא נמצאה מחזירה null — הטיפול ב"לא נמצאה" נשאר בנתיב עצמו.
 */
export async function distributionDisabledError(db: SupabaseClient, distributionId: string | null | undefined): Promise<string | null> {
  if (!distributionId) return null
  const { data } = await db.from('distributions').select('*').eq('id', distributionId).maybeSingle()
  if (!data) return null
  return isDistributionEnabled(data as { enabled?: boolean | null }) ? null : DISTRIBUTION_DISABLED_ERROR
}
