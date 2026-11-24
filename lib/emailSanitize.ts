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

/**
 * נושא מייל יוצא: בלי תווים בלתי נראים, וסימני קריאה/שאלה כפולים מצומצמים לאחד.
 * "!!!" בנושא הוא אחד הסימנים הוותיקים ביותר שמסנני ספאם בודקים.
 */
export function cleanSubject(s: string): string {
  return stripInvisibleChars(s).replace(/([!?])\1+/g, '$1').replace(/\s{2,}/g, ' ').trim()
}

/**
 * גרסת טקסט רגיל של המייל (חלק text/plain לצד ה-HTML).
 * מייל עם HTML בלבד נראה יותר כמו ספאם. קישורים נשמרים כ"טקסט: כתובת".
 */
export function emailPlainText(html: string): string {
  return cleanOutgoingHtml(html)
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div style="display:none[^"]*">[\s\S]*?<\/div>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const l = label.replace(/<[^>]+>/g, '').trim()
      return l && l !== href ? `${l}: ${href}` : href
    })
    .replace(/<br\s*\/?>|<\/(p|h1|h2|h3|li|tr|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Gmail חותך מייל שה-HTML שלו מעל ~102KB ("[ההודעה נחתכה]"), ומייל ענק נחשד יותר
export const MAX_HTML_BYTES = 100 * 1024

/**
 * בדיקת מייל יוצא מול כללי הספאם שאפשר לאכוף בקוד. מחזירה רשימת בעיות (ריקה = תקין).
 * משמשת את lib/emailOutbound.test.ts, שמריץ את כל בוני המיילים של המערכת.
 */
export function auditOutgoingMail(html: string, subject = ''): string[] {
  const problems: string[] = []
  const invisible = new RegExp(`[${String.fromCharCode(...INVISIBLE_CODES)}]`)
  if (invisible.test(html) || /&#(?:8203|x200b);|&ZeroWidthSpace;/i.test(html)) problems.push('תווים בלתי נראים בגוף')
  if (invisible.test(subject)) problems.push('תווים בלתי נראים בנושא')
  if (/([!?])\1/.test(subject)) problems.push('סימני קריאה/שאלה כפולים בנושא')
  if (/font-size:\s*[01]px/i.test(html.replace(/font-size:0;line-height:0;">&nbsp;/g, ''))) problems.push('טקסט בגופן 0-1px')
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) problems.push('HTML גדול מ-100KB')
  const text = emailPlainText(html)
  if (text.length < 20) problems.push('אין כמעט טקסט (מייל של תמונה בלבד)')
  // כותרת שעוטפת את רוב התוכן: סכום הטקסט בתגיות h1-h6 מעל חצי מטקסט המייל
  const headingText = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map(m => emailPlainText(m[1])).join('').length
  if (text.length > 200 && headingText > text.length / 2) problems.push('תגית כותרת עוטפת את רוב התוכן')
  return problems
}
