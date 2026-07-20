import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { buildGratitudeVoucher } from '@/lib/gratitudeVoucher'
import { loadGratitudeLetter, voucherInputFromRow } from './shared'

// ניהול מכתב ברכה — אישור/דחייה, עריכת חתימה/אנונימיות, והפקת ה-PDF.
export const dynamic = 'force-dynamic'

const VALID_STATUS = ['received', 'approved', 'rejected'] as const

// GET ?pdf=1 — הפקת השובר המעוצב לצפייה
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('maternity', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const row = await loadGratitudeLetter(db, id)
  if (!row) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })

  if (request.nextUrl.searchParams.get('pdf') === '1') {
    const voucher = await buildGratitudeVoucher(voucherInputFromRow(row))
    return NextResponse.json({ pdf: voucher.contentB64 })
  }

  return NextResponse.json({ letter: row })
}

// PATCH — עדכון סטטוס / חתימה / אנונימיות
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('maternity', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let payload: Record<string, unknown>
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}

  if (typeof payload.status === 'string') {
    if (!VALID_STATUS.includes(payload.status as typeof VALID_STATUS[number])) {
      return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 })
    }
    patch.status = payload.status
    patch.reviewed_by = ctx?.userId ?? null
    patch.reviewed_at = new Date().toISOString()
  }

  if (typeof payload.signature === 'string') {
    patch.signature = payload.signature.replace(/<[^>]*>/g, '').slice(0, 60).trim() || null
  }
  if (typeof payload.is_anonymous === 'boolean') {
    patch.is_anonymous = payload.is_anonymous
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  }

  const { error } = await db.from('gratitude_letters').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
