// ─────────────────────────────────────────────────────────────────────────────
// עיבוד xlsx כללי — הצד הלקוח שולח עמודות ושורות, מקבל קובץ אקסל מעוצב.
//
// ⚠️ למה בשרת ולא בדפדפן: exceljs שוקל מאות קילובייטים ונשען על Buffer/zlib.
// הכנסתו ל-bundle של מסך ניהול הייתה מייקרת כל טעינת דף בשביל כפתור אחד
// שנלחץ פעם ביום. מסכים שמסננים בצד לקוח (בונה הדוחות, פורטל ההלוואות,
// נרשמי חלוקה) לא יכולים לבקש מהשרת לשלוף מחדש את מה שכבר סוננו — ולכן הם
// שולחים את השורות שכבר בידיהם, והשרת רק מעצב אותן.
//
// ⚠️ אין כאן נתונים חדשים: כל מה שמגיע כאן כבר עבר דרך ה-API המקורי אל אותו
// משתמש. עדיין נדרשת הרשאת צוות, כדי שלא ייווצר endpoint פתוח שכל אחד יכול
// להשתמש בו כמעבד קבצים.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from 'next/server'
import { requireNonMailStaff } from '@/lib/apiAuth'
import { buildXlsx, xlsxHeaders, type CellValue, type Column } from '@/lib/xlsx'

export const dynamic = 'force-dynamic'
// ⚠️ חובה — exceljs אינו רץ ב-Edge runtime.
export const runtime = 'nodejs'

const KINDS = new Set(['text', 'number', 'date', 'id'])
// רשת ביטחון: קובץ גדול מזה אינו שמיש באקסל ממילא, ובניית הסגנון לכל תא
// בשורות כאלה חונקת את השרת.
const MAX_ROWS = 50_000
const MAX_COLS = 60

export async function POST(request: NextRequest) {
  if (!(await requireNonMailStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 }) }

  const b = body as { filename?: unknown; sheetName?: unknown; columns?: unknown; rows?: unknown }
  if (!Array.isArray(b?.columns) || !Array.isArray(b?.rows)) {
    return NextResponse.json({ error: 'חסרות עמודות או שורות' }, { status: 400 })
  }
  if (b.columns.length === 0 || b.columns.length > MAX_COLS) {
    return NextResponse.json({ error: 'מספר עמודות לא תקין' }, { status: 400 })
  }
  if (b.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: 'יותר מדי שורות לייצוא' }, { status: 400 })
  }

  // ⚠️ ניקוי מלא של הקלט לפני exceljs: kind לא מוכר או header שאינו מחרוזת
  // מפילים את בניית החוברת עם שגיאה סתומה, ולא נותנים שום רמז מה נשלח.
  const columns: Column[] = b.columns.map((c: unknown) => {
    const col = (c ?? {}) as { header?: unknown; kind?: unknown; width?: unknown }
    const kind = typeof col.kind === 'string' && KINDS.has(col.kind) ? col.kind as Column['kind'] : 'text'
    const width = typeof col.width === 'number' && col.width > 0 ? Math.min(80, col.width) : undefined
    return { header: String(col.header ?? ''), kind, width }
  })

  const rows: CellValue[][] = b.rows.map((r: unknown) => {
    const arr = Array.isArray(r) ? r : []
    return columns.map((_, i) => {
      const v = arr[i]
      if (v == null) return null
      // ⚠️ רק שלושת הטיפוסים האלה. אובייקט או מערך מקוננים היו נכתבים לתא
      // כ-[object Object], ו-exceljs היה מקבל אותם בלי להתלונן.
      if (typeof v === 'number') return Number.isFinite(v) ? v : null
      if (typeof v === 'boolean') return v ? 'כן' : 'לא'
      if (typeof v === 'string') return v
      return String(v)
    })
  })

  const filename = String(b.filename ?? 'ייצוא').replace(/[\\/:*?"<>|]/g, '-').slice(0, 100) || 'ייצוא'
  const sheetName = String(b.sheetName ?? filename)

  const buf = await buildXlsx([{ name: sheetName, columns, rows }])
  return new NextResponse(new Uint8Array(buf), { headers: xlsxHeaders(filename) })
}
