import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { CENTER_LOAD_AMOUNT_KEY, getLoadAmount, israelMonth, normalizeCallerPhone } from '@/lib/centerMonthlyLoad'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
const PHONE_RE = /^0\d{8,9}$/

// מסך הניהול: כל המוקדים הפעילים + טלפון מורשה + כרטיס + היסטוריית טעינות + מצב החודש
export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })
  const month = israelMonth()
  const [centers, cards, loads, amount] = await Promise.all([
    admin.from('card_centers').select('id, name').eq('is_active', true).order('name'),
    admin.from('center_monthly_cards').select('center_id, phone, card_number, id_number, card_linked_at'),
    admin.from('center_monthly_loads').select('center_id, month, amount, status, loaded_at, created_at').order('month', { ascending: false }).limit(500),
    getLoadAmount(admin),
  ])
  if (centers.error) return NextResponse.json({ error: centers.error.message }, { status: 500, headers: NO_STORE })
  const cardBy = new Map((cards.data ?? []).map((c) => [c.center_id, c]))
  const rows = (centers.data ?? []).map((c) => {
    const history = (loads.data ?? []).filter((l) => l.center_id === c.id)
    const cur = history.find((l) => l.month === month)
    const card = cardBy.get(c.id)
    return {
      id: c.id, name: c.name,
      phone: card?.phone ?? '', id_number: card?.id_number ?? '', card_number: card?.card_number ?? null,
      thisMonth: cur ? cur.status : 'none',
      history,
    }
  })
  return NextResponse.json({ month, amount, centers: rows }, { headers: NO_STORE })
}

// עדכון טלפון מורשה / ת.ז. / ניקוי כרטיס (center_id) או סכום הטעינה (amount)
export async function PATCH(request: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const body = await request.json().catch(() => ({}))

  if (body.amount !== undefined) {
    const n = Math.round(Number(body.amount))
    if (!Number.isFinite(n) || n <= 0 || n > 5000) return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
    const { error } = await admin.from('app_settings').upsert({ key: CENTER_LOAD_AMOUNT_KEY, value: JSON.stringify(n), updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await logActivity(admin, { userId: staff.userId, action: 'center_monthly_amount', details: { amount: n } })
    return NextResponse.json({ ok: true })
  }

  const centerId = String(body.center_id ?? '')
  if (!centerId) return NextResponse.json({ error: 'חסר מוקד' }, { status: 400 })
  const updates: Record<string, unknown> = { center_id: centerId, updated_at: new Date().toISOString() }

  if (body.phone !== undefined) {
    const phone = normalizeCallerPhone(String(body.phone))
    if (phone && !PHONE_RE.test(phone)) return NextResponse.json({ error: 'מספר טלפון לא תקין' }, { status: 400 })
    updates.phone = phone || null
  }
  if (body.id_number !== undefined) {
    const id = String(body.id_number).replace(/\D/g, '')
    updates.id_number = id || null
  }
  if (body.clear_card) {
    updates.card_number = null
    updates.nedarim_client_id = null
    updates.card_linked_at = null
  }
  const { error } = await admin.from('center_monthly_cards').upsert(updates, { onConflict: 'center_id' })
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'המספר כבר מוגדר למוקד אחר' : error.message }, { status: 400 })
  await logActivity(admin, { userId: staff.userId, action: 'center_monthly_update', entityType: 'card_center', entityId: centerId, details: { fields: Object.keys(updates).filter((k) => k !== 'center_id' && k !== 'updated_at') } })
  return NextResponse.json({ ok: true })
}
