// ─────────────────────────────────────────────────────────────────────────────
// בניית קובץ אקסל אמיתי (.xlsx) — מנוע יחיד לכל ההורדות במערכת.
//
// ⚠️ למה לא CSV: עד כה כל ה"ייצוא לאקסל" במערכת היה קובץ CSV עם BOM. הוא אמנם
// נפתח באקסל, אבל הוא טקסט גולמי — בלי כותרות מודגשות, בלי כיווניות RTL, בלי
// רוחבי עמודות, ובעיקר: כל ערך הוא *מחרוזת*. משמעות הדבר שסכומים לא ניתנים
// לסכימה, תאריכים לא ניתנים למיון כרונולוגי, ומספרי טלפון עם 0 מוביל נחתכים
// (בדיוק הסיבה שבשותף ההלוואות נאלצו לעטוף טלפון ב-="0501234567"). xlsx אמיתי
// פותר את שלושתם בבת אחת.
//
// ⚠️ הקובץ הזה חייב לרוץ ב-Node בלבד (exceljs נשען על Buffer/zlib). כל route
// שמשתמש בו חייב runtime='nodejs' — לא edge.
// ─────────────────────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs'

// ── צבעי המותג ──
// ⚠️ ARGB ולא RGB: exceljs מצפה ל-8 תווים עם ערוץ אלפא בהתחלה. 'FFDBEAFE' ולא
// '#DBEAFE'. סימן # או 6 תווים בלבד = התא פשוט יוצא בלי צבע, בלי שום שגיאה.
const BRAND = {
  headerFill: 'FFDBEAFE',  // כחול בהיר — כמו bg-blue-100 בממשק
  headerText: 'FF3730A3',  // אינדיגו כהה (indigo-800) — ניגודיות קריאה על הרקע הבהיר
  bandFill:   'FFF8FAFC',  // slate-50 — פסי הרקע של השורות הזוגיות
  border:     'FFE2E8F0',  // slate-200 — קווי הרשת העדינים
} as const

const FONT = { name: 'Calibri', size: 12 } as const

// סוגי הערכים שמותר להזין לתא. ההבחנה בין מספר למחרוזת אינה קוסמטית —
// היא מה שקובע אם אקסל יידע לסכם את העמודה.
export type CellValue = string | number | Date | null | undefined

export type Column = {
  header: string
  /** 'text' (ברירת מחדל) | 'number' סכום/כמות | 'date' תאריך | 'id' מזהה שמור-כטקסט */
  kind?: 'text' | 'number' | 'date' | 'id'
  /** רוחב מפורש בתווים. בלעדיו הרוחב נמדד מהתוכן. */
  width?: number
}

export type SheetSpec = {
  /** שם הלשונית באקסל */
  name: string
  columns: Column[]
  rows: CellValue[][]
}

// ⚠️ אקסל אוסר על התווים : \ / ? * [ ] בשם לשונית, ומגביל ל-31 תווים.
// שם עברי עם קו נטוי בתאריך ("יולדות 10/8/2026") היה מפיל את יצירת הקובץ.
const safeSheetName = (name: string) =>
  (name.replace(/[:\\/?*[\]]/g, '-').trim() || 'גיליון').slice(0, 31)

// ⚠️ מדידת רוחב לפי תווים, לא לפי פיקסלים. עברית רחבה מספרות, ולכן מוסיפים
// מרווח קבוע — בלעדיו הכותרת המודגשת נחתכת אפילו כשהרוחב "מספיק" לפי הספירה.
const MIN_WIDTH = 10
const MAX_WIDTH = 45  // מעליו העמודה בולעת את המסך; אקסל יגלוש שורה במקום

function measure(v: CellValue): number {
  if (v == null) return 0
  if (v instanceof Date) return 10           // dd/mm/yyyy
  return String(v).length
}

/**
 * בניית חוברת עבודה אחת או יותר והחזרתה כ-Buffer מוכן להורדה.
 * ⚠️ מחזיר Buffer של Node ולא Uint8Array — NextResponse יודע להגיש אותו כמו שהוא.
 */
export async function buildXlsx(sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'היכל החתם סופר'
  wb.created = new Date()

  for (const spec of sheets) {
    const ws = wb.addWorksheet(safeSheetName(spec.name), {
      // ⚠️ שלושת אלה הם כל ההבדל בין "טבלה נעימה" ל"נתונים גולמיים":
      // rightToLeft — הגיליון נקרא מימין לשמאל, כמו כל הממשק.
      // state:'frozen' + ySplit:1 — שורת הכותרת נשארת גלויה בגלילה.
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
      // הדפסה: הכל ברוחב עמוד אחד, עם חזרת הכותרת בכל דף.
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })
    ws.pageSetup.printTitlesRow = '1:1'

    // ── שורת הכותרת ──
    const headerRow = ws.addRow(spec.columns.map(c => c.header))
    headerRow.height = 24
    headerRow.eachCell(cell => {
      cell.font = { ...FONT, bold: true, color: { argb: BRAND.headerText } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.headerFill } }
      cell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' }
      cell.border = {
        top:    { style: 'thin', color: { argb: BRAND.border } },
        bottom: { style: 'medium', color: { argb: BRAND.headerText } },
        left:   { style: 'thin', color: { argb: BRAND.border } },
        right:  { style: 'thin', color: { argb: BRAND.border } },
      }
    })

    // ── שורות הנתונים ──
    for (const raw of spec.rows) {
      // ⚠️ ההמרה לפי kind היא הלב של העניין. ערך שנשאר מחרוזת לא ייסכם ולא
      // יימוין נכון, וערך ריק שהופך ל-0 מזייף את הסיכום — לכן '' → null.
      const values = spec.columns.map((col, i) => {
        const v = raw[i]
        if (v == null || v === '') return null
        if (col.kind === 'number') {
          const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''))
          return Number.isFinite(n) ? n : String(v)
        }
        if (col.kind === 'date') {
          if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
          const d = new Date(String(v))
          return Number.isNaN(d.getTime()) ? String(v) : d
        }
        // 'id' ו-'text' נשארים מחרוזת במפורש. ⚠️ קריטי לת"ז ולטלפון: '0501234567'
        // כמספר הופך ל-501234567 והאפס המוביל נעלם.
        return String(v)
      })
      ws.addRow(values)
    }

    // ── עיצוב הגוף: פונט אחיד, יישור לימין, פסים וגבולות ──
    const lastRow = ws.rowCount
    for (let r = 2; r <= lastRow; r++) {
      const row = ws.getRow(r)
      row.height = 19
      const banded = r % 2 === 0   // פס על שורות זוגיות — קל לעקוב אחרי שורה ארוכה
      spec.columns.forEach((col, i) => {
        const cell = row.getCell(i + 1)
        cell.font = { ...FONT }
        // ⚠️ readingOrder:'rtl' על *כל* תא, לא רק על הכותרת. בלעדיו טקסט עברי
        // שמכיל ספרות או סימני פיסוק ("רח' הרצל 5") מוצג בסדר הפוך באקסל.
        cell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' }
        if (col.kind === 'number') cell.numFmt = '#,##0'
        else if (col.kind === 'date') cell.numFmt = 'dd/mm/yyyy'
        if (banded) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.bandFill } }
        cell.border = {
          top:    { style: 'hair', color: { argb: BRAND.border } },
          bottom: { style: 'hair', color: { argb: BRAND.border } },
          left:   { style: 'hair', color: { argb: BRAND.border } },
          right:  { style: 'hair', color: { argb: BRAND.border } },
        }
      })
    }

    // ── רוחבי עמודות ──
    // ⚠️ ל-exceljs אין auto-fit (זו תכונה של אקסל עצמו, לא של הפורמט). מודדים
    // ידנית את התא הארוך ביותר בעמודה, כולל הכותרת המודגשת.
    spec.columns.forEach((col, i) => {
      if (col.width) { ws.getColumn(i + 1).width = col.width; return }
      let max = col.header.length + 2   // תוספת על החיפוי של הבולד
      for (const row of spec.rows) {
        const len = measure(row[i])
        if (len > max) max = len
      }
      ws.getColumn(i + 1).width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, max + 3))
    })

    // ── מסנן אוטומטי על שורת הכותרת ──
    // מאפשר למשתמש למיין ולסנן בלי לבנות טבלה בעצמו. חל רק כשיש נתונים —
    // מסנן על גיליון ריק מציג באקסל אזהרת "קובץ פגום".
    if (spec.rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } }
    }
  }

  // ⚠️ exceljs מטיפס ל-ArrayBuffer בטיפוסים אבל מחזיר Buffer בפועל ב-Node.
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}

/**
 * כותרות התגובה להורדת xlsx.
 * ⚠️ filename* עם UTF-8 הוא מה שמאפשר שם קובץ עברי. filename="..." הפשוט
 * מקודד ב-latin-1 ומחזיר ג'יבריש, ולכן נשמר כאן רק כגיבוי ASCII לדפדפנים ישנים.
 */
export function xlsxHeaders(filename: string): Record<string, string> {
  const name = `${filename}.xlsx`
  return {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'no-store',
  }
}

/** תאריך היום לשם קובץ (10-08-2026) — ⚠️ בלי / שאסור בשמות קבצים. */
export const todayStamp = () => new Date().toLocaleDateString('he-IL').replace(/\//g, '-')
