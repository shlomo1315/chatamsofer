// ─────────────────────────────────────────────────────────────────────────────
// מתי כרטיס המזון של יולדת אמור להיפרק.
//
// 🔴 הופרד למודול בדיק בעקבות באג שקט: הפריקה סיננה במסד
// `.lte('six_weeks_end', today)`, אבל 194 מתוך 208 הכרטיסים הטעונים היו
// עם six_weeks_end = NULL. השוואה ל-NULL אינה מחזירה שורות לעולם —
// הפריקה רצה כל לילה, מצאה 0 תיקים, ודיווחה הצלחה.
//
// התוצאה: 12 יולדות עברו שישה שבועות עם ₪7,200 תקועים, בזמן שהמסך הציג
// "הגיע זמן פריקה". המסך חישב מ-birth_date, השאילתה חיפשה six_weeks_end,
// והשניים לא הסכימו.
// ─────────────────────────────────────────────────────────────────────────────

/** מספר הימים בתקופת הזכאות. שישה שבועות. */
export const ELIGIBILITY_DAYS = 42

/**
 * מועד הפריקה בפועל, כ-yyyy-mm-dd.
 *
 * six_weeks_end אם קיים; אחרת נגזר מתאריך הלידה + 42 יום — תאריך הלידה
 * קיים תמיד, ו-six_weeks_end הוא שדה נגזר שלעתים לא מולא.
 *
 * ⚠️ מחזיר null כשאין ממה לגזור. פריקה על סמך ניחוש הייתה לוקחת כסף
 * מיולדת שאולי עדיין בתוך התקופה.
 */
export function unloadDueDate(aid: {
  six_weeks_end?: string | null
  birth_date?: string | null
}): string | null {
  const stored = (aid.six_weeks_end ?? '').trim()
  if (stored) return stored.slice(0, 10)

  const birth = (aid.birth_date ?? '').trim()
  if (!birth) return null

  const d = new Date(birth)
  // ⚠️ Invalid Date אינו זורק אלא מחזיר NaN, וללא הבדיקה התוצאה הייתה
  // המחרוזת "Invalid Date" — והשוואה אליה מתנהגת באופן בלתי צפוי.
  if (isNaN(d.getTime())) return null

  d.setDate(d.getDate() + ELIGIBILITY_DAYS)
  return d.toISOString().slice(0, 10)
}
