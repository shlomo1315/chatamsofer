import ExcelJS from 'exceljs'

// ── העלאת קובץ רשימת תפוצה (Excel או CSV) ──
// הקובץ הופך לטקסט, שורה לכל שורה בגיליון ותאים מופרדים בטאב, ומשם עובר
// ל-parseImportText הקיים. כך הכללים (חיפוש מייל בשורה, השאר שם) זהים להדבקה.
// ⚠️ exceljs רץ רק בצד השרת (Buffer), ואין לייבא את הקובץ הזה מרכיב לקוח.

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024

export type ImportFileKind = 'xlsx' | 'text'

export function importFileKind(name: string): ImportFileKind | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'csv' || ext === 'txt') return 'text'
  return null
}

// ערך תא כטקסט: קישור mailto, טקסט עשיר ונוסחה מחזירים את הטקסט שמוצג.
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (v instanceof Date) return ''
  if (typeof v !== 'object') return String(v)
  if ('richText' in v) return v.richText.map(r => r.text).join('')
  if ('hyperlink' in v) return typeof v.text === 'string' ? v.text : String(v.hyperlink).replace(/^mailto:/i, '')
  if ('result' in v) return v.result == null || v.result instanceof Date || typeof v.result === 'object' ? '' : String(v.result)
  return ''
}

export async function xlsxToImportText(buf: ArrayBuffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const lines: string[] = []
  wb.eachSheet(ws => {
    ws.eachRow(row => {
      const cells = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText).map(s => s.replace(/[\t\r\n]+/g, ' ').trim())
      lines.push(cells.join('\t'))
    })
  })
  return lines.join('\n')
}

/** כל גיליון בנפרד, עם שמו (לקבצים שבהם לכל גיליון משמעות, כמו קובץ המסלולים). */
export async function xlsxToSheets(buf: ArrayBuffer): Promise<{ name: string; rows: string[][] }[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const sheets: { name: string; rows: string[][] }[] = []
  wb.eachSheet(ws => {
    const rows: string[][] = []
    ws.eachRow(row => {
      // Array.from ממלא תאים ריקים באמצע השורה, כדי שמיקום העמודות יישמר
      rows.push(Array.from((row.values as ExcelJS.CellValue[]).slice(1), v => cellText(v).replace(/[\t\r\n]+/g, ' ')))
    })
    sheets.push({ name: ws.name, rows })
  })
  return sheets
}

export function decodeTextFile(buf: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '')
}

// שורת כותרות ("שם", "מייל") אינה שורה לא תקינה — מורידים שורה ראשונה בלי @.
export function dropHeaderRow(text: string): string {
  const nl = text.indexOf('\n')
  const first = nl < 0 ? text : text.slice(0, nl)
  return first.includes('@') ? text : text.slice(nl < 0 ? text.length : nl + 1)
}
