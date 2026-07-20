// דף הנחיות ליולדת — נשלח כצרופת PDF עם מייל אישור הלידה (לצד שוברי המזון וההבראה).
// אותו עיצוב בדיוק כמו שוברי היולדות (מייבא את העוזרים מ-maternityVoucher).
// רק בלידה רגילה (לא שקטה) — הטקסט מברך על הולדת התינוק.
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import {
  W, MX, H, NAVY, SUB, INK,
  type Ctx, loadLogo, drawHeader, centerText, rightText, paragraph, goldDivider,
} from './maternityVoucher'
import type { MailAttachment } from './sendMail'

const MATERNITY_EMAIL = 'y@chasamsofer.info'
const MATERNITY_PHONE = '03-309-6655'

export interface InstructionsSheetInput {
  familyName?: string     // שם משפחה — "לכבוד משפחת ..."
  babyName?: string       // שם התינוק
  babyGender?: string     // 'male' / 'female' / 'זכר' / 'נקבה' — לבחירת "הבן"/"הבת"
  recoveryDays?: number   // ימי הבראה שאושרו — משולב בסעיף פרטי הזכאות
}

// "הבן" / "הבת" לפי מגדר התינוק (ברירת מחדל: ניסוח ניטרלי)
function babyLabel(gender?: string): string {
  const g = (gender ?? '').toLowerCase().trim()
  if (g === 'male' || g === 'זכר' || g === 'בן') return 'הבן'
  if (g === 'female' || g === 'נקבה' || g === 'בת') return 'הבת'
  return 'הבן/בת'
}

// תשעת סעיפי ההנחיות. סעיף פרטי הזכאות מקבל את מספר ימי ההבראה בפועל.
function buildClauses(recoveryDays?: number): string[] {
  const daysText = typeof recoveryDays === 'number' && recoveryDays > 0
    ? `מימון של ${recoveryDays} ימי הבראה מלאים בחדר בסיסי בבית ההחלמה שנבחר.`
    : 'מימון ימי הבראה מלאים בחדר בסיסי בבית ההחלמה שנבחר.'
  return [
    'אישור: בקשתכם אושרה וניתן להתקדם להזמנת המקום.',
    `פרטי הזכאות: ${daysText}`,
    'כרטיס מזון: במידה והוגשה בקשה לכרטיס מזון (600 ש"ח), תישלח הודעה נפרדת בהמשך.',
    'ביצוע ההזמנה: מיוזמתכם, יש ליצור קשר ישיר מול בית ההחלמה המוזכר בטופס ולהזמין מקום.',
    'תוקף הבראה: את ימי ההבראה יש לנצל בתוך 5 שבועות מיום הלידה.',
    'חובת דיווח: בעת ההגעה לבית ההחלמה יש לדווח מיד בקבלה על הגעה דרך "היכל החתם סופר" ולמסור שם ומספר זהות/דרכון.',
    'אין החזר על תשלום שכבר שילמתם: התשלום שלנו מועבר ישירות לבית ההחלמה; אין לשלם באופן עצמאי ולא ניתן לקבל החזר רטרואקטיבי על תשלום אישי.',
    'מניעת כפל תמיכה: הסיוע תקף ללילות שאינם ממומנים במקביל מגורם אחר (כמו בית החולים), למעט החזר מקופות החולים שזה אפשרי.',
    'שדרוגים והוספת ימים: מימון מקביל או פרטי יכול לשמש לשדרוג תנאי החדר או להוספת לילות, אך לא ככפל תשלום על אותם ימים.',
  ]
}

/** בונה את דף ההנחיות כצרופת PDF. */
export async function buildInstructionsSheet(input: InstructionsSheetInput): Promise<MailAttachment> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  const logoBytes = loadLogo()
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null
  const page = doc.addPage([W, H])
  const c: Ctx = { page, font, logo }

  let y = drawHeader(c, 'אגף עזר ליולדות')

  // כותרת "דף הנחיות"
  y -= 18
  centerText(c, 'דף הנחיות', W / 2, y, 24, NAVY)
  y -= 12
  goldDivider(c, W / 2, y)
  y -= 30

  const xRight = W - MX
  const maxWidth = W - MX * 2

  // פתיח: "לכבוד משפחת ..." + ברכת מזל טוב
  const family = (input.familyName ?? '').trim()
  y = paragraph(c, family ? `לכבוד משפחת ${family},` : 'לכבוד המשפחה היקרה,', xRight, y, maxWidth, 14, INK, 6)
  y -= 4
  const baby = (input.babyName ?? '').trim()
  const mazal = `מזל טוב לרגל הולדת ${babyLabel(input.babyGender)}${baby ? ` ${baby}` : ''}!`
  y = paragraph(c, mazal, xRight, y, maxWidth, 15, NAVY, 6)
  y -= 8
  y = paragraph(c, 'להלן מספר הנחיות:', xRight, y, maxWidth, 13, INK, 6)
  y -= 10

  // תשעת הסעיפים הממוספרים
  const clauses = buildClauses(input.recoveryDays)
  const numW = 18  // רוחב שמור למספר הסעיף
  clauses.forEach((clause, i) => {
    const num = `${i + 1}.`
    // המספר מודפס נפרד מימין, והטקסט עוטף בעמודה שמשמאל לו
    rightText(c, num, xRight, y, 12, NAVY)
    y = paragraph(c, clause, xRight - numW, y, maxWidth - numW, 12, INK, 5)
    y -= 8
  })

  // דרכי התקשרות
  y -= 4
  y = paragraph(c,
    `דרכי התקשרות: לשאלות ובירורים אנו זמינים במייל ${MATERNITY_EMAIL} ובטלפון ${MATERNITY_PHONE} ` +
    `(עבור יולדות השוהות בפועל בבית ההחלמה, בימים א׳-ו׳ בשעות 10:30–13:00).`,
    xRight, y, maxWidth, 11, SUB, 5)
  y -= 18

  // חתימה
  y = paragraph(c, 'בברכה,', xRight, y, maxWidth, 13, NAVY, 4)
  y = paragraph(c, 'מחלקת יולדות', xRight, y, maxWidth, 13, NAVY, 4)
  y = paragraph(c, 'היכל החתם סופר', xRight, y, maxWidth, 13, NAVY, 4)

  // קו זהב מסיים בתחתית
  goldDivider(c, W / 2, 74, 90)

  const bytes = await doc.save()
  return {
    filename: 'דף-הנחיות.pdf',
    mimeType: 'application/pdf',
    contentB64: Buffer.from(bytes).toString('base64'),
  }
}
