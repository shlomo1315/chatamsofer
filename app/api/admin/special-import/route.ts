// ─────────────────────────────────────────────────────────────────────────────
// ייבוא מאושרים חריגים מקובץ אקסל.
//
// שני שלבים בכוונה:
//   POST ?step=preview  — קורא את הקובץ, ממפה עמודות, מחזיר תצוגה מקדימה
//   POST ?step=commit   — כותב למאגר את השורות שאושרו
//
// ⚠️ ההפרדה אינה קוסמטית: ייבוא בלחיצה אחת אינו הפיך, וקובץ עם עמודות
// שזוהו לא נכון היה יוצר מאות רשומות שגויות בלי שאיש יראה זאת מראש.
// התצוגה המקדימה היא ההזדמנות היחידה לתפוס את זה.
//
// ⚠️ מנהל ראשי בלבד — כמו מסך האישורים החריגים עצמו. ייבוא יוצר מוטבים
// שרשאים להגיש בקשות, וזו סמכות של המנהל ולא של המזכירות.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { createClient } from '@/lib/supabase/server'
import {
  autoMapColumns, missingRequired, cleanIdNumber, cleanPhone, type FieldKey,
} from '@/lib/specialImportMap'

export const dynamic = 'force-dynamic'
// ⚠️ חובה — exceljs אינו רץ ב-Edge runtime.
export const runtime = 'nodejs'

// רשת ביטחון: קובץ גדול מזה אינו ייבוא אלא תקלה.
const MAX_ROWS = 5_000

async function assertAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  return profile?.role === 'admin'
}

/** ערך תא כמחרוזת — exceljs מחזיר גם אובייקטים (נוסחה, קישור, תאריך). */
function cellText(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] }
    if (Array.isArray(o.richText)) return o.richText.map(r => r.text).join('')
    if (o.text != null) return String(o.text)
    if (o.result != null) return String(o.result)
    return ''
  }
  return String(v).trim()
}

interface ParsedRow {
  values: Partial<Record<FieldKey, string>>
  /** מספר השורה בקובץ — כדי שהמשתמש ימצא אותה אם יש שגיאה. */
  line: number
  error?: string
}

export async function POST(request: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: 'למנהל הראשי בלבד' }, { status: 403 })
  }
  const step = new URL(request.url).searchParams.get('step') ?? 'preview'

  if (step === 'preview') return preview(request)
  if (step === 'commit') return commit(request)
  return NextResponse.json({ error: 'שלב לא מוכר' }, { status: 400 })
}

async function preview(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'לא צורף קובץ' }, { status: 400 })
  }

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'הקובץ אינו קובץ אקסל תקין' }, { status: 400 })
  }

  const sheet = wb.worksheets[0]
  if (!sheet) return NextResponse.json({ error: 'הקובץ ריק' }, { status: 400 })

  // ⚠️ שורת הכותרות היא הראשונה שיש בה יותר מתא אחד מלא: קבצים רבים
  // מתחילים בשורת כותרת מעוצבת ("רשימת מאושרים 2026") שאינה הכותרות.
  let headerRow = 1
  let headers: string[] = []
  for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
    const vals = (sheet.getRow(r).values as unknown[]).slice(1).map(cellText)
    if (vals.filter(Boolean).length >= 2) { headerRow = r; headers = vals; break }
  }
  if (!headers.length) {
    return NextResponse.json({ error: 'לא נמצאה שורת כותרות בקובץ' }, { status: 400 })
  }

  const map = autoMapColumns(headers)
  const missing = missingRequired(map)

  const rows: ParsedRow[] = []
  for (let r = headerRow + 1; r <= sheet.rowCount && rows.length < MAX_ROWS; r++) {
    const raw = (sheet.getRow(r).values as unknown[]).slice(1)
    const values: Partial<Record<FieldKey, string>> = {}
    for (const [idxStr, key] of Object.entries(map)) {
      const t = cellText(raw[Number(idxStr)])
      if (!t) continue
      values[key] = key === 'id_number' || key === 'spouse_id_number' ? cleanIdNumber(t)
        : key === 'phone' ? cleanPhone(t)
        : t
    }
    // שורה ריקה לגמרי — מדלגים בשקט (שורות ריק בסוף הגיליון הן הנורמה).
    if (!Object.values(values).some(Boolean)) continue

    let error: string | undefined
    if (!values.id_number) error = 'חסרה תעודת זהות'
    else if (values.id_number.length !== 9) error = `ת"ז באורך ${values.id_number.length} במקום 9`
    else if (!values.full_name) error = 'חסר שם'
    rows.push({ values, line: r, error })
  }

  // ⚠️ בדיקת כפילויות מול המאגר *לפני* הכתיבה: כך המשתמש רואה מראש
  // כמה רשומות כבר קיימות, במקום לגלות אחרי הייבוא שנוצרו כפילויות.
  const admin = getServiceClient()
  const ids = rows.map(r => r.values.id_number).filter(Boolean) as string[]
  const existing = new Set<string>()
  if (admin && ids.length) {
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await admin
        .from('beneficiaries').select('id_number').in('id_number', ids.slice(i, i + 500))
      for (const b of data ?? []) existing.add(String((b as { id_number: string }).id_number))
    }
  }

  // כפילות בתוך הקובץ עצמו — נפוץ בקבצים שאוחדו ממקורות שונים.
  const seen = new Set<string>()
  for (const r of rows) {
    const id = r.values.id_number
    if (!id || r.error) continue
    if (seen.has(id)) r.error = 'ת"ז כפולה בתוך הקובץ'
    else seen.add(id)
  }

  return NextResponse.json({
    headers,
    map,
    missing,
    rows: rows.slice(0, 200),   // תצוגה מקדימה — לא כל הקובץ
    totalRows: rows.length,
    validRows: rows.filter(r => !r.error && !existing.has(r.values.id_number!)).length,
    errorRows: rows.filter(r => r.error).length,
    existingRows: rows.filter(r => !r.error && existing.has(r.values.id_number!)).length,
    existingIds: [...existing],
  })
}

async function commit(request: NextRequest) {
  const body = await request.json().catch(() => null) as { rows?: ParsedRow[] } | null
  const incoming = Array.isArray(body?.rows) ? body!.rows : []
  if (!incoming.length) return NextResponse.json({ error: 'אין שורות לייבוא' }, { status: 400 })
  if (incoming.length > MAX_ROWS) {
    return NextResponse.json({ error: `מקסימום ${MAX_ROWS} שורות בייבוא אחד` }, { status: 400 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ הבדיקה חוזרת בשרת ואינה נשענת על מה שהלקוח שלח: התצוגה המקדימה
  // היא נוחות, לא אכיפה. שורה בלי ת"ז תקינה לא נכנסת גם אם הלקוח סימן אותה.
  const clean = incoming.filter(r =>
    r?.values?.id_number && String(r.values.id_number).length === 9 && r.values.full_name)
  if (!clean.length) return NextResponse.json({ error: 'לא נמצאו שורות תקינות' }, { status: 400 })

  const ids = clean.map(r => r.values.id_number!) as string[]
  const already = new Set<string>()
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin
      .from('beneficiaries').select('id_number').in('id_number', ids.slice(i, i + 500))
    for (const b of data ?? []) already.add(String((b as { id_number: string }).id_number))
  }

  const toInsert = clean
    .filter(r => !already.has(r.values.id_number!))
    .map(r => ({
      ...r.values,
      // 🔴 שני השדות שהופכים את הרשומה ל"אישור חריג": בלעדיהם היא הייתה
      // נכנסת כצאצא רגיל ומופיעה במסך הצאצאים במקום באישורים החריגים.
      is_special: true,
      eligibility_status: 'approved',
    }))

  if (!toInsert.length) {
    return NextResponse.json({ inserted: 0, skipped: clean.length, message: 'כל הרשומות כבר קיימות במערכת' })
  }

  // הכנסה במנות — insert אחד ענק נכשל כולו על שורה אחת בעייתית.
  let inserted = 0
  const failures: { line: number; error: string }[] = []
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100)
    const { error } = await admin.from('beneficiaries').insert(chunk)
    if (error) {
      // נפילה לשורה-שורה כדי לבודד את הבעייתיות ולא לאבד את כל המנה.
      for (const row of chunk) {
        const { error: e2 } = await admin.from('beneficiaries').insert(row)
        if (e2) failures.push({ line: 0, error: `${row.id_number}: ${e2.message}` })
        else inserted++
      }
    } else {
      inserted += chunk.length
    }
  }

  return NextResponse.json({
    inserted,
    skipped: clean.length - toInsert.length,
    failures: failures.slice(0, 20),
  })
}
