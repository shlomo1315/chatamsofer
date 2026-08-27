// ─────────────────────────────────────────────────────────────────────────────
// הורדה מרוכזת של מכתבי הברכה — כל ברכה בדף נפרד, בעיצוב הבלאנק.
//
// 🔴 עד כה ההורדה המרוכזת ייצרה *רשימה מנהלית* (lib/gratitudeBatchPdf):
// כרטיסים דחוסים ברצף, כמה בעמוד, עם תגיות "נשלח לנדיב" ושורות מטא. זה
// נועד למעקב פנימי — אבל מי שמוסר את הברכות לנדיב צריך את המכתב המעוצב,
// בדיוק כפי שהוא נשלח בברכה בודדת.
//
// 🔴 שום דבר כאן אינו מצייר בעצמו. הקובץ קורא ל-renderGratitudeLetter — אותה
// לוגיקת ציור של הברכה הבודדת (gratitudeVoucher.ts) — ומצייר כל ברכה לתוך
// עמוד (או עמודים) במסמך המרוכז. שכפול העיצוב היה מבטיח שכל שינוי בבלאנק
// יישכח כאן, והברכה המרוכזת הייתה נראית אחרת מזו שהנדיב כבר קיבל.
//
// ⚠️ גם המיפוי מהמסד אינו משוכפל: voucherInputFromRow היא אותה פונקציה
// שמזינה את הברכה הבודדת, ולכן העיר, הת"ז וימי ההחלמה מגיעים בדיוק כמו
// שם — כולל תיקונים עתידיים.
// ─────────────────────────────────────────────────────────────────────────────
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { loadLogo } from './maternityVoucher'
import { renderGratitudeLetter } from './gratitudeVoucher'
import { voucherInputFromRow, type GratitudeLetterRow } from '@/app/api/admin/gratitude/[id]/shared'
import { selectBatch, type BatchFilters } from './gratitudeBatch'

export interface BatchLettersInput {
  letters: GratitudeLetterRow[]
  filters: BatchFilters
}

/**
 * ברכה אנונימית — פרטי המשפחה יורדים מהמכתב.
 *
 * 🔴 הקובץ נמסר לנדיב. היולדת ביקשה במפורש שלא להזדהות, ולכן החתימה,
 * הת"ז והכתובת אינן נכנסות למכתב שלה. הברכה עצמה כן — היא העיקר.
 */
function inputFor(row: GratitudeLetterRow) {
  const base = voucherInputFromRow(row)
  if (!row.is_anonymous) return base
  return {
    ...base,
    familyName: undefined, husbandName: undefined, wifeName: undefined,
    city: undefined, street: undefined, husbandId: undefined, wifeId: undefined,
    // ⚠️ גם שדה החתימה עצמו — אחרת חתימה שהמזכירות מילאה ידנית הייתה
    // חושפת את זהות המשפחה בדיוק במכתב שבו היא ביקשה שלא להזדהות.
    signature: undefined,
  }
}

/**
 * בונה את הקובץ המרוכז: כל ברכה כמכתב מעוצב, בדף (או דפים) משלה.
 *
 * ⚠️ מסמך PDF אחד עם פונט מוטמע פעם אחת ורק אז מציירים כל המכתבים ישירות לתוכו
 * — לא יוצרים מסמך+פונט נפרדים לכל מכתב וממזגים דרך copyPages. הטמעת (subset) של
 * פונט העברית יקרה יחסית, וחזרה עליה עשרות פעמים ברצף אחד היא שהעמיסה על השרת
 * בפועל עד כשל בקובץ המרוכז.
 *
 * ⚠️ כל ברכה נבנית בנפרד ובזהירות: תוכן חריג בברכה אחת (למשל טקסט
 * שבור שהתקבל במייל) לא אמור להפיל את כל הקובץ ולמנוע ממאות משפחות
 * אחרות לצאת. הכשל מתועד ללוג כדי שאפשר יהיה לאתר ולתקן את הרשומה.
 */
export async function buildGratitudeBatchLetters(input: BatchLettersInput): Promise<Uint8Array> {
  const rows = selectBatch(input.letters, input.filters)
  const out = await PDFDocument.create()
  out.registerFontkit(fontkit)
  const font = await out.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  const logoBytes = loadLogo()
  const logo = logoBytes ? await out.embedPng(logoBytes) : null

  for (const row of rows) {
    try {
      await renderGratitudeLetter(out, font, logo, inputFor(row))
    } catch (e) {
      console.error(`[gratitude-batch] דילוג על ברכה ${row.id} — בנייתה נכשלה:`, e instanceof Error ? e.message : e)
    }
  }

  // ⚠️ PDF חייב עמוד אחד לפחות: מסמך בלי עמודים נפתח כ"קובץ פגום", והמשתמש
  // מדווח על תקלה במקום לראות שהסינון לא החזיר כלום. עמוד ריק אחד הוא
  // הפשרה — הכפתור ממילא חסום כשאין ברכות בתצוגה המקדימה.
  if (out.getPageCount() === 0) out.addPage()

  return out.save()
}
