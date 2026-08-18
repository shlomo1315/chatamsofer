import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אישור / דחייה של בקשות שינוי שם מהאזור האישי.
//
// 🔴 זו הנקודה היחידה שבה שם של רשומה מאושרת משתנה ביוזמת הנרשם. השם מזהה
// את האדם מול המשרד, מול העץ ומול החלוקות — ולכן הוא עובר אדם, מתועד ביומן,
// ודורש הרשאת עריכה מפורשת.
// ─────────────────────────────────────────────────────────────────────────────

/** הבקשות הממתינות — לחלונית ההתראה ולמסך הטיפול. */
export async function GET() {
  const staff = await requirePermission('beneficiaries', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db
    .from('name_change_requests')
    .select('id, beneficiary_id, target, old_name, new_name, requested_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .limit(50)
  if (error) {
    // ⚠️ המיגרציה טרם רצה — מוחזרת רשימה ריקה ולא שגיאה, כדי שהחלונית
    // לא תפיל את הכניסה לתוכנה.
    console.error('[name-changes] שליפה נכשלה:', error.message)
    return NextResponse.json({ requests: [] })
  }

  const ids = [...new Set((data ?? []).map(r => String(r.beneficiary_id)))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: bens } = await db
      .from('beneficiaries')
      .select('id, full_name, family_name')
      .in('id', ids)
    for (const b of bens ?? []) {
      names.set(String(b.id), [b.family_name, b.full_name].filter(Boolean).join(' ') || 'ללא שם')
    }
  }

  return NextResponse.json({
    requests: (data ?? []).map(r => ({
      ...r,
      familyName: names.get(String(r.beneficiary_id)) ?? 'ללא שם',
    })),
  })
}

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { id?: string; approve?: boolean; reason?: string; update_lineage?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
  const approve = body.approve === true

  const { data: req } = await db
    .from('name_change_requests')
    .select('id, beneficiary_id, target, old_name, new_name, status')
    .eq('id', id)
    .maybeSingle()
  if (!req) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  // ⚠️ בקשה שכבר הוכרעה אינה מוכרעת שוב: שני מנהלים שפתחו את החלונית
  // במקביל היו מחילים את השינוי פעמיים.
  if (req.status !== 'pending') {
    return NextResponse.json({ error: 'הבקשה כבר טופלה' }, { status: 409 })
  }

  const now = new Date().toISOString()

  if (!approve) {
    await db.from('name_change_requests').update({
      status: 'rejected',
      reject_reason: String(body.reason ?? '').trim() || null,
      decided_at: now,
      decided_by: staff.userId,
    }).eq('id', id)

    await logActivity(db, {
      userId: staff.userId, action: 'name_change_rejected',
      entityType: 'beneficiary', entityId: String(req.beneficiary_id),
      details: { from: req.old_name, to: req.new_name, target: req.target },
    }).catch(() => {})
    return NextResponse.json({ ok: true, approved: false })
  }

  // ── אישור: השם מוחל על הרשומה ──
  const col = req.target === 'spouse' ? 'spouse_name' : 'full_name'
  const { error: upErr } = await db
    .from('beneficiaries')
    .update({ [col]: req.new_name, updated_at: now })
    .eq('id', String(req.beneficiary_id))
  if (upErr) {
    console.error('[name-changes] עדכון השם נכשל:', upErr.message)
    return NextResponse.json({ error: 'עדכון השם נכשל' }, { status: 500 })
  }

  // ── צומת עץ הדורות ──
  //
  // 🔴 העץ מתעדכן יחד עם הכרטסת: בלי זה העץ ממשיך להציג את השם הישן,
  // והשניים מסתרים — בדיוק המצב שבו איש אינו יודע מה נכון.
  //
  // ⚠️ רק לשם הראשי ('self'): צומת העץ מייצג את הצאצא, ושם בן/בת הזוג
  // אינו השם שהצומת נושא.
  //
  // ⚠️ כשל כאן אינו מבטל את אישור השם — הכרטסת כבר עודכנה, והחזרה
  // לאחור הייתה מותירה את הבקשה במצב לא ברור. מדווח ונרשם ביומן.
  let lineageUpdated = false
  if (req.target === 'self' && body.update_lineage !== false) {
    try {
      const { data: ben } = await db
        .from('beneficiaries')
        .select('lineage_node_id')
        .eq('id', String(req.beneficiary_id))
        .maybeSingle()
      const nodeId = (ben as { lineage_node_id?: string | null })?.lineage_node_id
      if (nodeId) {
        const { error: nodeErr } = await db
          .from('lineage_nodes')
          .update({ name: req.new_name })
          .eq('id', nodeId)
        if (nodeErr) console.error('[name-changes] עדכון צומת העץ נכשל:', nodeErr.message)
        else lineageUpdated = true
      }
    } catch (e) {
      console.error('[name-changes] עדכון צומת העץ נכשל:', e)
    }
  }

  await db.from('name_change_requests').update({
    status: 'approved',
    decided_at: now,
    decided_by: staff.userId,
    lineage_updated: lineageUpdated,
  }).eq('id', id)

  // ⚠️ הערך הישן והחדש ביומן: זו כתיבה על שדה מזהה, וצריך להיות אפשר
  // לשחזר בדיוק מה השתנה ומי אישר.
  await logActivity(db, {
    userId: staff.userId, action: 'name_change_approved',
    entityType: 'beneficiary', entityId: String(req.beneficiary_id),
    details: { from: req.old_name, to: req.new_name, target: req.target, lineage_updated: lineageUpdated },
  }).catch(() => {})

  return NextResponse.json({ ok: true, approved: true, lineageUpdated })
}
