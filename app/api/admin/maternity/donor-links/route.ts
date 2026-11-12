import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { generateDonorToken } from '@/lib/donorReport'
import { hashDonorPassword, validateDonorPassword } from '@/lib/donorReportAuth'

export const dynamic = 'force-dynamic'

// ניהול קישורי דוח יולדות לנדיב: רשימה, יצירה וביטול.
const COLS = 'id, token, label, recovery_home, created_at, created_by, revoked_at, last_used_at'

// ⚠️ ה-hash לעולם לא יוצא ללקוח: מחזירים רק has_password.
const withFlag = (l: Record<string, unknown>) => { const { password_hash, ...rest } = l; return { ...rest, has_password: !!password_hash } }

export async function GET() {
  const staff = await requirePermission('maternity', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const [links, homes] = await Promise.all([
    db.from('donor_report_links').select(`${COLS}, password_hash`).order('created_at', { ascending: false }),
    db.from('recovery_homes').select('name').order('name'),
  ])
  if (links.error) return NextResponse.json({ error: 'שליפת הקישורים נכשלה' }, { status: 500 })
  return NextResponse.json({
    links: (links.data ?? []).map(l => withFlag(l as unknown as Record<string, unknown>)),
    homes: (homes.data ?? []).map(h => h.name as string),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { label?: string; recovery_home?: string | null; password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!label || label.length > 120) return NextResponse.json({ error: 'יש להזין שם לקישור (עד 120 תווים)' }, { status: 400 })
  const home = typeof body.recovery_home === 'string' ? body.recovery_home.trim() : ''
  if (home.length > 120) return NextResponse.json({ error: 'שם בית החלמה ארוך מדי' }, { status: 400 })

  const pwErr = validateDonorPassword(body.password)
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 })

  const { data, error } = await db.from('donor_report_links')
    .insert({ token: generateDonorToken(), label, password_hash: await hashDonorPassword(body.password as string), recovery_home: home || null, created_by: staff.email ?? null })
    .select(COLS).single()
  if (error) return NextResponse.json({ error: 'יצירת הקישור נכשלה' }, { status: 500 })
  return NextResponse.json({ link: data })
}

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { id?: string; password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  // הגדרה או החלפת סיסמה (פוסלת כניסות קיימות).
  if (body.password !== undefined) {
    const pwErr = validateDonorPassword(body.password)
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 })
    const { error } = await db.from('donor_report_links')
      .update({ password_hash: await hashDonorPassword(body.password) }).eq('id', body.id).is('revoked_at', null)
    if (error) return NextResponse.json({ error: 'עדכון הסיסמה נכשל' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await db.from('donor_report_links')
    .update({ revoked_at: new Date().toISOString() }).eq('id', body.id).is('revoked_at', null)
  if (error) return NextResponse.json({ error: 'הביטול נכשל' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
