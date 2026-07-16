import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'

// ניהול רשימת ההסרות — מי ביקש להיות מוסר, והחזרה לרשימה.
export const dynamic = 'force-dynamic'

const REASON_LABELS: Record<string, string> = {
  user: 'ביקש/ה להסיר',
  bounce: 'כתובת שגויה',
  complaint: 'סימן/ה כספאם',
  manual: 'הוסר/ה ידנית',
}

export async function GET() {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db
    .from('unsubscribes')
    .select('email, reason, created_at, beneficiary_id, campaign_id')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // שמות המוטבים — כדי שהמסך יציג שם ולא רק כתובת
  const ids = (data ?? []).map(r => r.beneficiary_id).filter(Boolean) as string[]
  const names: Record<string, string> = {}

  if (ids.length) {
    const { data: bens } = await db
      .from('beneficiaries')
      .select('id, family_name, full_name')
      .in('id', ids)
    for (const b of bens ?? []) {
      names[String(b.id)] = [b.family_name, b.full_name].filter(Boolean).join(' ')
    }
  }

  return NextResponse.json({
    unsubscribes: (data ?? []).map(r => ({
      email: r.email,
      name: r.beneficiary_id ? (names[String(r.beneficiary_id)] ?? '') : '',
      reason: r.reason,
      reasonLabel: REASON_LABELS[String(r.reason)] ?? String(r.reason),
      at: r.created_at,
    })),
  })
}

// DELETE — החזרה לרשימת התפוצה
export async function DELETE(request: NextRequest) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const email = (request.nextUrl.searchParams.get('email') ?? '').toLowerCase().trim()
  if (!email) return NextResponse.json({ error: 'חסרה כתובת' }, { status: 400 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { error } = await db.from('unsubscribes').delete().eq('email', email)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[unsubscribe] ${email} הוחזר לרשימת התפוצה ע"י ${ctx?.email}`)
  return NextResponse.json({ ok: true })
}
