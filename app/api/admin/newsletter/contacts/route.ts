import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'

// רשימות נמענים חיצוניות — הורדת תבנית CSV והעלאת רשימה.
// למי שרוצה לשלוח לקהל שאינו קיים במערכת.
export const dynamic = 'force-dynamic'

const MAX_ROWS = 10_000

// GET — הורדת קובץ דוגמה למילוי
export async function GET(request: NextRequest) {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  if (request.nextUrl.searchParams.get('template') === '1') {
    // BOM — בלעדיו Excel מציג עברית כג'יבריש
    const csv = '﻿' + [
      'מייל,שם משפחה,שם פרטי,עיר,טלפון',
      'israel@example.com,כהן,ישראל,בני ברק,0501234567',
      'moshe@example.com,לוי,משה,ירושלים,0527654321',
    ].join('\r\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="newsletter-recipients-template.csv"',
      },
    })
  }

  // רשימת הרשימות הקיימות
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: lists } = await db
    .from('contact_lists')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  // ספירת אנשי קשר בכל רשימה
  const counts: Record<string, number> = {}
  for (const l of lists ?? []) {
    const { count } = await db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('list_id', l.id)
    counts[l.id] = count ?? 0
  }

  return NextResponse.json({
    lists: (lists ?? []).map(l => ({ ...l, count: counts[l.id] ?? 0 })),
  })
}

// פרסור CSV — תומך בפסיקים בתוך מרכאות
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur.trim())
  return out
}

// POST — יצירת קבוצה: מקובץ, או מנמענים שנבחרו מקבוצה קיימת
export async function POST(request: NextRequest) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const contentType = request.headers.get('content-type') ?? ''

  // ── מסלול א': יצירת קבוצה מנמענים שנבחרו ידנית (JSON) ──
  if (contentType.includes('application/json')) {
    const body = await request.json()
    const name = String(body?.name ?? '').trim().slice(0, 100)
    const recipients = Array.isArray(body?.recipients) ? body.recipients : []

    if (!name) return NextResponse.json({ error: 'יש לתת שם לקבוצה' }, { status: 400 })
    // קבוצה ריקה — נוצרת ממסך ניהול הקבוצות, וממלאים אותה בחברים אחר כך.
    const allowEmpty = body?.allowEmpty === true
    if (!recipients.length && !allowEmpty) {
      return NextResponse.json({ error: 'לא נבחרו נמענים' }, { status: 400 })
    }

    const { data: list, error: listErr } = await db
      .from('contact_lists').insert({ name }).select('id').single()
    if (listErr || !list) {
      if (listErr && /duplicate|unique/i.test(listErr.message)) {
        return NextResponse.json({ error: 'כבר קיימת קבוצה בשם הזה' }, { status: 409 })
      }
      return NextResponse.json({ error: 'יצירת הקבוצה נכשלה' }, { status: 500 })
    }
    if (!recipients.length) {
      return NextResponse.json({ ok: true, listId: list.id, imported: 0 })
    }

    const seen = new Set<string>()
    const rows = recipients
      .map((r: { email?: string; name?: string; city?: string }) => {
        const email = String(r.email ?? '').toLowerCase().trim()
        if (!email.includes('@') || seen.has(email)) return null
        seen.add(email)
        return {
          list_id: list.id,
          email,
          data: { family_name: r.name ?? '', full_name: '', city: r.city ?? '', email },
        }
      })
      .filter(Boolean) as { list_id: string; email: string; data: Record<string, string> }[]

    for (let i = 0; i < rows.length; i += 500) {
      await db.from('contacts')
        .upsert(rows.slice(i, i + 500), { onConflict: 'list_id,email', ignoreDuplicates: true })
    }

    return NextResponse.json({ ok: true, listId: list.id, imported: rows.length })
  }

  // ── מסלול ב': העלאת קובץ ──
  const form = await request.formData()
  const file = form.get('file')
  const name = String(form.get('name') ?? '').trim() || 'רשימה שהועלתה'

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 })
  }

  const text = (await file.text()).replace(/^﻿/, '') // הסרת BOM
  const lines = text.split(/\r?\n/).filter(l => l.trim())

  if (lines.length < 2) {
    return NextResponse.json({ error: 'הקובץ ריק או מכיל רק כותרות' }, { status: 400 })
  }

  // זיהוי העמודות לפי הכותרת
  const header = parseCsvLine(lines[0]).map(h => h.replace(/[״"']/g, '').trim())
  const col = (...names: string[]) =>
    header.findIndex(h => names.some(n => h.includes(n)))

  const iEmail  = col('מייל', 'אימייל', 'email', 'דוא')
  const iFamily = col('משפחה', 'family')
  const iFirst  = col('פרטי', 'first', 'שם')
  const iCity   = col('עיר', 'city')
  const iPhone  = col('טלפון', 'phone', 'נייד')

  if (iEmail < 0) {
    return NextResponse.json({
      error: 'לא נמצאה עמודת מייל. הורידו את קובץ הדוגמה והשתמשו בכותרות שבו.',
    }, { status: 400 })
  }

  // יצירת הרשימה
  const { data: list, error: listErr } = await db
    .from('contact_lists')
    .insert({ name: name.slice(0, 100) })
    .select('id')
    .single()

  if (listErr || !list) {
    return NextResponse.json({ error: 'יצירת הרשימה נכשלה' }, { status: 500 })
  }

  // פרסור השורות
  const seen = new Set<string>()
  const contacts: { list_id: string; email: string; data: Record<string, string> }[] = []
  let invalid = 0

  for (const line of lines.slice(1, MAX_ROWS + 1)) {
    const cells = parseCsvLine(line)
    const email = (cells[iEmail] ?? '').toLowerCase().trim()

    if (!email.includes('@') || !email.includes('.')) { invalid++; continue }
    if (seen.has(email)) continue
    seen.add(email)

    contacts.push({
      list_id: list.id,
      email,
      data: {
        family_name: iFamily >= 0 ? (cells[iFamily] ?? '') : '',
        full_name:   iFirst >= 0 ? (cells[iFirst] ?? '') : '',
        city:        iCity >= 0 ? (cells[iCity] ?? '') : '',
        phone:       iPhone >= 0 ? (cells[iPhone] ?? '') : '',
        email,
      },
    })
  }

  if (!contacts.length) {
    await db.from('contact_lists').delete().eq('id', list.id)
    return NextResponse.json({ error: 'לא נמצאו כתובות מייל תקינות בקובץ' }, { status: 400 })
  }

  // הכנסה במנות
  for (let i = 0; i < contacts.length; i += 500) {
    const { error } = await db
      .from('contacts')
      .upsert(contacts.slice(i, i + 500), { onConflict: 'list_id,email', ignoreDuplicates: true })
    if (error) {
      console.error('[newsletter/contacts] הכנסה נכשלה:', error.message)
      return NextResponse.json({ error: 'שמירת הנמענים נכשלה' }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    listId: list.id,
    imported: contacts.length,
    invalid,
  })
}

// DELETE — מחיקת רשימה
export async function DELETE(request: NextRequest) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { error } = await db.from('contact_lists').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
