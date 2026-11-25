// 🔴 כל מייל יוצא בפונט Heebo, עם גיבוי לפונט מערכת.
//
// מעטפת התבניות (shell ב-emailTemplates) כבר מגדירה Heebo, אבל חלק מהמיילים
// נבנים ישירות במסלול שלהם (יריד הספרים, הודעת איסוף ועוד) עם Arial או system-ui.
// במקום לרדוף אחרי כל מסלול, deliverMail מעביר כל מייל דרך כאן.
//
// ⚠️ Heebo נכתב בלי מרכאות כדי לא לשבור תכונת style שתחומה במרכאות בודדות.
// ⚠️ גופן קוד (monospace, למשל סיסמה זמנית) ו-inherit לא משתנים.

const FONT_DECL = /font-family\s*:\s*([^;"'}<>]*(?:'[^']*'[^;"'}<>]*)*)/gi
const KEEP = /heebo|monospace|courier|inherit/i
const HEEBO = 'Heebo,Arial,sans-serif'

export function withHeeboFont(html: string): string {
  if (!html) return html
  let out = html.replace(FONT_DECL, (all, value: string) =>
    KEEP.test(value) ? all : `font-family:Heebo,${value.replace(/^\s+/, '')}`)
  if (!/heebo/i.test(out)) {
    const open = `<div style="font-family:${HEEBO}">`
    const body = /<body[^>]*>/i.exec(out)
    out = body && /<\/body>/i.test(out)
      ? out.replace(body[0], body[0] + open).replace(/<\/body>/i, '</div></body>')
      : open + out + '</div>'
  }
  return out
}
