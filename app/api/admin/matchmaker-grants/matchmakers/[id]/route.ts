import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, getServiceClient, forbidden } from '@/lib/apiAuth'
import { logAudit } from '@/lib/matchmaker/adminData'
import { encryptValue } from '@/lib/matchmaker/crypto'
import { validateBank } from '@/lib/matchmaker/validate'

export const dynamic = 'force-dynamic'

// עריכת שדכן על ידי מנהל בלבד: הגבלת בקשות פרטנית ופרטי העברה (השדכן עצמו לא יכול לשנות אותם).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const actor = staff.email ?? staff.userId
  const update: Record<string, unknown> = {}
  const notes: string[] = []

  if ('claims_limit' in body) {
    if (body.claims_limit === '' || body.claims_limit == null) { update.claims_limit = null; notes.push('הגבלה פרטנית הוסרה') }
    else {
      const n = Number(body.claims_limit)
      if (!Number.isInteger(n) || n < 0 || n > 10_000) return NextResponse.json({ error: 'הגבלה לא תקינה' }, { status: 400 })
      update.claims_limit = n; notes.push(`הגבלה פרטנית ${n}`)
    }
  }
  if (body.bank_account) {
    const b = validateBank(body)
    if (!b.ok) return NextResponse.json({ error: b.error }, { status: 400 })
    update.bank_name = b.value.bank_name; update.bank_branch = b.value.bank_branch
    update.bank_account_enc = encryptValue(b.value.bank_account); notes.push('פרטי העברה עודכנו')
  }
  if (!notes.length) return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  const { data, error } = await db.from('matchmakers').update(update).eq('id', id).select('id')
  if (error || !data?.length) return NextResponse.json({ error: 'השדכן לא נמצא' }, { status: error ? 500 : 404 })
  await logAudit(db, null, 'matchmaker_edit', `${id}: ${notes.join(', ')}`, actor)
  return NextResponse.json({ ok: true })
}
