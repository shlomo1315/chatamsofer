// ─────────────────────────────────────────────────────────────────────────────
// עיצוב טקסט בנוסחי המייל — הדגשה וקישורים.
//
// 🔴 למה סימון ולא HTML: הטקסט נערך במסך ההגדרות ונשלח לאלפי נמענים.
// שמירת HTML גולמי הייתה פותחת הזרקה דרך שדה שכל מזכיר יכול לערוך.
// כאן נשמר טקסט רגיל עם סימון מצומצם, וההמרה ל-HTML נעשית פעם אחת,
// אחרי ניטרול מלא.
//
// התחביר:
//   **טקסט**            → מודגש
//   [טקסט](https://...)  → קישור
//
// ⚠️ תאימות לאחור מוחלטת: טקסט בלי סימון מתנהג בדיוק כמו קודם. כל
// הנוסחים הקיימים ממשיכים להיראות זהה — ראו textToHtml.
// ─────────────────────────────────────────────────────────────────────────────
import { escapeHtml } from './emailTemplates'

/**
 * כתובות מותרות בקישור.
 *
 * 🔴 javascript: ו-data: חסומות. הן נראות ככתובת תקינה לחלוטין בשדה
 * הטקסט, ומריצות קוד אצל מי שלוחץ.
 */
function safeUrl(raw: string): string | null {
  const u = raw.trim()
  if (!u) return null
  // ⚠️ mailto מותר — הנוסחים משתמשים בו לפנייה לאגפים.
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u
  return null
}

/** קטע טקסט אחרי הפירוק — לפני ההמרה ל-HTML. */
type Token =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'link'; value: string; url: string }

/**
 * פירוק הסימון לקטעים.
 *
 * ⚠️ מעבר יחיד ולא replace משורשר: החלפה אחרי החלפה הייתה מאפשרת
 * לסימון שנוצר משלב קודם להתפרש בשלב הבא.
 */
export function parseRich(input: string): Token[] {
  const s = String(input ?? '')
  const out: Token[] = []
  let buf = ''
  let i = 0

  const flush = () => { if (buf) { out.push({ kind: 'text', value: buf }); buf = '' } }

  while (i < s.length) {
    // [טקסט](כתובת)
    if (s[i] === '[') {
      const close = s.indexOf(']', i + 1)
      if (close > i && s[close + 1] === '(') {
        const end = s.indexOf(')', close + 2)
        if (end > close) {
          const label = s.slice(i + 1, close)
          const url = safeUrl(s.slice(close + 2, end))
          // ⚠️ כתובת פסולה → נשאר טקסט רגיל, ולא נעלם. מחיקה שקטה של
          // מה שהמזכיר הקליד גרועה יותר מהצגתו כטקסט.
          if (url && label) {
            flush()
            out.push({ kind: 'link', value: label, url })
            i = end + 1
            continue
          }
        }
      }
    }

    // **מודגש**
    if (s[i] === '*' && s[i + 1] === '*') {
      const end = s.indexOf('**', i + 2)
      if (end > i + 2) {
        const inner = s.slice(i + 2, end)
        // ⚠️ בלי ירידת שורה בתוך ההדגשה: כוכביות שנותרו בטקסט ישן
        // (רשימות, הדגשה ידנית) לא ייבלעו לתוך פסקה שלמה.
        if (!inner.includes('\n')) {
          flush()
          out.push({ kind: 'bold', value: inner })
          i = end + 2
          continue
        }
      }
    }

    buf += s[i]
    i++
  }
  flush()
  return out
}

/**
 * טקסט עם סימון → HTML בטוח, כולל שבירות שורה.
 *
 * ⚠️ הניטרול קודם להמרה — כמו ב-textToHtml המקורי. ההפך היה מאפשר
 * להזריק HTML דרך הנוסח שנערך במסך ההגדרות.
 */
export function richToHtml(input: string): string {
  const br = (v: string) => escapeHtml(v).replace(/\r?\n/g, '<br/>')
  return parseRich(String(input ?? '').trim()).map(t => {
    if (t.kind === 'bold') return `<strong>${br(t.value)}</strong>`
    if (t.kind === 'link') {
      // ⚠️ target+rel: המייל נפתח בדפדפן, וקישור בלי noopener משאיר
      // לדף היעד גישה לחלון שממנו נפתח.
      return `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;text-decoration:underline">${br(t.value)}</a>`
    }
    return br(t.value)
  }).join('')
}

/**
 * טקסט עם סימון → טקסט נקי, לגרסת ה-plain של המייל.
 *
 * ⚠️ הקישור מוצג כ"טקסט (כתובת)": בגרסת הטקסט אין מה ללחוץ, ובלי
 * הכתובת המפורשת הנמען מקבל הפניה למקום שאינו יכול להגיע אליו.
 */
export function richToPlain(input: string): string {
  return parseRich(input).map(t =>
    t.kind === 'link' ? `${t.value} (${t.url})` : t.value,
  ).join('')
}

/** האם יש בטקסט סימון כלשהו — לתצוגת רמז בעורך. */
export function hasRichMarkup(input: string): boolean {
  return parseRich(input).some(t => t.kind !== 'text')
}
