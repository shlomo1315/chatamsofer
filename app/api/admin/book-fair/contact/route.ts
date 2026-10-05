import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { OFFICE_CONTACT_KEY, parseOfficeContact, cleanOfficePhone, DEFAULT_OFFICE_EMAIL } from '@/lib/bookFairTracking'
import { emailError, cleanEmail } from '@/lib/emailAddress'

// פרטי הקשר למשרד שמוצגים ללקוח בדף מעקב ההזמנה ("המשלוח מתעכב? פנו אלינו").

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { data } = await db.from('app_settings').select('value').eq('key', OFFICE_CONTACT_KEY).maybeSingle()
  return NextResponse.json(parseOfficeContact(data?.value ?? null), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: { phone?: string; email?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const rawPhone = String(body.phone ?? '').trim()
  const phone = rawPhone ? cleanOfficePhone(rawPhone) : null
  if (rawPhone && !phone) {
    return NextResponse.json({ error: 'מספר טלפון לא תקין (9–10 ספרות, מתחיל ב-0)' }, { status: 400 })
  }

  const rawEmail = cleanEmail(String(body.email ?? ''))
  const email = rawEmail || DEFAULT_OFFICE_EMAIL
  const bad = emailError(email)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  // 🔴 JSON.stringify — app_settings.value היא text, ואובייקט גולמי נשמר
  // בשקט כ-"[object Object]".
  const { error } = await db.from('app_settings').upsert(
    { key: OFFICE_CONTACT_KEY, value: JSON.stringify({ phone, email }), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) {
    console.error('[book-fair/contact] save failed:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'app_settings',
    entityId: OFFICE_CONTACT_KEY, details: { phone, email },
  })

  return NextResponse.json({ ok: true, phone, email })
}
