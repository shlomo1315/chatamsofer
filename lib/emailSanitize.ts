// ─────────────────────────────────────────────────────────────────────────────
// ניקוי אחרון של מייל יוצא, בנקודה אחת שכל מסלולי השליחה עוברים בה.
//
// 🔴 למה: קמפיין חנוכה תשפ"ז הגיע לספאם, והתוכן שהודבק לעורך היה מלא רצפים של
// U+200B (רווח ברוחב אפס). תווים בלתי נראים בגוף ובנושא הם סימן מוכר של ספאם
// (מסתירים מילים מהמסננים), ולכן מנקים אותם לפני כל שליחה, גם מתוכן חופשי
// שהמשתמש הדביק.
//
// ⚠️ לא מסירים את U+200D (ZWJ): הוא מחבר אימוג'י מורכבים, ובלעדיו הם מתפרקים.
// ⚠️ לא מסירים RLM/LRM ותווי כיוון: הם קובעים את סדר התצוגה של טקסט מעורב
// עברית-אנגלית, והסרתם הייתה משבשת מספרים וכתובות בתוך משפט.
// ─────────────────────────────────────────────────────────────────────────────

// U+200B רווח ברוחב אפס · U+2060 מחבר מילים · U+FEFF BOM · U+180E מפריד מונגולי
// (נבנה מקודים מספריים ולא כתווים בקוד, כי תו בלתי נראה בקובץ לא ניתן לקריאה)
export const INVISIBLE_CODES = [0x200b, 0x2060, 0xfeff, 0x180e]
const INVISIBLE = new RegExp(`[${String.fromCharCode(...INVISIBLE_CODES)}]`, 'g')
// אותם תווים כישויות HTML (&#8203; · &#x200b; · &ZeroWidthSpace;)
const INVISIBLE_ENTITY = /&#(?:8203|8288|65279|6158|x200b|x2060|xfeff|x180e);|&ZeroWidthSpace;/gi

/** מסיר תווים בלתי נראים מטקסט רגיל (נושא, גרסת הטקסט). */
export function stripInvisibleChars(s: string): string {
  return String(s ?? '').replace(INVISIBLE, '')
}

/** מנקה את ה-HTML של מייל יוצא מתווים בלתי נראים, גם כשהם כתובים כישויות. */
export function cleanOutgoingHtml(html: string): string {
  return stripInvisibleChars(html).replace(INVISIBLE_ENTITY, '')
}

/**
 * טקסט התצוגה המקדימה (preheader) שתוכנות הדואר מציגות ליד הנושא.
 *
 * 🔴 בעבר: font-size:1px וצבע זהה לרקע. זה בדיוק הדפוס של "טקסט מוסתר"
 * שמסנני ספאם מחפשים. עכשיו רק display:none הסטנדרטי (כמו בכל מערכות
 * הדיוור), ובלי preheader לא נכתב שום אלמנט נסתר.
 */
export function preheaderHtml(safeText: string): string {
  const t = String(safeText ?? '').trim()
  if (!t) return ''
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${t}</div>`
}
