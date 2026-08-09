// ─────────────────────────────────────────────────────────────────────────────
// הודעת "הילד כבר רשום כמשפחה נפרדת" — בלשון המתאימה למין הילד.
//
// ⚠️ מקור אחד לשני המסלולים שבהם נרשמים ילדים (public-register ו-update-details),
// כדי שהנוסח לא יתפצל ביניהם ויתוקן פעמיים.
//
// הפנייה בלשון המתאימה אינה קוסמטיקה: זו הודעה שהורה קורא באמצע טופס ארוך
// אחרי שנחסם, וניסוח מגושם ("רשום/ה", "אותו/ה") מקשה בדיוק ברגע שבו צריך
// שיבין מיד מה לעשות.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChildLike { gender?: unknown; marital_status?: unknown }

const FEMALE_MARITAL = new Set(['נשואה', 'לא נשואה', 'גרושה', 'אלמנה'])
const MALE_MARITAL = new Set(['נשוי', 'לא נשוי', 'גרוש', 'אלמן'])

// ─────────────────────────────────────────────────────────────────────────────
// מצב משפחתי של ילד — מקור אחד לאמת.
//
// 🔴 הבאג ששני אלה מתקנים: אותה עמודה (children[].marital_status) נכתבת בשתי
// שפות. הפורטל הציבורי כותב עברית ('נשוי'/'לא נשואה'), וטופס הניהול כותב
// אנגלית ('married'/'single'). כל בדיקה במערכת הכירה קבוצה אחת בלבד, ולכן:
//   • הצ'יפים בכרטסת ("נשואים: 0") ספרו רק 'married' והציגו 0 למשפחה שנרשמה
//     דרך הפורטל — וגם עמודת הסטטוס הראתה מקף בכל שורה.
//   • הפטור "ילד נשוי מותר להירשם גם אם יש לו כרטסת" זיהה רק עברית, ולכן
//     ילד שסומן נשוי מהניהול נחסם — "אי אפשר לרשום ילדים נשואים".
// כאן מזהים את שתי השפות, ובכל מקום שמפרש את השדה קוראים לפונקציות האלה.
// ─────────────────────────────────────────────────────────────────────────────
const MARRIED_VALUES = new Set(['married', 'נשוי', 'נשואה', 'נשואים', 'נשואה/נשוי'])
const SINGLE_VALUES = new Set(['single', 'לא נשוי', 'לא נשואה', 'לא נשואים', 'רווק', 'רווקה'])

/** האם הילד מסומן כנשוי — בכל אחת משתי השפות שנכתבו למאגר. */
export function isChildMarried(status: unknown): boolean {
  return MARRIED_VALUES.has(String(status ?? '').trim().toLowerCase())
    || MARRIED_VALUES.has(String(status ?? '').trim())
}

/** האם הילד מסומן במפורש כרווק. ערך ריק/לא מוכר אינו נחשב לא-נשוי. */
export function isChildSingle(status: unknown): boolean {
  return SINGLE_VALUES.has(String(status ?? '').trim().toLowerCase())
    || SINGLE_VALUES.has(String(status ?? '').trim())
}

/**
 * לשון הפנייה לילד. נגזרת מ-gender, ובהיעדרו מהמצב המשפחתי — שכן 'נשואה'
 * מעיד על בת בדיוק כמו ש-gender='female' מעיד.
 * כשאין שום מידע נשארת הפנייה הכפולה, כי ניחוש שגוי גרוע ממנה.
 */
export function childWording(c: ChildLike): { registered: string; obj: string; married: string } {
  const g = String(c?.gender ?? '').trim().toLowerCase()
  const ms = String(c?.marital_status ?? '').trim()

  if (g === 'female' || g === 'נקבה' || FEMALE_MARITAL.has(ms)) {
    return { registered: 'רשומה', obj: 'אותה', married: 'נשואה' }
  }
  if (g === 'male' || g === 'זכר' || MALE_MARITAL.has(ms)) {
    return { registered: 'רשום', obj: 'אותו', married: 'נשוי' }
  }
  return { registered: 'רשום/ה', obj: 'אותו/ה', married: 'נשוי/אה' }
}

/** ההודעה המלאה שמוצגת להורה כשהילד קיים במערכת ואינו מסומן כנשוי. */
export function childRegisteredSeparatelyMessage(childLabel: string, c: ChildLike): string {
  const w = childWording(c)
  return `שים לב: ${childLabel} כבר ${w.registered} במערכת כמשפחה נפרדת. `
    + `ניתן להוסיף ${w.obj} תחת הילדים שלך במצב "${w.married}" בלבד — `
    + `יש לסמן את המצב המשפחתי ולנסות שוב.`
}
