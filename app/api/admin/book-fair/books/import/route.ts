import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { parseBooksTable, TEMPLATE_HEADERS, TEMPLATE_SAMPLE, type ParsedBook } from '@/lib/bookFairImport'
import { logActivity } from '@/lib/activityLog'

// ייבוא קטלוג מאקסל: תבנית להורדה (GET), תצוגה מקדימה וכתיבה (POST).
//
// 🔴 העיקרון: הקובץ לעולם אינו נכתב ישירות. תחילה מוחזרת תצוגה מקדימה
// מלאה — מה ייכנס, מה יעודכן, ומה נדחה ולמה — ורק בקריאה שנייה מפורשת
// (confirm=true) מתבצעת הכתיבה. קובץ שנכנס חלקית בלי שאיש ידע הוא קטלוג
// שקרי: הספרים שנשמטו פשוט לא יימכרו.
//
// ⚠️ runtime='nodejs' חובה — exceljs נשען על Buffer ואינו רץ ב-edge.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** תקרת גודל: 5MB. קטלוג של אלפי ספרים שוקל הרבה פחות. */
const MAX_BYTES = 5 * 1024 * 1024

// ─────────────────────────────────────────────────────────────────────────────
// GET — הורדת התבנית
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) return forbidden()

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('ספרים', { views: [{ rightToLeft: true }] })

  ws.columns = TEMPLATE_HEADERS.map(h => ({
    header: h.label,
    key: h.field,
    width: Math.max(14, h.label.length + 6),
  }))

  // כותרות מודגשות + הערה צפה עם ההסבר לכל עמודה
  const head = ws.getRow(1)
  head.font = { bold: true, size: 12, color: { argb: 'FF3730A3' } }
  head.alignment = { horizontal: 'center', vertical: 'middle' }
  head.height = 26
  TEMPLATE_HEADERS.forEach((h, i) => {
    const cell = head.getCell(i + 1)
    cell.fill = {
      type: 'pattern', pattern: 'solid',
      // ⚠️ שדות חובה בגוון כהה יותר, כדי שייראו בלי לקרוא את ההערה
      fgColor: { argb: h.required ? 'FFBFDBFE' : 'FFE0E7FF' },
    }
    cell.note = `${h.required ? 'שדה חובה' : 'אופציונלי'}\n${h.hint}`
  })
  ws.views = [{ state: 'frozen', ySplit: 1, rightToLeft: true }]

  // ⚠️ שורות דוגמה בגוון אפור: הן מראות את הפורמט הצפוי, והמשתמש
  // מוחק אותן. בלעדיהן "מחיר" נראה כשדה שמקבל "מאה שקל".
  TEMPLATE_SAMPLE.forEach(sample => {
    const row = ws.addRow(sample)
    row.font = { color: { argb: 'FF94A3B8' }, italic: true }
  })

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('תבנית ייבוא ספרים.xlsx')}`,
      'Cache-Control': 'no-store',
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — תצוגה מקדימה או כתיבה
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'add')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'לא התקבל קובץ' }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'לא התקבל קובץ' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מעל 5MB)' }, { status: 400 })
  }

  const confirm = form.get('confirm') === 'true'
  const mode = String(form.get('mode') ?? 'merge')  // merge = עדכון קיימים | skip = דילוג עליהם

  // ── קריאת הקובץ ──
  let rows: unknown[][]
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    if (!ws) return NextResponse.json({ error: 'הקובץ אינו מכיל גיליון' }, { status: 400 })

    rows = []
    ws.eachRow({ includeEmpty: true }, row => {
      const values = row.values as unknown[]
      // ⚠️ exceljs מחזיר מערך 1-based עם חור בתא 0 — חותכים אותו.
      // ⚠️ תא עם נוסחה מגיע כאובייקט {formula, result}; לוקחים את התוצאה,
      // אחרת מחיר מחושב היה נקרא כ-"[object Object]".
      rows.push(values.slice(1).map(v => {
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>
          if ('result' in o) return o.result
          if ('text' in o) return o.text          // hyperlink / rich text
          if ('richText' in o) return (o.richText as { text: string }[]).map(t => t.text).join('')
        }
        return v
      }))
    })
  } catch (e) {
    console.error('[book-fair/import] read failed:', e)
    return NextResponse.json({ error: 'קריאת הקובץ נכשלה. ודאו שזהו קובץ אקסל תקין (xlsx)' }, { status: 400 })
  }

  // ── פענוח ──
  const parsed = parseBooksTable(rows)

  if (parsed.missingColumns.length) {
    const labels = parsed.missingColumns
      .map(f => TEMPLATE_HEADERS.find(h => h.field === f)?.label ?? f)
      .join(', ')
    return NextResponse.json({
      error: `חסרות עמודות חובה בקובץ: ${labels}. הורידו את התבנית וודאו שהכותרות תואמות.`,
      missingColumns: parsed.missingColumns,
    }, { status: 400 })
  }

  // ── מה כבר קיים בקטלוג ──
  const skus = parsed.books.map(b => b.sku.toLowerCase())
  const existing = new Map<string, { id: string; title: string }>()
  if (skus.length) {
    // ⚠️ שליפה במנות: רשימת in ארוכה מדי נחתכת, ותוצאה חלקית כאן
    // הייתה מציגה "ספר חדש" על ספר שקיים — וכפילות מק"ט בכתיבה.
    for (let i = 0; i < skus.length; i += 200) {
      const chunk = skus.slice(i, i + 200)
      const { data } = await db.from('book_fair_books')
        .select('id, sku, title').in('sku', chunk)
      for (const row of data ?? []) {
        existing.set(String(row.sku).toLowerCase(), { id: row.id, title: row.title })
      }
    }
  }

  const toCreate: ParsedBook[] = []
  const toUpdate: (ParsedBook & { id: string; oldTitle: string })[] = []
  for (const b of parsed.books) {
    const hit = existing.get(b.sku.toLowerCase())
    if (hit) toUpdate.push({ ...b, id: hit.id, oldTitle: hit.title })
    else toCreate.push(b)
  }

  // ── תצוגה מקדימה ──
  if (!confirm) {
    return NextResponse.json({
      preview: true,
      summary: {
        total: parsed.books.length + parsed.errors.length,
        create: toCreate.length,
        update: toUpdate.length,
        errors: parsed.errors.length,
        skipped: parsed.skipped,
      },
      // ⚠️ 50 ראשונים בלבד בתצוגה: קובץ של 3,000 שורות היה מייצר
      // תשובה ענקית שתתקע את הדפדפן. הסיכום למעלה מלא תמיד.
      create: toCreate.slice(0, 50),
      update: toUpdate.slice(0, 50).map(u => ({ sku: u.sku, title: u.title, oldTitle: u.oldTitle })),
      errors: parsed.errors.slice(0, 50),
      duplicateSkus: parsed.duplicateSkus,
    })
  }

  // ── כתיבה ──
  let created = 0, updated = 0
  const failures: string[] = []

  for (const b of toCreate) {
    const { data, error } = await db.from('book_fair_books').insert({
      sku: b.sku, title: b.title, author: b.author, publisher: b.publisher,
      volumes: b.volumes, price_agorot: b.price_agorot,
      stock_web: b.stock_web, stock_phone: b.stock_phone, phone_code: b.phone_code,
    }).select('id').single()

    if (error) { failures.push(`${b.sku}: ${error.message}`); continue }
    created++

    const ledger = []
    if (b.stock_web > 0)   ledger.push({ book_id: data.id, channel: 'web',   delta: b.stock_web,   reason: 'import', created_by: staff.userId })
    if (b.stock_phone > 0) ledger.push({ book_id: data.id, channel: 'phone', delta: b.stock_phone, reason: 'import', created_by: staff.userId })
    if (ledger.length) await db.from('book_fair_stock_ledger').insert(ledger)
  }

  if (mode === 'merge') {
    for (const b of toUpdate) {
      // 🔴 המלאי *אינו* נדרס בעדכון. קובץ ייבוא משקף כמות שהוקלדה
      // מתישהו; דריסה הייתה מוחקת מכירות שהתרחשו מאז, ובפרט מחזירה
      // למלאי עותקים שכבר נמכרו. שינוי מלאי הוא פעולה מפורשת במסך המלאי.
      const { error } = await db.from('book_fair_books').update({
        title: b.title, author: b.author, publisher: b.publisher,
        volumes: b.volumes, price_agorot: b.price_agorot,
        ...(b.phone_code !== null ? { phone_code: b.phone_code } : {}),
      }).eq('id', b.id)

      if (error) { failures.push(`${b.sku}: ${error.message}`); continue }
      updated++
    }
  }

  await logActivity(db, {
    userId: staff.userId, action: 'import', entityType: 'book_fair_book',
    details: { created, updated, errors: parsed.errors.length, mode, file: file.name },
  })

  return NextResponse.json({
    ok: true,
    created, updated,
    skippedExisting: mode === 'skip' ? toUpdate.length : 0,
    errors: parsed.errors.length,
    failures: failures.slice(0, 20),
  })
}
