// ─────────────────────────────────────────────────────────────────────────────
// טופס בקשת הלוואה לחתימת רב — הטמעת השדות על הבלאנק המעוצב.
//
// 🔴 מה זה פותר: עד היום המבקש הוריד טופס ריק ומילא בכתב יד את שמו, ת"ז,
// הסכום, וסדר הדורות — ואז החתים רב. כל שדה בכתב יד הוא מקום שבו המידע
// יכול לסתור את מה שרשום במערכת, ואז המזכירות צריכה להכריע מה נכון.
//
// כאן כל מה שהמערכת יודעת מודפס מראש, והרב חותם על נתונים שכבר אומתו.
// נשארים ריקים רק השדות שהם *שלו*: שם, טלפון, חותמת וחתימה.
//
// ⚠️ הטקסט מוטמע על ה-PDF המעוצב ולא מצויר מאפס: הבלאנק כולל רקע, פרגמנט
// זהוב ורשימת צאצאים — נכסים גרפיים שאי אפשר לשחזר בקוד, וכל ניסיון היה
// מייצר טופס שנראה אחרת מזה שהמשרד מכיר.
// ─────────────────────────────────────────────────────────────────────────────

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'fs/promises'
import path from 'path'

/** כתובת הגמ"ח שמודפסת בפוטר, במקום זו שבבלאנק. */
export const GEMACH_EMAIL = 'g@chasamsofer.info'

const BLANK_PATH = path.join(process.cwd(), 'public', 'forms', 'loan-form-blank.pdf')
/** פונט עברי מקומי — ראה loadFonts להסבר למה לא מ-CDN. */
const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'Heebo.ttf')

export interface RabbiFormData {
  applicantName: string
  idNumber: string
  /** סכום מבוקש בדולרים. */
  amount: number
  installments: number
  /**
   * סדר הדורות מהמבקש כלפי מעלה, עד החת"ם סופר.
   *
   * ⚠️ מחרוזת = שם בלבד, בלי כינוי קשר. אובייקט = שם + הכינוי כפי
   * שהוא רשום במערכת ("בן", "חתן"). כשהקשר אינו ידוע לא מודפס כלום,
   * כי שורה עם כינוי שגוי מטעה יותר משורה בלי כינוי.
   */
  lineage: (string | { name: string; relation?: string })[]
}

/**
 * בונה את סדר הדורות לטופס מתוך lineage_chain של המוטב.
 *
 * ⚠️ הסדר הוא **מהחת"ם סופר כלפי מטה** — דור 1 בראש והמבקש בתחתית.
 * זהו הסדר שבו קוראים ייחוס, וזה גם מה שהרב מצפה לראות כשהוא מאמת
 * את השרשרת: מתחילים מהשורש ויורדים.
 *
 * ⚠️ הכינוי ("בן"/"חתן") נלקח מהרשומה כפי שהוא. כשאינו ידוע לא מודפס
 * כלום — שורה עם כינוי שגוי מטעה יותר משורה בלי כינוי.
 */
export function lineageFromChain(chain: unknown): RabbiFormData['lineage'] {
  if (!Array.isArray(chain)) return []
  const REL: Record<string, string> = { son: 'בן', son_in_law: 'חתן' }

  const rows = (chain as { name?: string; generation?: number; relation?: string }[])
    .map(n => ({
      name: String(n?.name ?? '').trim(),
      generation: Number(n?.generation ?? 0),
      relation: REL[String(n?.relation ?? '')] ?? '',
    }))
    .filter(r => r.name)

  // ⚠️ ממוין לפי מספר הדור ולא נשען על סדר המערך: השרשרת נבנית ממקורות
  // שונים (שרשור ידני, גזירה מהעץ) ואינה מובטחת ממוינת.
  rows.sort((a, b) => a.generation - b.generation)
  return rows.map(({ name, relation }) => ({ name, relation }))
}

export interface FormValidation { ok: boolean; missing: string[] }

/**
 * בדיקת שלמות לפני הפקה.
 *
 * 🔴 הטופס אינו מופק חלקית. טופס עם שדה ריק מגיע לרב, הוא חותם עליו,
 * והמסמך החתום אינו תואם את הבקשה — ואז אין דרך לתקן בלי להחתים שוב.
 *
 * ⚠️ הסיבות מוחזרות בנפרד ולא כ"הטופס אינו מלא": המבקש צריך לדעת *מה*
 * חסר, אחרת הוא מנחש ומנסה שוב.
 */
export function validateRabbiForm(d: Partial<RabbiFormData>): FormValidation {
  const missing: string[] = []
  if (!String(d.applicantName ?? '').trim()) missing.push('שם המבקש')
  if (!String(d.idNumber ?? '').trim()) missing.push('מספר תעודת זהות')
  if (!d.amount || Number(d.amount) <= 0) missing.push('סכום ההלוואה המבוקש')
  if (!d.installments || Number(d.installments) <= 0) missing.push('מספר התשלומים')
  // ⚠️ סדר הדורות הוא לב הטופס: הרב מאשר את הייחוס, ובלי השרשרת אין על
  // מה לחתום.
  if (!Array.isArray(d.lineage) || d.lineage.length === 0) missing.push('סדר הדורות עד רבינו החתם סופר')
  return { ok: missing.length === 0, missing }
}

/**
 * 🔴 אין היפוך. הפונקציה מחזירה את הטקסט כפי שהוא.
 *
 * ההנחה הקודמת הייתה ש-pdf-lib מצייר תווים לפי סדר הבייטים ולכן עברית
 * מופיעה הפוכה — ולכן הטקסט הופך ידנית לפני הציור. זה היה נכון לפונטים
 * הסטנדרטיים, אבל **לא** לפונט TrueType מוטמע: Heebo נושא את טבלאות
 * ה-cmap שלו, והדפדפן מסדר את הגליפים נכון בעצמו.
 *
 * התוצאה הייתה היפוך כפול — כל המלל הופיע הפוך משמאל לימין.
 * אומת בניסוי: "שלום עולם" מצויר ישירות נקרא נכון, ואילו המחרוזת
 * ההפוכה נקראה "םלוע םולש".
 *
 * ⚠️ נשארת כפונקציה ולא מוסרת לגמרי: היא נקראת ב-9 מקומות, ושמירתה
 * כנקודה אחת מתעדת *למה* אין היפוך — אחרת מישהו יחזיר אותו.
 */
function rtl(text: string): string {
  return String(text ?? '')
}

/**
 * מיקומי השדות על הבלאנק.
 *
 * ⚠️ ניתנים לעריכה מההגדרות ונשמרים ב-app_settings: הבלאנק עשוי להתחלף
 * (עדכון עיצוב, שינוי לוגו), ובלי כיול מהממשק כל שינוי כזה מחייב פריסה.
 * הערכים כאן הם ברירת המחדל.
 */
export interface FieldPos { x: number; y: number; size: number }
export interface FormLayout {
  title: FieldPos
  name: FieldPos
  idNumber: FieldPos
  amount: FieldPos
  installments: FieldPos
  currencyNote: FieldPos
  lineageTitle: FieldPos
  lineageStart: FieldPos
  /** מרווח אנכי בין שורות הדורות. */
  lineageGap: number
  /** ⚠️ עמודות המספר והכינוי — דחופות שמאלה כדי לא לעלות על עיטורי
   *  הצד של הבלאנק. הערכים הקודמים (70 ו-95) ישבו על העיטור. */
  lineageNumX: number
  lineageRelX: number
  rabbiTitle: FieldPos
  rabbiText: FieldPos
  rabbiName: FieldPos
  rabbiPhone: FieldPos
  rabbiStamp: FieldPos
  instructions: FieldPos
  email: FieldPos
}

/** ⚠️ הקואורדינטות ב-pdf-lib נמדדות מהפינה השמאלית-*תחתונה*. */
export const DEFAULT_LAYOUT: FormLayout = {
  // ⚠️ הקצה הימני הוא 400 ולא 540: הבלאנק נושא עמוד עיטורי מוזהב לאורך
  // כל הצד הימני (רשימת הדורות המעוצבת), ו-540 הציב את כל המלל *על גבי*
  // העיטור — הטקסט והרקע נקראו זה על זה ושניהם היו בלתי קריאים.
  // 400 הוא הגבול שבו העיטור מסתיים והשטח הלבן מתחיל.
  title:        { x: 300, y: 690, size: 20 },
  name:         { x: 400, y: 645, size: 12 },
  idNumber:     { x: 400, y: 620, size: 12 },
  amount:       { x: 400, y: 585, size: 12 },
  installments: { x: 400, y: 560, size: 12 },
  currencyNote: { x: 400, y: 542, size: 8 },
  lineageTitle: { x: 400, y: 512, size: 12 },
  lineageStart: { x: 400, y: 488, size: 10 },
  lineageNumX:  42,
  lineageRelX:  60,
  lineageGap:   18,
  rabbiTitle:   { x: 300, y: 290, size: 14 },
  rabbiText:    { x: 540, y: 258, size: 10 },
  rabbiName:    { x: 540, y: 215, size: 11 },
  rabbiPhone:   { x: 540, y: 190, size: 11 },
  rabbiStamp:   { x: 540, y: 165, size: 11 },
  instructions: { x: 300, y: 110, size: 9 },
  email:        { x: 300, y: 22, size: 10 },
}

/** טוען Heebo; בכשל רשת נופל לגופן סטנדרטי כדי שהטופס ייווצר בכל מקרה. */
/**
 * 🔴 הפונט נטען מהדיסק ולא מ-CDN.
 *
 * הגרסה הקודמת עשתה fetch ל-fonts.gstatic.com בזמן הבקשה, ובכשל רשת
 * נפלה לאחור ל-Helvetica. אבל Helvetica היא WinAnsi ו*אינה יכולה לקודד
 * עברית* — היא זורקת `WinAnsi cannot encode "ה"`. כלומר הנפילה-לאחור לא
 * הצילה כלום: היא רק הפכה כשל רשת לכשל הפקה, והטופס לא נוצר כלל.
 *
 * ⚠️ אין כאן fallback בכוונה: טופס בלי עברית הוא חסר ערך, ועדיף שהשגיאה
 * תהיה מפורשת ותופיע בלוגים מאשר שתיפול בשקט למשהו שממילא ייכשל.
 */
async function loadFonts(pdf: PDFDocument): Promise<{ font: PDFFont; bold: PDFFont }> {
  const bytes = await readFile(FONT_PATH)
  // ⚠️ שתי הטמעות נפרדות של אותו קובץ — ולא אותו אובייקט פעמיים.
  // הקוד מבחין בין רגיל למודגש לפי זהות האובייקט (f === bold), ואילו
  // היה זה אותו מופע, *כל* הטקסט היה נצבע כמודגש.
  // subset: true — מטמיע רק את התווים בשימוש, במקום 122KB לכל טופס.
  const font = await pdf.embedFont(bytes, { subset: true })
  const bold = await pdf.embedFont(bytes, { subset: true })
  return { font, bold }
}

export async function buildRabbiFormPdf(
  data: RabbiFormData,
  layout: FormLayout = DEFAULT_LAYOUT,
): Promise<Uint8Array> {
  const blank = await readFile(BLANK_PATH)
  const pdf = await PDFDocument.load(blank)
  pdf.registerFontkit(fontkit)

  const { font, bold } = await loadFonts(pdf)
  const page: PDFPage = pdf.getPage(0)
  const { width } = page.getSize()

  const DARK = rgb(0.15, 0.11, 0.06)
  const GOLD = rgb(0.42, 0.29, 0.09)
  const GREY = rgb(0.38, 0.33, 0.26)
  const LINE = rgb(0.62, 0.55, 0.44)

  /**
   * ציור טקסט. כש-f הוא ה"מודגש" — מצויר פעמיים בהיסט זעיר.
   *
   * ⚠️ Heebo כאן הוא פונט משתנה (variable), ו-pdf-lib מטמיע ממנו משקל
   * אחד בלבד. בלי ההדגשה הסינתטית הזו כל הכותרות והתוויות היו נראות
   * זהות לטקסט הרגיל, והטופס היה מאבד את ההיררכיה שלו.
   */
  const draw = (s: string, x: number, y: number, size: number, f: PDFFont, c: typeof DARK) => {
    page.drawText(s, { x, y, size, font: f, color: c })
    if (f === bold) page.drawText(s, { x: x + 0.35, y, size, font: f, color: c })
  }

  /** טקסט עברי מיושר לימין (x = הקצה הימני). */
  const R = (t: string, p: FieldPos, f = font, c = DARK) => {
    if (!t) return
    const s = rtl(t)
    draw(s, p.x - f.widthOfTextAtSize(s, p.size), p.y, p.size, f, c)
  }
  /** טקסט ממורכז סביב x. */
  const C = (t: string, p: FieldPos, f = font, c = DARK) => {
    if (!t) return
    const s = rtl(t)
    draw(s, p.x - f.widthOfTextAtSize(s, p.size) / 2, p.y, p.size, f, c)
  }
  /** ערך לטיני/מספרי — בלי היפוך, מיושר לשמאל מנקודת ההתחלה. */
  const L = (t: string, x: number, y: number, size: number, f = font, c = DARK) => {
    if (!t) return
    draw(String(t), x, y, size, f, c)
  }
  /** קו מילוי לשדה שנשאר ריק לחתימה. */
  const dash = (fromX: number, toX: number, y: number) =>
    page.drawLine({ start: { x: fromX, y }, end: { x: toX, y }, thickness: 0.7, color: LINE })

  // ── כותרת ──
  C('טופס בקשת הלוואה', layout.title, bold, GOLD)

  // ── פרטי המבקש ──
  // ⚠️ התווית והערך נכתבים יחד ולא כשדה עם קו: הבלאנק ריק לגמרי באזור
  // הזה, ולכן אין קו קיים שהערך צריך לשבת עליו.
  const labeled = (label: string, value: string, p: FieldPos, numeric = false) => {
    const lbl = rtl(label)
    const lw = bold.widthOfTextAtSize(lbl, p.size)
    draw(lbl, p.x - lw, p.y, p.size, bold, DARK)
    if (!value) return
    const vx = p.x - lw - 8
    if (numeric) {
      L(value, vx - font.widthOfTextAtSize(value, p.size), p.y, p.size)
    } else {
      const v = rtl(value)
      page.drawText(v, { x: vx - font.widthOfTextAtSize(v, p.size), y: p.y, size: p.size, font, color: DARK })
    }
  }

  labeled('שם המבקש:', data.applicantName, layout.name)
  labeled('מספר זהות:', data.idNumber, layout.idNumber, true)
  labeled('סכום ההלוואה המבוקש:', `$${Math.round(data.amount).toLocaleString('en-US')}`, layout.amount, true)
  labeled('מספר התשלומים:', String(data.installments), layout.installments, true)
  // ⚠️ הסוגריים כתובים הפוך במכוון: pdf-lib מצייר תווים לפי סדרם ואינו
  // מיישם bidi, ולכן סוגר-פותח בטקסט עברי מצויר כפי שהוא — כלומר ")$("
  // בקוד הוא "($)" על הדף. כתיבה "נכונה" כאן הייתה מתהפכת בפלט.
  R('שימו לב: ההלוואה והתשלום מתבצעים בשקלים לפי ערך מטבע דולר )$(.', layout.currencyNote, font, GREY)

  // ── סדר הדורות ──
  // 🔴 מודפס מהמערכת ולא כשורות ריקות: זו הנקודה שבה הטופס הישן הכי נכשל —
  // המבקש מילא בכתב יד "בערך", והרב חתם על שרשרת שאינה תואמת את הרישום.
  R('פירוט היחוס עד רבינו החתם סופר', layout.lineageTitle, bold, GOLD)
  // ⚠️ הכינוי ("בן", "חתן") נלקח מהמערכת ולא נכתב קשיח.
  //
  // קודם הודפס "בן / חתן" על *כל* דור — כלומר הטופס הצהיר שני קשרים
  // סותרים בכל שורה, והרב נדרש לחתום על משהו שאינו אומר דבר. כשהקשר
  // אינו ידוע לא מודפס כלום: שורה בלי כינוי היא מידע חסר, שורה עם
  // כינוי שגוי היא מידע *מטעה*.
  let ly = layout.lineageStart.y
  for (const [i, entry] of data.lineage.entries()) {
    const size = layout.lineageStart.size
    const { name, relation } = typeof entry === 'string'
      ? { name: entry, relation: i === 0 ? 'המבקש' : '' }
      : entry

    L(`${i + 1}.`, layout.lineageNumX, ly, size, font, GREY)
    if (relation) L(rtl(relation), layout.lineageRelX, ly, size, font, GREY)

    const nm = rtl(name)
    draw(nm, layout.lineageStart.x - font.widthOfTextAtSize(nm, size), ly, size, bold, DARK)
    ly -= layout.lineageGap
  }

  // ── אישור והמלצת רב ──
  // ⚠️ החלק היחיד שנשאר ריק — זה כל תכלית הטופס.
  C('אישור והמלצת רב', layout.rabbiTitle, bold, GOLD)
  R('הרינו לאשר כי אני מכיר אישית את מגיש הבקשה, ואת היותו אדם נאמן וישר,', layout.rabbiText, font, DARK)
  R('וכי יחוסו מגזע רבינו החתם סופר זיע"א.',
    { ...layout.rabbiText, y: layout.rabbiText.y - 15 }, font, DARK)

  const rabbiField = (label: string, p: FieldPos) => {
    const lbl = rtl(label)
    const lw = bold.widthOfTextAtSize(lbl, p.size)
    page.drawText(lbl, { x: p.x - lw, y: p.y, size: p.size, font: bold, color: DARK })
    dash(p.x - lw - 200, p.x - lw - 8, p.y - 2)
  }
  rabbiField('שם הרב:', layout.rabbiName)
  rabbiField('טלפון לבירורים:', layout.rabbiPhone)
  R('חותמת וחתימה:', layout.rabbiStamp, bold, DARK)

  // ── הנחיות ──
  C('את הטופס המלא, בצירוף צילום ת.ז. עם הספח המלא', layout.instructions, bold, DARK)
  C('יש לסרוק באיכות ברורה ולצרפו למערכת',
    { ...layout.instructions, y: layout.instructions.y - 13 }, bold, DARK)
  C('ההלוואות מיועדות אך ורק לטובת נכדי רבינו החת"ס, ולא למטרות אחרות.',
    { ...layout.instructions, y: layout.instructions.y - 30, size: 8 }, font, GREY)
  C('ההחלטה הסופית ותנאי ההחזר ייקבעו לפי תקנון הגמ"ח, ונתונים לשינוי כפי החלטת רבני הגמ"ח.',
    { ...layout.instructions, y: layout.instructions.y - 41, size: 8 }, font, GREY)

  // ── כתובת המייל בפוטר ──
  // 🔴 מכסים את הכתובת שבבלאנק ומדפיסים את הנוכחית מעליה.
  //
  // ⚠️ הכיסוי חייב להישאר: הבלאנק נושא כתובת gmail פרטית, ותשובות אליה
  // אינן נקלטות במערכת ואינן מנוטרות — טופס שנשלח לשם פשוט נעלם.
  //
  // ⚠️ הצבע תואם *במדויק* לפס הפוטר של הבלאנק (חום כהה), ולכן המלבן
  // נבלע בו ואינו נראה כפס נוסף שהודבק. הגרסה הקודמת השתמשה בגוון בהיר
  // יותר, וזה מה שיצר את הרושם של פס חדש מתחת לכתובת.
  // ⚠️ הגובה מצומצם לגובה השורה בלבד — מלבן גבוה מדי חורג מהפס עצמו
  // ומופיע כמלבן על הרקע.
  const emailLbl = rtl('אימייל:')
  const elw = bold.widthOfTextAtSize(emailLbl, layout.email.size)
  const ew = font.widthOfTextAtSize(GEMACH_EMAIL, layout.email.size)
  const total = elw + 6 + ew
  // ⚠️ המלבן רחב בכוונה (חוצה את כל הפס), ולא צמוד לטקסט: הכתובת
  // שבבלאנק ארוכה מהכתובת שלנו, וכיסוי צר השאיר ממנה שאריות משני
  // הצדדים — "chasa..." שנראה כמו טקסט זר על הפס.
  page.drawRectangle({
    x: 0,
    y: layout.email.y - 6,
    width,
    height: layout.email.size + 11,
    color: rgb(0.243, 0.106, 0.043),
  })
  draw(emailLbl, layout.email.x + total / 2 - elw, layout.email.y, layout.email.size, bold, rgb(1, 1, 1))
  draw(GEMACH_EMAIL, layout.email.x - total / 2, layout.email.y, layout.email.size, font, rgb(1, 1, 1))

  return pdf.save()
}
