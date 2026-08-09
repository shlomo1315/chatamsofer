// הורדת אקסל מצד לקוח — עוטף את /api/admin/xlsx.
//
// ⚠️ הצד הלקוח לא בונה את הקובץ בעצמו בכוונה: exceljs היה נכנס ל-bundle של כל
// מסך שיש בו כפתור ייצוא. כאן נשלחות רק העמודות והשורות (JSON), והשרת מחזיר
// xlsx מעוצב — אותו עיצוב בדיוק כמו הייצוא של המחלקות.
export type XlsxKind = 'text' | 'number' | 'date' | 'id'
export type XlsxColumn = { header: string; kind?: XlsxKind; width?: number }

// ⚠️ Date אינו נשלח כמות שהוא: JSON.stringify הופך אותו ל-ISO ממילא, ובשרת
// kind:'date' מפרסר אותו בחזרה. לכן מותר לשלוח Date, מחרוזת ISO, או מחרוזת ריקה.
export type XlsxCell = string | number | boolean | Date | null | undefined

export async function downloadXlsx(opts: {
  filename: string
  sheetName?: string
  columns: XlsxColumn[]
  rows: XlsxCell[][]
}): Promise<void> {
  const res = await fetch('/api/admin/xlsx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error ?? 'יצירת הקובץ נכשלה')
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${opts.filename}.xlsx`
  a.click()
  // ⚠️ שחרור מיידי היה מבטל את ההורדה בחלק מהדפדפנים לפני שהתחילה.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** תאריך היום לשם קובץ (10-08-2026) — ⚠️ בלי / שאסור בשמות קבצים. */
export const todayStamp = () => new Date().toLocaleDateString('he-IL').replace(/\//g, '-')
