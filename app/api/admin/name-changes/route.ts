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

  // 🔴 פרטי זיהוי מלאים ולא רק השם.
  //
  // ⚠️ החלונית הציגה "דבי → חיים" בלבד, ובלי ת"ז, שם משפחה, בן/בת זוג
  // וכתובת אי אפשר לדעת *באיזו משפחה* מדובר — שמות פרטיים חוזרים על עצמם.
  // המנהל נאלץ לפתוח את הכרטסת בחלון אחר כדי להכריע, או שאישר בעיוורון.
  // ההכרעה נעשית כאן ולכן גם הנתונים צריכים להיות כאן.
  const ids = [...new Set((data ?? []).map(r => String(r.beneficiary_id)))]
  type BenInfo = {
    familyName: string; id_number: string | null; family_name: string | null
    full_name: string | null; spouse_name: string | null; spouse_id_number: string | null
    city: string | null; address: string | null; phone: string | null
    email: string | null; marital_status: string | null; children_count: number | null
    lineage_chain: { generation: number; name: string; relation: 'son' | 'son_in_law' | null }[] | null
  }
  const info = new Map<string, BenInfo>()
  if (ids.length) {
    const { data: bens } = await db
      .from('beneficiaries')
      .select('id, full_name, family_name, id_number, spouse_name, spouse_id_number, city, address, phone, email, marital_status, children_count, lineage_chain')
      .in('id', ids)
    for (const b of bens ?? []) {
      const r = b as Record<string, unknown>
      info.set(String(b.id), {
        familyName: [r.family_name, r.full_name].filter(Boolean).join(' ') || 'ללא שם',
        id_number: (r.id_number as string) ?? null,
        family_name: (r.family_name as string) ?? null,
        full_name: (r.full_name as string) ?? null,
        spouse_name: (r.spouse_name as string) ?? null,
        spouse_id_number: (r.spouse_id_number as string) ?? null,
        city: (r.city as string) ?? null,
        address: (r.address as string) ?? null,
        phone: (r.phone as string) ?? null,
        email: (r.email as string) ?? null,
        marital_status: (r.marital_status as string) ?? null,
        children_count: (r.children_count as number) ?? null,
        // סדר הדורות — מוצג בחלונית שורה אחרי שורה, כדי שההכרעה על השם
        // תיעשה מול הייחוס ולא רק מול פרטי הזיהוי.
        lineage_chain: Array.isArray(r.lineage_chain)
          ? (r.lineage_chain as { generation: number; name: string; relation: 'son' | 'son_in_law' | null }[])
          : null,
      })
    }
  }

  return NextResponse.json({
    requests: (data ?? []).map(r => {
      const b = info.get(String(r.beneficiary_id))
      return {
        ...r,
        familyName: b?.familyName ?? 'ללא שם',
        beneficiary: b ?? null,
      }
    }),
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
  // ⚠️ שלושה יעדים: שם הבעל / שם האישה / שם המשפחה.
  const col = req.target === 'spouse' ? 'spouse_name' : req.target === 'family' ? 'family_name' : 'full_name'
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
