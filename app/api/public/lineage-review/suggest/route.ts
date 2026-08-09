import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NODE_SELECT, subtreeNodeIds, type TreeNodeRow } from '@/lib/lineageSync'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// הצעת תיקון-ייחוס ע"י בן משפחה — נשמרת כ"ממתינה לאישור" ואינה נוגעת בעץ עד
// שהמנהל מאשר. אבטחה זהה ל-lineage-review: אימות טוקן בלבד, כל צומת מוגבל
// ל-scope של ה-root (subtreeNodeIds), rate-limiting.
// ─────────────────────────────────────────────────────────────────────────────

function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

interface InviteRow { token: string; root_node_id: string; revoked_at: string | null; expires_at: string; recipient_name: string | null; beneficiary_id?: string | null; mode?: string | null }

async function resolveInvite(admin: SupabaseClient, token: string | null): Promise<InviteRow | null> {
  if (!token) return null
  const { data } = await admin
    .from('lineage_share_invites')
    .select('token, root_node_id, revoked_at, expires_at, recipient_name, beneficiary_id, mode')
    .eq('token', token).maybeSingle()
  if (!data || data.revoked_at || new Date(data.expires_at) < new Date()) return null
  return data as InviteRow
}

const NON_HEBREW = /[^֐-׿ ׳״'"-]/g
const cleanName = (s: unknown) => String(s ?? '').replace(NON_HEBREW, '').trim().slice(0, 120)

// POST { token, kind, nodeId?, parentId?, name?, relation?, text? }
export async function POST(request: NextRequest) {
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const ip = clientIp(request)
  if (!rateLimit(`lineage-suggest:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות — נסה שוב בעוד דקה' }, { status: 429 })
  }

  let body: { token?: string; kind?: string; nodeId?: string; parentId?: string; name?: string; relation?: string; text?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const inv = await resolveInvite(admin, body.token ?? null)
  if (!inv) return NextResponse.json({ error: 'הקישור אינו תקין, בוטל, או פג תוקפו' }, { status: 403 })

  const kind = body.kind
  if (!['rename', 'add_child', 'reparent', 'note'].includes(kind ?? '')) {
    return NextResponse.json({ error: 'סוג הצעה לא תקין' }, { status: 400 })
  }

  // ── בדיקת scope: כל node_id/parent_id שנשלח חייב להיות בתוך תת-העץ ששותף ──
  const { rows: nodes } = await fetchAllRows<TreeNodeRow>((from, to) =>
    admin.from('lineage_nodes').select(NODE_SELECT).range(from, to),
  )
  const scope = subtreeNodeIds(nodes, inv.root_node_id)
  const inScope = (id?: string) => !id || scope.has(id)
  // ⚠️ בקישור אישי לתיקון סדר הדורות (mode='order') ההורה המוצע רשאי להיות
  // *כל* צומת בעץ, ולא רק בתוך הענף ששותף. זו כל מהות התיקון: "אינני צאצא
  // של זה אלא של זה" — והצומת הנכון נמצא בהכרח מחוץ לענף השגוי. הצומת
  // המתוקן עצמו (nodeId) עדיין חייב להיות בתחום, כדי שלא יוכל להזיז צמתים
  // אחרים בעץ. ההצעה ממילא נכנסת לתור ואינה נכתבת ישירות.
  const parentAnywhere = inv.mode === 'order' && kind === 'reparent'
  const allIds = new Set(nodes.map(n => n.id))
  const parentOk = parentAnywhere ? (!body.parentId || allIds.has(body.parentId)) : inScope(body.parentId)
  if (!inScope(body.nodeId) || !parentOk) {
    return NextResponse.json({ error: 'הצומת אינו בתוך הענף המשותף' }, { status: 403 })
  }

  // ── ולידציה לפי סוג ──
  const relation = body.relation === 'son' || body.relation === 'son_in_law' ? body.relation : null
  let proposedName: string | null = null
  let payload: Record<string, unknown> | null = null

  if (kind === 'rename') {
    if (!body.nodeId) return NextResponse.json({ error: 'חסר צומת' }, { status: 400 })
    proposedName = cleanName(body.name)
    if (!proposedName) return NextResponse.json({ error: 'שם לא תקין' }, { status: 400 })
  } else if (kind === 'add_child') {
    if (!body.parentId) return NextResponse.json({ error: 'חסר הורה' }, { status: 400 })
    proposedName = cleanName(body.name)
    if (!proposedName) return NextResponse.json({ error: 'שם לא תקין' }, { status: 400 })
  } else if (kind === 'reparent') {
    if (!body.nodeId || !body.parentId) return NextResponse.json({ error: 'חסר צומת או הורה' }, { status: 400 })
    if (body.nodeId === body.parentId) return NextResponse.json({ error: 'צומת לא יכול להיות הורה של עצמו' }, { status: 400 })
  } else if (kind === 'note') {
    const text = String(body.text ?? '').trim().slice(0, 1000)
    if (!text) return NextResponse.json({ error: 'הערה ריקה' }, { status: 400 })
    payload = { text }
  }

  const { error } = await admin.from('lineage_review_suggestions').insert({
    token: inv.token,
    root_node_id: inv.root_node_id,
    kind,
    node_id: body.nodeId ?? null,
    parent_id: body.parentId ?? null,
    proposed_name: proposedName,
    relation,
    payload,
    reviewer_name: inv.recipient_name,
    status: 'pending',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
