import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { sendCardVoucher } from '@/lib/maternityCards'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// עדכון מסלול כרטיס המזון של יולדת. action: approve|reject|pending|load
// approve: דורש centerId עם מקום פנוי (stock > approved+loaded). load: מנכה בפועל מהמלאי.
export async function POST(request: NextRequest) {
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  const { aidId, action, centerId } = await request.json()
  if (!aidId || !['approve', 'reject', 'pending', 'load'].includes(action)) {
    return NextResponse.json({ error: 'פרמטרים חסרים' }, { status: 400 })
  }
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: aid } = await admin.from('maternity_aids').select('id, card_status, card_center_id').eq('id', aidId).maybeSingle()
  if (!aid) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (action === 'reject') {
    updates.card_status = 'rejected'; updates.card_center_id = null; updates.card_loaded_at = null
  } else if (action === 'pending') {
    updates.card_status = 'pending'; updates.card_center_id = null; updates.card_loaded_at = null
  } else if (action === 'approve') {
    // אישור ללא מוקד = אין מלאי כעת → היולדת נכנסת לתור "ממתין למלאי".
    // ברגע שיתחדש מלאי הכרטיסים היא תשויך אוטומטית ותקבל שובר (processAwaitingStock).
    if (!centerId) {
      updates.card_status = 'awaiting_stock'; updates.card_center_id = null
    } else {
      // בדיקת מקום פנוי במוקד (חישוב מחדש בצד שרת)
      const { data: center } = await admin.from('card_centers').select('stock').eq('id', centerId).maybeSingle()
      if (!center) return NextResponse.json({ error: 'מוקד לא נמצא' }, { status: 404 })
      const { count: used } = await admin.from('maternity_aids')
        .select('id', { count: 'exact', head: true })
        .in('card_status', ['approved', 'loaded'])
        .eq('card_center_id', centerId)
        .neq('id', aidId)
      if ((used ?? 0) >= center.stock) {
        return NextResponse.json({ error: 'אין מלאי פנוי במוקד זה' }, { status: 409 })
      }
      updates.card_status = 'approved'; updates.card_center_id = centerId
    }
  } else if (action === 'load') {
    if (aid.card_status !== 'approved') return NextResponse.json({ error: 'ניתן לטעון רק כרטיס מאושר' }, { status: 400 })
    updates.card_status = 'loaded'; updates.card_loaded_at = new Date().toISOString()
  }

  const { error } = await admin.from('maternity_aids').update(updates).eq('id', aidId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // אישור עם מוקד (יש מלאי) → שליחת שובר ליולדת מיד
  if (action === 'approve' && centerId) {
    const { data: c } = await admin.from('card_centers').select('name').eq('id', centerId).maybeSingle()
    await sendCardVoucher(admin, aidId, c?.name ?? null)
  }
  return NextResponse.json({ ok: true })
}
