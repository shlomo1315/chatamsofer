import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { processAwaitingStock } from '@/lib/maternityCards'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store' }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// מחזיר מוקדים עם ספירות מחושבות: אושרו (approved, טרם נטען), נטענו (loaded),
// נשאר פיזית (stock-loaded), פנוי לאישור (stock-approved-loaded).
async function listCenters(admin: ReturnType<typeof getAdminClient>) {
  const { data: centers, error } = await admin!.from('card_centers').select('*').order('name')
  if (error) throw error
  const { data: aids } = await admin!
    .from('maternity_aids')
    .select('card_center_id, card_status')
    .in('card_status', ['approved', 'loaded'])
  const approvedBy: Record<string, number> = {}
  const loadedBy: Record<string, number> = {}
  for (const a of aids ?? []) {
    if (!a.card_center_id) continue
    if (a.card_status === 'loaded') loadedBy[a.card_center_id] = (loadedBy[a.card_center_id] ?? 0) + 1
    else approvedBy[a.card_center_id] = (approvedBy[a.card_center_id] ?? 0) + 1
  }
  return (centers ?? []).map(c => {
    const approved = approvedBy[c.id] ?? 0
    const loaded = loadedBy[c.id] ?? 0
    return { ...c, approved, loaded, remaining: c.stock - loaded, available: c.stock - approved - loaded }
  })
}

export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401, headers: NO_STORE })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })
  try {
    return NextResponse.json({ centers: await listCenters(admin) }, { headers: NO_STORE })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500, headers: NO_STORE })
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const { name, stock, notes } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'שם המוקד חובה' }, { status: 400 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const { error } = await admin.from('card_centers').insert({
    name: name.trim(),
    stock: Math.max(0, parseInt(String(stock ?? 0), 10) || 0),
    notes: notes?.trim() || null,
  })
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'מוקד בשם זה כבר קיים' : error.message }, { status: 400 })
  // מלאי חדש נוסף → שיוך אוטומטי של יולדות בתור "ממתין למלאי" ושליחת שובר
  await processAwaitingStock(admin)
  return NextResponse.json({ centers: await listCenters(admin) })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const { id, name, stock, notes, is_active } = await request.json()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) { if (!name.trim()) return NextResponse.json({ error: 'שם חובה' }, { status: 400 }); updates.name = name.trim() }
  if (stock !== undefined) updates.stock = Math.max(0, parseInt(String(stock), 10) || 0)
  if (notes !== undefined) updates.notes = notes?.trim() || null
  if (is_active !== undefined) updates.is_active = !!is_active
  const { error } = await admin.from('card_centers').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'מוקד בשם זה כבר קיים' : error.message }, { status: 400 })
  // עדכון מלאי (למשל הגדלת כמות) → שיוך אוטומטי של יולדות בתור "ממתין למלאי" ושליחת שובר
  await processAwaitingStock(admin)
  return NextResponse.json({ centers: await listCenters(admin) })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  // לא מוחקים מוקד שכבר שויכו אליו כרטיסים
  const { count } = await admin.from('maternity_aids').select('id', { count: 'exact', head: true }).eq('card_center_id', id)
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'לא ניתן למחוק מוקד שכבר שויכו אליו כרטיסים' }, { status: 400 })
  const { error } = await admin.from('card_centers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ centers: await listCenters(admin) })
}
