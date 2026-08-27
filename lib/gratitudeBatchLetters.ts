// ─────────────────────────────────────────────────────────────────────────────
// הורדה מרוכזת של מכתבי הברכה — כל ברכה בדף נפרד, בעיצוב הבלאנק.
//
// 🔴 עד כה ההורדה המרוכזת ייצרה *רשימה מנהלית* (lib/gratitudeBatchPdf):
// כרטיסים דחוסים ברצף, כמה בעמוד, עם תגיות "נשלח לנדיב" ושורות מטא. זה
// נועד למעקב פנימי — אבל מי שמוסר את הברכות לנדיב צריך את המכתב המעוצב,
// בדיוק כפי שהוא נשלח בברכה בודדת.
//
// 🔴 שום דבר כאן אינו מצייר. הקובץ קורא ל-buildGratitudeVoucher — *אותו*
// מחולל של הברכה הבודדת — וממזג את העמודים. שכפול העיצוב היה מבטיח שכל
// שינוי בבלאנק יישכח כאן, והברכה המרוכזת הייתה נראית אחרת מזו שהנדיב
// כבר קיבל.
//
// ⚠️ גם המיפוי מהמסד אינו משוכפל: voucherInputFromRow היא אותה פונקציה
// שמזינה את הברכה הבודדת, ולכן העיר, הת"ז וימי ההחלמה מגיעים בדיוק כמו
// שם — כולל תיקונים עתידיים.
// ─────────────────────────────────────────────────────────────────────────────
import { PDFDocument } from 'pdf-lib'
import { buildGratitudeVoucher } from './gratitudeVoucher'
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
 * ⚠️ ברכה ארוכה שגולשת לדף שני שומרת על הרצף — כל עמודי המכתב נכנסים
 * יחד לפני שהמכתב הבא מתחיל.
 */
export async function buildGratitudeBatchLetters(input: BatchLettersInput): Promise<Uint8Array> {
  const rows = selectBatch(input.letters, input.filters)
  const out = await PDFDocument.create()

  // ⚠️ כל ברכה נבנית בנפרד ובזהירות: תוכן חריג בברכה אחת (למשל טקסט
  // שבור שהתקבל במייל) לא אמור להפיל את כל הקובץ ולמנוע ממאות משפחות
  // אחרות לצאת. הכשל מתועד ללוג כדי שאפשר יהיה לאתר ולתקן את הרשומה.
  for (const row of rows) {
    try {
      const voucher = await buildGratitudeVoucher(inputFor(row))
      const src = await PDFDocument.load(Buffer.from(voucher.contentB64, 'base64'))
      const pages = await out.copyPages(src, src.getPageIndices())
      for (const p of pages) out.addPage(p)
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
