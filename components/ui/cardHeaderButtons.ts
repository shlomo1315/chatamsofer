// ─────────────────────────────────────────────────────────────────────────────
// סגנון כפתורי הפעולה בכותרת כרטסת — מקור אמת אחד.
//
// 🔴 למה: בכרטסת היולדות נדחסו לכותרת חמישה רכיבים נפרדים (ניווט, סטטוס,
// תיקון שם, עריכה, מחיקה), כל אחד עם הסגנון שלו: rounded-lg מול
// rounded-xl, px-3 py-1.5 מול px-4 py-2.5, ועיגול מלא מול מרובע. השורה
// נשברה לשתיים והכפתורים נראו כאילו הם משייכים למסכים שונים.
//
// ⚠️ המידות זהות לכרטסת ההלוואות, שהיא הרפרנס: אותו גובה, אותו רדיוס,
// אותו ריווח. שתי הכרטסות משמשות את אותה מזכירה באותו יום.
//
// ⚠️ הגובה אחיד לכל הווריאנטים (py-1.5 + text-sm), ולכן כפתורים בשורה
// אחת מתיישרים לאותו קו בסיס גם כשיש בהם אייקון וגם כשאין.
// ─────────────────────────────────────────────────────────────────────────────

/** בסיס משותף — גובה, רדיוס, ריווח וטיפוגרפיה. אין להשתמש בו לבדו. */
export const HDR_BTN =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/** פעולה ראשית — עריכה. אחת בלבד בכותרת. */
export const HDR_PRIMARY = `${HDR_BTN} bg-indigo-600 text-white hover:bg-indigo-700`

/** פעולה משנית — ברירת המחדל לכל השאר. */
export const HDR_OUTLINE = `${HDR_BTN} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`

/** פעולה הרסנית — מחיקה. */
export const HDR_DANGER =
  `${HDR_BTN} border border-red-300 bg-white text-red-600 ` +
  'hover:border-red-600 hover:bg-red-600 hover:text-white'

/**
 * פעולה שממתינה לטיפול.
 *
 * ⚠️ מודגש בכוונה — זו אינדיקציה למשימה פתוחה ולא קישוט. משמש למשל
 * ב"תיקון שם" כשסומן "עדיין אין שם".
 */
export const HDR_ALERT = `${HDR_BTN} bg-amber-500 text-white hover:bg-amber-600`

/**
 * מעטפת שורת הכפתורים.
 *
 * ⚠️ flex-wrap נשמר: במסך צר השורה חייבת להישבר ולא לגלוש: אין גלילה
 * לרוחב בשום מקום במערכת. אבל ב-lg היא נשארת שורה אחת.
 */
export const HDR_ROW = 'flex flex-wrap items-center gap-2'
