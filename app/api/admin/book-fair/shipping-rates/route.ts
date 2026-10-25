import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { AGREED_RATES_KEY, agreedRatesError } from '@/lib/bookFairShipping'
import { loadAgreedRates } from '@/lib/bookFairAgreedRates'
import { shekelsToAgorot } from '@/lib/bookFairPricing'

// התעריף המוסכם לפי כרך: סכום לכל מספר כרכים. משפיע מיד על בקרת ההזמנות
// ועל "משלוחים לפי עיר".

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const rates = await loadAgreedRates(db as never)
  return NextResponse.json({ rates }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: { prices?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  // המסך שולח שקלים; ההמרה לאגורות כאן, כמו במדרגות.
  const prices = Array.isArray(body.prices) ? body.prices : []
  const rates: unknown[] = prices.map(p => shekelsToAgorot(typeof p === 'number' || typeof p === 'string' ? p : null))
  const bad = agreedRatesError(rates)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  const { error } = await db.from('app_settings').upsert(
    { key: AGREED_RATES_KEY, value: JSON.stringify(rates), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) {
    console.error('[book-fair/shipping-rates] save failed:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }
  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'app_settings',
    entityId: AGREED_RATES_KEY, details: { rates },
  })
  return NextResponse.json({ ok: true, rates })
}
