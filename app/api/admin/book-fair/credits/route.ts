import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { randomBytes } from 'crypto'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { parseCreditsTable, creditKey, type ParsedCredit } from '@/lib/bookFairCredits'
import { logActivity } from '@/lib/activityLog'

// זיכויים ללקוחות שלא קיבלו ספרים: רשימה (GET), תבנית (GET ?template=1),
// תצוגה מקדימה וכתיבה מאקסל (POST, כתיבה רק עם confirm=true).
// פרטי הבנק אינם מוחזרים מכאן; הם יוצאים רק בייצוא למנהל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 2000

export async function GET(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) return forbidden()

  if (request.nextUrl.searchParams.get('template')) {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('זיכויים', { views: [{ rightToLeft: true }] })
    ws.columns = [
      { header: 'שם', key: 'n', width: 20 }, { header: 'טלפון', key: 'p', width: 16 },
      { header: 'מייל', key: 'e', width: 28 }, { header: 'ספרים', key: 'b', width: 40 },
      { header: 'סכום', key: 'a', width: 12 },
    ]
    ws.getColumn('p').numFmt = '@'
    ws.getRow(1).font = { bold: true }
    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('תבנית זיכויים.xlsx')}`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { data, error } = await db.from('book_fair_credits')
    .select('id, customer_name, phone, email, channel, books, amount_agorot, status, send_error, sent_at, answered_at, details_at, created_at')
    .order('created_at', { ascending: false }).limit(5000)
  if (error) return NextResponse.json({ error: 'טעינת הזיכויים נכשלה' }, { status: 422 })
  return NextResponse.json({ credits: data ?? [] })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'add')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!form || !(file instanceof File)) return NextResponse.json({ error: 'לא התקבל קובץ' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'הקובץ גדול מדי (מעל 5MB)' }, { status: 400 })
  const confirm = form.get('confirm') === 'true'

  let rows: unknown[][]
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    if (!ws) return NextResponse.json({ error: 'הקובץ אינו מכיל גיליון' }, { status: 400 })
    rows = []
    ws.eachRow({ includeEmpty: true }, row => {
      rows.push((row.values as unknown[]).slice(1).map(v => {
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>
          if ('result' in o) return o.result
          if ('text' in o) return o.text
          if ('richText' in o) return (o.richText as { text: string }[]).map(t => t.text).join('')
        }
        return v
      }))
    })
  } catch {
    return NextResponse.json({ error: 'קריאת הקובץ נכשלה. ודאו שזהו קובץ אקסל תקין (xlsx)' }, { status: 400 })
  }
  if (rows.length > MAX_ROWS + 1) return NextResponse.json({ error: `הקובץ ארוך מדי (מעל ${MAX_ROWS} שורות)` }, { status: 400 })

  const parsed = parseCreditsTable(rows)
  if (parsed.missingColumns.length) {
    return NextResponse.json({ error: `חסרות עמודות חובה בקובץ: ${parsed.missingColumns.join(', ')}` }, { status: 400 })
  }

  // מי שכבר קיים (אותו טלפון/מייל) לא נכנס פעם שנייה: זיכוי כפול הוא כסף שיוצא פעמיים.
  const phones = parsed.credits.filter(c => c.phone).map(c => c.phone!)
  const emails = parsed.credits.filter(c => c.email).map(c => c.email!)
  const existing = new Set<string>()
  for (let i = 0; i < phones.length; i += 200) {
    const { data, error } = await db.from('book_fair_credits').select('phone').eq('channel', 'phone').in('phone', phones.slice(i, i + 200))
    if (error) return NextResponse.json({ error: 'בדיקת כפילויות נכשלה' }, { status: 422 })
    ;(data ?? []).forEach(r => existing.add(`p:${r.phone}`))
  }
  for (let i = 0; i < emails.length; i += 200) {
    const { data, error } = await db.from('book_fair_credits').select('email').eq('channel', 'email').in('email', emails.slice(i, i + 200))
    if (error) return NextResponse.json({ error: 'בדיקת כפילויות נכשלה' }, { status: 422 })
    ;(data ?? []).forEach(r => existing.add(`e:${r.email}`))
  }
  const fresh: ParsedCredit[] = []
  const errors = [...parsed.errors]
  for (const c of parsed.credits) {
    if (existing.has(creditKey(c))) errors.push({ line: 0, message: `כבר קיים זיכוי ל-${c.phone ?? c.email}` })
    else fresh.push(c)
  }
  const totalAgorot = fresh.reduce((s, c) => s + c.amount_agorot, 0)
  const summary = {
    count: fresh.length, phone: fresh.filter(c => c.channel === 'phone').length,
    email: fresh.filter(c => c.channel === 'email').length, totalAgorot,
  }

  if (!confirm) return NextResponse.json({ preview: true, summary, sample: fresh.slice(0, 20), errors })

  // כתיבה: אם יש שגיאות בקובץ לא כותבים כלום חלקית ושקט. המנהל מתקן או מאשר במפורש.
  if (errors.length && form.get('skipErrors') !== 'true') {
    return NextResponse.json({ error: 'בקובץ יש שורות עם שגיאות. תקנו אותו או אשרו דילוג עליהן', errors }, { status: 422 })
  }
  if (!fresh.length) return NextResponse.json({ error: 'אין שורות תקינות לשמירה' }, { status: 422 })

  const payload = fresh.map(c => ({ ...c, token: randomBytes(24).toString('hex'), created_by: staff.userId }))
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await db.from('book_fair_credits').insert(payload.slice(i, i + 200))
    if (error) {
      console.error('[book-fair/credits] insert failed', error.code)
      return NextResponse.json({ error: 'השמירה נכשלה באמצע. בדקו ברשימה מה נכנס לפני שמעלים שוב', saved: i }, { status: 422 })
    }
  }
  await logActivity(db, { userId: staff.userId, action: 'book_fair_credits_import', entityType: 'book_fair_credits', details: summary })
  return NextResponse.json({ saved: true, summary })
}
