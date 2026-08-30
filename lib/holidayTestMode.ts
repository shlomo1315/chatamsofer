// ─────────────────────────────────────────────────────────────────────────────
// מצב בדיקה לחלוקת חגים.
//
// 🔴 מה שהוא מאפשר: לעבור את המסלול המלא — טעינה, שובר, מייל — בלי לגעת
// בכסף אמיתי ובלי שמשפחה תקבל דבר. בלעדיו הבדיקה היחידה היא הטענה
// אמיתית לכרטיס אמיתי, וטעות שם אינה הפיכה.
//
// ⚠️ שייך *לחלוקה* ולא להגדרה גלובלית: מתג גלובלי שנשכח דלוק היה הופך
// חלוקה אמיתית לבדיקה בשקט — אלפי משפחות בלי כסף בכרטיס.
//
// 🔴 בכל שאלה של ספק, ברירת המחדל היא ההתנהגות הבטוחה:
//   · חלוקה לא ידועה  → מצב בדיקה **כבוי** (לא נדלג על טעינה אמיתית)
//   · אין כתובת בדיקה → **לא נשלח מייל** (ולא "נשלח לנמען האמיתי")
// ─────────────────────────────────────────────────────────────────────────────



import type { LoadOutcome, LoadTarget } from './holidayCardLoad'

export interface TestMode {
  active: boolean
  /** לאן נשלחים המיילים במצב בדיקה. null = לא נשלח כלל. */
  email: string | null
}

/** קורא את מצב הבדיקה משורת החלוקה. ⚠️ היעדר מידע = כבוי. */
export function resolveTestMode(
  dist: { test_mode?: boolean | null; test_email?: string | null } | null | undefined,
): TestMode {
  if (!dist?.test_mode) return { active: false, email: null }
  const email = String(dist.test_email ?? '').trim()
  return { active: true, email: email || null }
}

/**
 * התוצאה שמוחזרת במקום טעינה אמיתית.
 *
 * ⚠️ ok:true בכוונה — כדי שהמסלול ימשיך לשובר ולמייל וייבדק כולו.
 * ⚠️ אבל tlushId הוא null ו-testMode הוא true, כדי שאיש לא יטעה לחשוב
 * שנוצרה טעינה אמיתית בנדרים.
 */
export function testModeOutcome(target: LoadTarget): LoadOutcome & { testMode: true } {
  return { recipientId: target.recipientId, ok: true, tlushId: null, testMode: true }
}

/**
 * לאן באמת נשלח המייל.
 *
 * 🔴 במצב בדיקה הכתובת של המשפחה *לעולם* אינה מוחזרת. זה כל הביטחון
 * של המצב הזה: אפשר להריץ את המסלול על משפחה אמיתית בלי שהיא תדע.
 */
export function recipientForTestMail(mode: TestMode, familyEmail: string | null | undefined): string | null {
  // ⚠️ מנוקה גם כאן ולא רק ב-resolveTestMode: TestMode ניתן לבנייה ישירה,
  // וכתובת של רווחים בלבד הייתה מוחזרת כאילו היא כתובת אמיתית.
  if (mode.active) {
    const test = String(mode.email ?? '').trim()
    return test || null
  }
  const real = String(familyEmail ?? '').trim()
  return real || null
}
