import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { shell } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

// ניהול הזמנות שיתוף ענף בעץ הדורות (אדמין בלבד — lineage/edit).
//   GET    ?rootNodeId=... → רשימת ההזמנות (פעילות + מבוטלות) לצומת, לפאנל הניהול
//   POST   { rootNodeId, recipientName, recipientEmail } → יוצר הזמנה ושולח לינק במייל
//   DELETE { token } → מבטל הרשאה (revoked_at). הלינק מפסיק לעבוד מיד.

export async function GET(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const rootNodeId = request.nextUrl.searchParams.get('rootNodeId')

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  // עם rootNodeId — הזמנות לצומת אחד (חלונית השיתוף בענף).
  // בלי rootNodeId — כל ההזמנות בכל העץ, עם שם הצומת והדור (טבלת הניהול המרכזית).
  if (rootNodeId) {
    const { data } = await admin
      .from('lineage_share_invites')
      .select('token, recipient_name, recipient_email, created_at, expires_at, revoked_at, last_used_at')
      .eq('root_node_id', rootNodeId)
      .order('created_at', { ascending: false })
    return NextResponse.json({ invites: data ?? [] })
  }

  const { data } = await admin
    .from('lineage_share_invites')
    .select('token, root_node_id, recipient_name, recipient_email, created_at, expires_at, revoked_at, last_used_at, node:lineage_nodes(name, generation)')
    .order('created_at', { ascending: false })

  // שיטוח פרטי הצומת (name/generation) לרמה העליונה של כל שורה
  const invites = (data ?? []).map(r => {
    const node = Array.isArray(r.node) ? r.node[0] : r.node
    return {
      token: r.token, root_node_id: r.root_node_id,
      recipient_name: r.recipient_name, recipient_email: r.recipient_email,
      created_at: r.created_at, expires_at: r.expires_at,
      revoked_at: r.revoked_at, last_used_at: r.last_used_at,
      node_name: (node as { name?: string } | null)?.name ?? null,
      node_generation: (node as { generation?: number } | null)?.generation ?? null,
    }
  })
  return NextResponse.json({ invites })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  let body: { rootNodeId?: string; recipientName?: string; recipientEmail?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { rootNodeId } = body
  const recipientName = (body.recipientName ?? '').trim()
  const recipientEmail = (body.recipientEmail ?? '').trim()
  if (!rootNodeId) return NextResponse.json({ error: 'חסר מזהה צומת' }, { status: 400 })
  if (!recipientEmail || !isValidEmail(recipientEmail)) return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  // ודא שהצומת קיים
  const { data: node } = await admin.from('lineage_nodes').select('id, name').eq('id', rootNodeId).maybeSingle()
  if (!node) return NextResponse.json({ error: 'הצומת לא נמצא' }, { status: 404 })

  // טוקן אקראי בר-ביטול (128 ביט)
  const token = randomBytes(16).toString('base64url')

  const { error } = await admin.from('lineage_share_invites').insert({
    token,
    root_node_id: rootNodeId,
    recipient_name: recipientName || null,
    recipient_email: recipientEmail,
    created_by: staff.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
  const link = `${base}/lineage-review/${token}`

  const bodyHtml = `
    <p style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;">שלום ${recipientName || ''},</p>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">
      התבקשתם לעבור על סדר היוחסין של ענף המשפחה (<strong>${node.name}</strong> ומטה) ולאשר / לתקן אותו.
      הגישה מוגבלת לענף זה בלבד.
    </p>
    <div style="text-align:center;margin:0 0 18px;">
      <a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:16px;font-weight:800;text-decoration:none;border-radius:12px;padding:14px 32px;">
        לצפייה ואישור סדר היוחסין
      </a>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;">הקישור אישי ומוגבל לענף זה בלבד. תקף 30 יום.</p>
  `
  const html = shell({
    preheader: 'אישור סדר היוחסין של ענף המשפחה',
    accent: '#4f46e5', title: 'אישור סדר היוחסין', subtitle: 'איגוד צאצאי החתם סופר', body: bodyHtml,
  })

  try {
    await deliverMail(recipientEmail, 'אישור סדר היוחסין — איגוד צאצאי החתם סופר', html, [], mailFor('maternity'))
  } catch (e) {
    // ההזמנה כבר נוצרה — נחזיר הצלחה חלקית עם אזהרה, כדי שהאדמין יוכל להעתיק ידנית
    return NextResponse.json({ ok: true, link, mailError: e instanceof Error ? e.message : String(e) })
  }

  await logActivity(admin, {
    userId: staff.userId, action: 'lineage_share_invite_created',
    entityType: 'lineage_node', entityId: rootNodeId,
    details: { recipientName, recipientEmail },
  })

  return NextResponse.json({ ok: true, link })
}

export async function DELETE(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  let body: { token?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.token) return NextResponse.json({ error: 'חסר טוקן' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const { data: inv } = await admin.from('lineage_share_invites').select('root_node_id, recipient_email').eq('token', body.token).maybeSingle()

  const { error } = await admin
    .from('lineage_share_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', body.token)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(admin, {
    userId: staff.userId, action: 'lineage_share_invite_revoked',
    entityType: 'lineage_node', entityId: inv?.root_node_id ?? null,
    details: { recipientEmail: inv?.recipient_email },
  })

  return NextResponse.json({ ok: true })
}
