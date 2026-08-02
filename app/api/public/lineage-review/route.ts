import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NODE_SELECT, subtreeNodeIds, resyncSubtree, approveVerifiedBeneficiaries, cascadeRejectSubtree, type TreeNodeRow } from '@/lib/lineageSync'
import { logActivity } from '@/lib/activityLog'
import { rateLimit } from '@/lib/rateLimit'
import { clientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// API ציבורי לאישור/תיקון ענף עץ הדורות ע"י בן משפחה, דרך לינק אישי מוגבל.
//
// ⚠️ אבטחה — מבודד לחלוטין מממשק הניהול:
//   • אין כאן שום גישה ל-session/הרשאות צוות. האימות היחיד הוא הטוקן.
//   • כל פעולה מוגבלת ל-subtreeNodeIds(root_node_id) — בן המשפחה לא יכול לגעת
//     בשום צומת מחוץ לענף ששותף לו, גם אם ינחש id.
//   • הטוקן נבדק מול revoked_at + expires_at בכל בקשה — ביטול אדמין תופס מיד.
//   • rate-limiting. אין endpoint שחושף מוטבים/מיילים/מסכי ניהול.
// ─────────────────────────────────────────────────────────────────────────────

function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

interface InviteRow { token: string; root_node_id: string; revoked_at: string | null; expires_at: string; recipient_name: string | null }

// אימות ההזמנה — מחזיר את שורת ההזמנה או null (מבוטלת/פגה/לא קיימת).
async function resolveInvite(admin: SupabaseClient, token: string | null): Promise<InviteRow | null> {
  if (!token) return null
  const { data } = await admin
    .from('lineage_share_invites')
    .select('token, root_node_id, revoked_at, expires_at, recipient_name')
    .eq('token', token)
    .maybeSingle()
  if (!data) return null
  if (data.revoked_at) return null
  if (new Date(data.expires_at) < new Date()) return null
  return data as InviteRow
}

// GET ?token=... → תת-העץ מהצומת ומטה (לתצוגה בעמוד הציבורי)
export async function GET(request: NextRequest) {
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const token = request.nextUrl.searchParams.get('token')
  const inv = await resolveInvite(admin, token)
  if (!inv) return NextResponse.json({ error: 'הקישור אינו תקין, בוטל, או פג תוקפו' }, { status: 403 })

  const { data: allNodes } = await admin.from('lineage_nodes').select(NODE_SELECT)
  const nodes = (allNodes ?? []) as TreeNodeRow[]
  const ids = subtreeNodeIds(nodes, inv.root_node_id)
  // מחזירים רק את צמתי תת-העץ — שום דבר מחוץ ל-scope לא נחשף
  const subtree = nodes.filter(n => ids.has(n.id))

  // עדכון last_used_at (best-effort)
  admin.from('lineage_share_invites').update({ last_used_at: new Date().toISOString() }).eq('token', inv.token).then(() => {}, () => {})

  return NextResponse.json({ rootNodeId: inv.root_node_id, recipientName: inv.recipient_name, nodes: subtree })
}

// POST { token, nodeId, action, name? } → אישור/דחייה/תיקון-שם של צומת בתוך ה-scope
export async function POST(request: NextRequest) {
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const ip = clientIp(request)
  if (!rateLimit(`lineage-review:${ip}`, 40, 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות — נסו שוב בעוד רגע' }, { status: 429 })
  }

  let body: { token?: string; nodeId?: string; action?: 'verify' | 'reject' | 'rename'; name?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const inv = await resolveInvite(admin, body.token ?? null)
  if (!inv) return NextResponse.json({ error: 'הקישור אינו תקין, בוטל, או פג תוקפו' }, { status: 403 })

  const { nodeId, action } = body
  if (!nodeId || !action) return NextResponse.json({ error: 'חסרים פרמטרים' }, { status: 400 })

  // ⚠️ בדיקת ה-scope הקריטית: הצומת חייב להיות בתוך תת-העץ ששותף. אחרת — חסום.
  const { data: allNodes } = await admin.from('lineage_nodes').select(NODE_SELECT)
  const nodes = (allNodes ?? []) as TreeNodeRow[]
  const ids = subtreeNodeIds(nodes, inv.root_node_id)
  if (!ids.has(nodeId)) return NextResponse.json({ error: 'הצומת מחוץ להרשאה' }, { status: 403 })

  const node = nodes.find(n => n.id === nodeId)
  if (!node) return NextResponse.json({ error: 'הצומת לא נמצא' }, { status: 404 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let newStatus: string | null = null
  let newName: string | null = null

  if (action === 'verify') { update.status = 'verified'; newStatus = 'verified' }
  else if (action === 'reject') { update.status = 'rejected'; newStatus = 'rejected' }
  else if (action === 'rename') {
    const clean = String(body.name ?? '').replace(/[^֐-׿ ׳״'"-]/g, '').trim()
    if (!clean) return NextResponse.json({ error: 'שם לא תקין (אותיות עבריות בלבד)' }, { status: 400 })
    if (clean.length > 120) return NextResponse.json({ error: 'השם ארוך מדי' }, { status: 400 })
    update.name = clean; newName = clean
  } else {
    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
  }

  const { error } = await admin.from('lineage_nodes').update(update).eq('id', nodeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // סנכרון לכל האגפים — בדיוק כמו ב-PATCH האדמין:
  // דחיית מפל (צומת נדחה → כל צאצאיו נדחים), רענון lineage_chain, וקידום משפחות.
  let cascaded: string[] = []
  try {
    const fresh = (await admin.from('lineage_nodes').select(NODE_SELECT)).data as TreeNodeRow[] | null
    if (fresh) {
      // דחייה מפילה את כל תת-העץ (לא ייתכן דור נדחה ודור אחריו מאושר)
      if (newStatus === 'rejected') cascaded = await cascadeRejectSubtree(admin, fresh, nodeId)
      await resyncSubtree(admin, fresh, nodeId)
      if (newStatus === 'verified') await approveVerifiedBeneficiaries(admin, fresh, nodeId)
    }
  } catch (e) {
    console.error('[lineage-review] sync failed:', e)
  }

  // לוג — מי (שם/מייל מההזמנה), מתי (created_at), מה. user_id=null (בן משפחה חיצוני).
  await logActivity(admin, {
    userId: null,
    action: action === 'rename' ? 'lineage_node_family_renamed' : action === 'verify' ? 'lineage_node_family_verified' : 'lineage_node_family_rejected',
    entityType: 'lineage_node', entityId: nodeId,
    details: {
      reviewerName: inv.recipient_name, shareToken: inv.token,
      previousStatus: node.status, newStatus,
      previousName: node.name, newName,
    },
  })

  // cascaded — מזהי הצמתים שנדחו במפל (הצומת עצמו + צאצאיו); ה-UI מעדכן אותם
  return NextResponse.json({ ok: true, cascaded })
}
