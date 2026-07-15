import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'

// חברי הקבוצה (contacts): רשימה מסוננת/מדפדפת + הוספת חבר.
export const dynamic = 'force-dynamic'

interface ContactRow {
  id: string
  email: string
  data: Record<string, string> | null
}

// שיטוח שורת contact לתצוגה
function flatten(c: ContactRow) {
  const d = c.data ?? {}
  return {
    id: c.id,
    email: c.email,
    family_name: d.family_name ?? '',
    full_name: d.full_name ?? '',
    city: d.city ?? '',
    phone: d.phone ?? '',
  }
}

// GET — חברי הקבוצה. תומך בחיפוש (?q=) ובדפדוף (?limit&?offset).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const sp = request.nextUrl.searchParams
  // תווים שעלולים לשבור את מחרוזת ה-or של PostgREST — מנוקים.
  const q = (sp.get('q') ?? '').trim().replace(/[,()*]/g, '').slice(0, 80)
  const limit = Math.min(Math.max(Number(sp.get('limit') ?? 50), 1), 200)
  const offset = Math.max(Number(sp.get('offset') ?? 0), 0)

  let query = db
    .from('contacts')
    .select('id, email, data', { count: 'exact' })
    .eq('list_id', id)

  if (q) {
    query = query.or(
      `email.ilike.%${q}%,data->>family_name.ilike.%${q}%,data->>full_name.ilike.%${q}%,data->>city.ilike.%${q}%,data->>phone.ilike.%${q}%`,
    )
  }

  const { data, count, error } = await query
    .order('email', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    members: (data ?? []).map(c => flatten(c as ContactRow)),
    total: count ?? 0,
  })
}

// POST — הוספת חבר לקבוצה
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const email = String(body.email ?? '').toLowerCase().trim()
  if (!email.includes('@') || !email.includes('.')) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }

  const data = {
    family_name: String(body.family_name ?? '').trim(),
    full_name: String(body.full_name ?? '').trim(),
    city: String(body.city ?? '').trim(),
    phone: String(body.phone ?? '').trim(),
    email,
  }

  const { data: inserted, error } = await db
    .from('contacts')
    .insert({ list_id: id, email, data })
    .select('id, email, data')
    .single()

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ error: 'הכתובת כבר קיימת בקבוצה' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, member: flatten(inserted as ContactRow) })
}
