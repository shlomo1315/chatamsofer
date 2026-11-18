// טעינה אוטומטית של תבנית "גיליון החתם סופר" בגיליון חדש, ואלמנטים מוכנים לפאנל העורך.

const DEFAULT_NAME = 'גיליון החתם סופר'

interface TemplateLike { name: string }
interface IssueLike { body_html?: string | null; intro?: string | null }

// גיליון חדש = אין בו עדיין גוף שמור ואין פתיח ישן. גיליון עם תוכן לעולם לא נדרס.
export function isNewIssue(issue: IssueLike): boolean {
  return !issue.body_html?.trim() && !issue.intro?.trim()
}

// התבנית שנטענת כברירת מחדל: זו ששמה מכיל "גיליון החתם סופר" (הראשונה ברשימה היא העדכנית ביותר).
// בלי התאמה בשם לא טוענים כלום, כדי לא לדרוס גיליון בתבנית אקראית.
export function pickDefaultTemplate<T extends TemplateLike>(templates: T[]): T | null {
  return templates.find(t => t.name.includes(DEFAULT_NAME)) ?? null
}

// התוכן בעורך ריק (אין טקסט, תמונה או קו מפריד).
export function isBlankHtml(html: string): boolean {
  return html.replace(/<[^>]+>|&nbsp;|\s/g, '') === '' && !/<(img|hr)\b/i.test(html)
}

export interface Snippet { key: string; label: string; html: string }

export const HEADING_SNIPPETS: Snippet[] = [
  { key: 'h1', label: 'כותרת ראשית', html: '<h1>כותרת ראשית</h1>' },
  { key: 'h2', label: 'כותרת', html: '<h2>כותרת</h2>' },
  { key: 'h3', label: 'כותרת משנה', html: '<h3>כותרת משנה</h3>' },
]

export const TEXT_SNIPPETS: Snippet[] = [
  { key: 'p', label: 'פסקה', html: '<p>כתבו כאן את הטקסט</p>' },
  { key: 'quote', label: 'ציטוט', html: '<blockquote>ציטוט</blockquote><p><br></p>' },
  { key: 'ul', label: 'רשימה', html: '<ul><li>פריט ראשון</li><li>פריט שני</li></ul><p><br></p>' },
  { key: 'ol', label: 'רשימה ממוספרת', html: '<ol><li>פריט ראשון</li><li>פריט שני</li></ol><p><br></p>' },
  { key: 'hr', label: 'קו מפריד', html: '<hr><p><br></p>' },
]

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// תמונה לגוף המייל: כתובת מלאה ורוחב מוגבל, כדי שתעבוד בתוכנות מייל.
export function imageHtml(src: string): string {
  return `<img src="${esc(src)}" alt="" style="display:block;width:100%;max-width:100%;height:auto;margin:0 auto 14px;"><p><br></p>`
}
