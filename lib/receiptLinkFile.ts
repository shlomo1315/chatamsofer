// משיכת קבלה מקישור — איתור הקובץ עצמו בתוך עמוד נחיתה.
// הופרד מ-api/portal/recovery-receipt כדי שאפשר יהיה לבדוק אותו (קובץ route אינו
// רשאי לייצא פונקציות נוספות).
//
// ⚠️ קישורי הקבלות שנשלחים לבתי ההחלמה הם קודים מקוצרים שמובילים לעמוד צפייה,
// לא לקובץ עצמו. בלי השלב הזה הנציג מקבל "סוג הקובץ אינו נתמך" על קישור
// שלגמרי עובד בדפדפן שלו — וזה נראה כמו תקלה שרירותית.

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EZcount (secure.ezgo.co.il) — החשבונית היא דף HTML, וה-PDF בכתובת אחות.
//
// ⚠️ הבאג שזה סוגר: עמוד החשבונית של EZcount מצויר כ-HTML, והקובץ הראשון
// שנראה כמו תמונה בעמוד הוא הלוגו של העסק (Images/<id>/Logo.png). השלב
// "קישור שנראה כמו קובץ" לקח אותו — וכל החשבוניות של "ביכורים" נשמרו כאותו
// PNG של 4,578 בייט: הלוגו, בלי שום חשבונית. במסך נראה "רק לוגו".
//
// כפתור ההורדה בעמוד מפנה ל-/Main/Invoice_Pdf עם אותו קוד, שמחזיר PDF ישירות.
// ─────────────────────────────────────────────────────────────────────────────
export function knownPdfUrl(u: URL): string | null {
  if (/(^|\.)ezgo\.co\.il$/i.test(u.hostname) && /^\/Main\/Inv(oice)?$/i.test(u.pathname) && u.search.length > 1) {
    return `${u.origin}/Main/Invoice_Pdf${u.search}`
  }
  return null
}

// לוגו / סמל / חתימה — עיטורי עמוד, לעולם לא המסמך עצמו.
const DECORATION = /(logo|favicon|icon|sprite|signature|banner|header|avatar|\.svg)(?![^/]*\/)/i

export function findFileInHtml(html: string, base: URL): string | null {
  const abs = (v: string): string | null => {
    try { return new URL(v.replace(/&amp;/g, '&').trim(), base).toString() } catch { return null }
  }
  const isPdf = (v: string) => /\.pdf(\?|#|$)/i.test(v)
  const isImage = (v: string) => /\.(jpe?g|png|webp|gif|heic)(\?|#|$)/i.test(v)
  const attrs = [...html.matchAll(/(?:href|src|data|content)\s*=\s*["']([^"']+)["']/gi)].map(m => m[1])

  // 🔴 הסדר הוא העיקר: PDF ← מסגרת שעוטפת את המסמך ← רק בסוף תמונה.
  // ⚠️ קודם תמונה ו-PDF היו באותה עדיפות, והראשון בעמוד ניצח — כלומר הלוגו
  // שבראש החשבונית. תמונה נשקלת רק אם אינה עיטור (לוגו / חתימה / סמל).

  // 1) PDF — בתגית, ואחר כך גם מחוץ לה (למשל בתוך JS)
  for (const v of attrs) if (isPdf(v)) { const a = abs(v); if (a) return a }
  const rawPdf = html.match(/https?:\/\/[^\s"'<>]+\.pdf(?:\?[^\s"'<>]*)?/i)
  if (rawPdf) return rawPdf[0]
  // 2) הפניה אוטומטית / מסגרת — העמוד עצמו רק עוטף את הקובץ
  const meta = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url=([^"';]+)/i)
  if (meta) return abs(meta[1])
  const frame = html.match(/<(?:iframe|embed)[^>]+src\s*=\s*["']([^"']+)["']/i)
    ?? html.match(/<object[^>]+data\s*=\s*["']([^"']+)["']/i)
  if (frame) return abs(frame[1])
  // 3) תמונה שאינה עיטור
  for (const v of attrs) if (isImage(v) && !DECORATION.test(v)) { const a = abs(v); if (a) return a }
  return null
}
