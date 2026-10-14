import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { shekelsToAgorot } from '@/lib/bookFairPricing'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/bookFairSettlement'

// תשלומים למחברים/מו"לים — דוח ההתחשבנות (app/admin/book-fair/settlement).
//
// POST  — רישום תשלום { payee, amount (₪), method, paidOn, note? }
// PATCH — ביטול תשלום { id }. ⚠️ ביטול ולא מחיקה: ההיסטוריה נשמרת.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try { return await request.json() } catch { return null }
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 })

  const payee = String(body.payee ?? '').trim().slice(0, 200)
  const amount = shekelsToAgorot(body.amount as string | number | null)
  const method = String(body.method ?? '') as PaymentMethod
  const paidOn = String(body.paidOn ?? '')
  const note = String(body.note ?? '').trim().slice(0, 300) || null

  if (!payee) return NextResponse.json({ error: 'חסר שם המחבר/המו"ל' }, { status: 400 })
  if (!amount || amount <= 0) return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  if (!PAYMENT_METHODS.includes(method)) return NextResponse.json({ error: 'אמצעי תשלום לא תקין' }, { status: 400 })
  if (!DATE_RE.test(paidOn) || Number.isNaN(Date.parse(paidOn))) {
    return NextResponse.json({ error: 'תאריך לא תקין' }, { status: 400 })
  }

  const { data, error } = await db.from('book_fair_author_payments').insert({
    payee, amount_agorot: amount, method, paid_on: paidOn, note, created_by: staff.userId,
  }).select('id, payee, amount_agorot, method, paid_on, note, cancelled_at, created_at').single()
  if (error) {
    console.error('[book-fair/settlement] payment insert failed:', error)
    return NextResponse.json({ error: 'שמירת התשלום נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'book_fair_author_payment',
    entityType: 'book_fair_author_payment', entityId: data.id,
    details: { payee, amount_agorot: amount, method, paid_on: paidOn },
  })
  return NextResponse.json({ ok: true, payment: data })
}

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await readBody(request)
  const id = String(body?.id ?? '')
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })

  const { data, error } = await db.from('book_fair_author_payments')
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: staff.userId })
    .eq('id', id).is('cancelled_at', null)
    .select('id, payee, amount_agorot').maybeSingle()
  if (error) {
    console.error('[book-fair/settlement] payment cancel failed:', error)
    return NextResponse.json({ error: 'ביטול התשלום נכשל' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'התשלום לא נמצא או שכבר בוטל' }, { status: 404 })

  await logActivity(db, {
    userId: staff.userId, action: 'book_fair_author_payment_cancel',
    entityType: 'book_fair_author_payment', entityId: id,
    details: { payee: data.payee, amount_agorot: data.amount_agorot },
  })
  return NextResponse.json({ ok: true })
}
