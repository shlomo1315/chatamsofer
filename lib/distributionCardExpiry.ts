// ─────────────────────────────────────────────────────────────────────────────
// תוקף הכרטיס בחלוקת חגים — ולידציה בשמירה.
//
// 🔴 הערך נשלח בהמשך לנדרים כ-dd/MM/yyyy (toNedarimExpiry) על כרטיסים
// אמיתיים. תאריך פגום שנשמר במסד אינו מתגלה בשמירה אלא רק ברגע הטעינה,
// מול מאות משפחות בבת אחת — ואז כבר אין למי לפנות. לכן הוא נבלם כאן.
//
// ⚠️ ריק ופגום אינם אותו דבר: ריק הוא בחירה תקינה (הטענה ללא תוקף, כפי
// שהיה עד היום) ופגום הוא טעות. החזרת null על שניהם הייתה מבליעה את הטעות.
// ─────────────────────────────────────────────────────────────────────────────

export type ExpiryResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

export function normalizeCardExpiry(input: string | null | undefined): ExpiryResult {
  const s = (input ?? '').trim()
  if (!s) return { ok: true, value: null }

  const day = s.slice(0, 10)
  // ⚠️ הצורה נבדקת לפני Date: "20/11/2026" נבלע ע"י Date בחלק מהסביבות
  // ומתפרש כתאריך אחר לגמרי, במקום להיפסל.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, error: 'תאריך תוקף לא תקין' }
  }

  const d = new Date(`${day}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return { ok: false, error: 'תאריך תוקף לא תקין' }

  // ⚠️ ההשוואה חיונית: "2026-02-31" ו-"2026-13-45" אינם נזרקים ע"י Date
  // אלא מתגלגלים לחודש הבא. בלי הבדיקה הזו הם היו נשמרים כתאריך שגוי.
  if (d.toISOString().slice(0, 10) !== day) {
    return { ok: false, error: 'תאריך תוקף לא תקין' }
  }

  return { ok: true, value: day }
}
