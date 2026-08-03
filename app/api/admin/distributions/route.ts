import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ניהול חלוקות חגים — יצירה, עריכה, ופתיחת/סגירת הרישום.
//
// ⚠️ פתיחת רישום היא בלעדית: פתיחת חלוקה סוגרת אוטומטית כל חלוקה אחרת. הערוץ
// הטלפוני מקריא "החלוקה הפעילה", ושתי חלוקות פתוחות היו הופכות אותו לדו-משמעי
// (וגם את הצפי התקציבי לבלתי-קריא). במסד יש אינדקס ייחודי שאוכף זאת; כאן זה
// נעשה מסודר, כדי שהמנהל לא יקבל שגיאת מסד אלא התנהגות מובנת.
// ─────────────────────────────────────────────────────────────────────────────

interface Body {
  id?: string
  name?: string
  year?: string
  description?: string
  amount_per_family?: number | null
  registration_open?: boolean
  distribution_date?: string | null
  status?: string
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('distributions', 'add')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'שם החלוקה חובה' }, { status: 400 })

  const amount = body.amount_per_family == null ? null : Number(body.amount_per_family)
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }

  const { data, error } = await db.from('distributions').insert({
    name,
    year: String(body.year ?? '').trim() || null,
    description: String(body.description ?? '').trim() || null,
    amount_per_family: amount,
    distribution_date: body.distribution_date || null,
    status: 'planning',
    registration_open: false,
    created_by: staff.userId,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, { userId: staff.userId, action: 'distribution_created', entityType: 'distribution', entityId: data.id, details: { name, amount } }).catch(() => {})
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'שם החלוקה חובה' }, { status: 400 })
    updates.name = name
  }
  if (body.year !== undefined) updates.year = String(body.year).trim() || null
  if (body.description !== undefined) updates.description = String(body.description).trim() || null
  if (body.distribution_date !== undefined) updates.distribution_date = body.distribution_date || null
  if (body.status !== undefined) updates.status = body.status
  if (body.amount_per_family !== undefined) {
    const amount = body.amount_per_family == null ? null : Number(body.amount_per_family)
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
    }
    updates.amount_per_family = amount
  }

  if (body.registration_open !== undefined) {
    const open = body.registration_open === true
    if (open) {
      // סוגרים כל חלוקה אחרת לפני הפתיחה — בלעדיות (ראו ההערה בראש הקובץ)
      await db.from('distributions')
        .update({ registration_open: false, registration_closed_at: new Date().toISOString() })
        .eq('registration_open', true)
        .neq('id', id)
      updates.registration_open = true
      updates.registration_opened_at = new Date().toISOString()
      updates.registration_closed_at = null
      // חלוקה שנפתחה לרישום היא חלוקה פעילה
      if (body.status === undefined) updates.status = 'active'
    } else {
      updates.registration_open = false
      updates.registration_closed_at = new Date().toISOString()
    }
  }

  const { error } = await db.from('distributions').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, {
    userId: staff.userId, action: 'distribution_updated',
    entityType: 'distribution', entityId: id, details: updates,
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
