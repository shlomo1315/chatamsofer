import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, getServiceClient, forbidden } from '@/lib/apiAuth'
import { logAudit } from '@/lib/matchmaker/adminData'
import { decryptValue } from '@/lib/matchmaker/crypto'
import { verifyGrandchild } from '@/lib/matchmaker/grandchildCheck'
import { sendClaimDecision } from '@/lib/matchmaker/mail'

export const dynamic = 'force-dynamic'

// פעולות על בקשה: approve / reject / paid / amount / recheck. כל פעולה נרשמת ביומן.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const { id } = await params
  let body: { action?: string; amount?: unknown; reason?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const actor = staff.email ?? staff.userId

  const { data: c } = await db.from('matchmaker_claims').select('*, matchmakers(first_name, email)').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  const now = new Date().toISOString()
  const mm = c.matchmakers as { first_name: string; email: string } | null
  const groom = `${c.groom_first_name} ${c.groom_last_name}`, bride = `${c.bride_first_name} ${c.bride_last_name}`

  const amountIn = body.amount === '' || body.amount == null ? null : Number(body.amount)
  if (amountIn != null && (!Number.isFinite(amountIn) || amountIn < 0 || amountIn > 1_000_000)) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }

  switch (body.action) {
    case 'approve': {
      const amount = amountIn ?? (c.amount != null ? Number(c.amount) : null)
      if (amount == null || amount <= 0) return NextResponse.json({ error: 'יש לקבוע סכום לפני אישור' }, { status: 400 })
      await db.from('matchmaker_claims').update({ status: 'approved', amount, reject_reason: null, handled_by: actor, handled_at: now }).eq('id', id)
      await logAudit(db, id, 'approve', `סכום ${amount}`, actor)
      if (mm) void sendClaimDecision(mm.email, mm.first_name, groom, bride, true, amount, null).catch(() => {})
      break
    }
    case 'reject': {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
      if (!reason) return NextResponse.json({ error: 'יש לכתוב סיבת דחייה' }, { status: 400 })
      await db.from('matchmaker_claims').update({ status: 'rejected', reject_reason: reason, handled_by: actor, handled_at: now }).eq('id', id)
      await logAudit(db, id, 'reject', reason, actor)
      if (mm) void sendClaimDecision(mm.email, mm.first_name, groom, bride, false, null, reason).catch(() => {})
      break
    }
    case 'paid': {
      if (c.status !== 'approved') return NextResponse.json({ error: 'אפשר לסמן כשולם רק בקשה שאושרה' }, { status: 400 })
      await db.from('matchmaker_claims').update({ status: 'paid', paid_at: now, handled_by: actor, handled_at: now }).eq('id', id).eq('status', 'approved')
      await logAudit(db, id, 'paid', c.amount != null ? `סכום ${c.amount}` : null, actor)
      break
    }
    case 'amount': {
      if (c.status === 'paid') return NextResponse.json({ error: 'לא ניתן לשנות סכום אחרי תשלום' }, { status: 400 })
      await db.from('matchmaker_claims').update({ amount: amountIn }).eq('id', id)
      await logAudit(db, id, 'amount', amountIn == null ? 'נוקה' : `סכום ${amountIn}`, actor)
      break
    }
    case 'recheck': {
      if (!c.is_grandchild || !c.grandchild_side) return NextResponse.json({ error: 'הבקשה לא סומנה כנכד החתם סופר' }, { status: 400 })
      const gId = c.groom_id_enc ? decryptValue(c.groom_id_enc) : null, bId = c.bride_id_enc ? decryptValue(c.bride_id_enc) : null
      if (!gId && !bId) return NextResponse.json({ error: 'לא הוזנה ת"ז לאימות' }, { status: 400 })
      const verification = await verifyGrandchild(db, c.grandchild_side, { groom: gId, bride: bId })
      await db.from('matchmaker_claims').update({ verification }).eq('id', id)
      await logAudit(db, id, 'recheck', verification.result === 'verified' ? 'אומת' : 'לא נמצא', actor)
      break
    }
    default:
      return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

// יומן הבקשה: מי עשה מה ומתי
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return forbidden()
  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const { data } = await db.from('matchmaker_audit').select('action, detail, actor, created_at').eq('claim_id', id).order('created_at', { ascending: false }).limit(100)
  return NextResponse.json({ log: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
