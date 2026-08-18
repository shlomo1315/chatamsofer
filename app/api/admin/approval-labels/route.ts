import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// תוויות סיבת אישור — הרשימה ושיוכה לאנשים.
//
// הרקע: אישור חריג הוא אדם שאינו צאצא אך אושר להצטרף ("משפחת שטרן"). כשבקשת
// הטבה שלו מגיעה לטיפול, המזכיר רואה שם שאינו במאגר הצאצאים ואין לו דרך לדעת
// אם זו טעות או אישור מכוון, ובזכות מה. התווית עונה על זה בכל מסך.
//
// ⚠️ הרשאת 'beneficiaries' ולא 'distributions': התווית היא תכונה של האדם
// ומוצגת בכל המחלקות, לא נתון של חלוקה מסוימת.
// ─────────────────────────────────────────────────────────────────────────────

/** הצבעים המותרים — מוגבל כדי שהתגים ייראו כמערכת אחת ולא כקשת. */
const COLORS = ['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'violet'] as const
type Color = typeof COLORS[number]

interface Body {
  id?: string
  name?: string
  color?: string
  notes?: string
  /** שיוך: התווית לאדם. null מנתק. */
  beneficiary_id?: string
  /** מסלול אצווה — שיוך תווית לרשימת אנשים בבקשה אחת. */
  beneficiary_ids?: unknown[]
  label_id?: string | null
}

export async function GET() {
  const staff = await requirePermission('beneficiaries', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db
    .from('approval_labels')
    .select('id, name, color, notes, created_at')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ⚠️ מונה השיוכים נשלף יחד עם הרשימה: "כמה אנשים בקבוצה" הוא בדיוק
  // הנתון שבגללו מסתכלים על המסך, ושאילתה נפרדת לכל תווית הייתה N+1.
  const { data: counts } = await db
    .from('beneficiaries')
    .select('approval_label_id')
    .not('approval_label_id', 'is', null)

  const byLabel = new Map<string, number>()
  for (const row of counts ?? []) {
    const k = String((row as { approval_label_id?: string }).approval_label_id ?? '')
    if (k) byLabel.set(k, (byLabel.get(k) ?? 0) + 1)
  }

  return NextResponse.json({
    labels: (data ?? []).map(l => ({ ...l, count: byLabel.get(String(l.id)) ?? 0 })),
  })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'שם התווית חובה' }, { status: 400 })
  const color: Color = COLORS.includes(body.color as Color) ? body.color as Color : 'slate'

  const { data, error } = await db.from('approval_labels').insert({
    name,
    color,
    notes: String(body.notes ?? '').trim() || null,
    created_by: staff.userId,
  }).select('id').single()

  if (error) {
    // ⚠️ שם כפול אינו שגיאת מערכת — הוא בדיוק מה שהאינדקס נועד למנוע,
    // והמנהל צריך לראות הסבר ולא קוד מסד.
    if (String((error as { code?: string }).code) === '23505') {
      return NextResponse.json({ error: 'כבר קיימת תווית בשם זה' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'approval_label_created',
    entityType: 'approval_label', entityId: data.id, details: { name, color },
  }).catch(() => {})

  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // ── מסלול א׳: שיוך תווית לאדם ──
  // ── מסלול אצווה: תווית אחת לרשימת אנשים ──
  //
  // 🔴 בקשה אחת לכל הקבוצה. הלקוח שלח בקשה נפרדת לכל אדם, ו-50 סימונים
  // הפכו לעשרות שניות שבהן הכפתור נראה תקוע בלי שום חיווי.
  if (Array.isArray(body.beneficiary_ids)) {
    const ids = [...new Set(body.beneficiary_ids.map(v => String(v ?? '').trim()).filter(Boolean))]
    if (!ids.length) return NextResponse.json({ error: 'לא נבחרו רשומות' }, { status: 400 })
    if (ids.length > 500) return NextResponse.json({ error: 'אפשר לשייך עד 500 בכל פעם' }, { status: 400 })
    const labelId = body.label_id ? String(body.label_id).trim() : null

    const { error } = await db
      .from('beneficiaries')
      .update({ approval_label_id: labelId })
      .in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ⚠️ שורת יומן אחת לאצווה — 50 שורות זהות הופכות את היומן לבלתי
    // קריא בדיוק ביום שמחפשים בו את הפעולה.
    await logActivity(db, {
      userId: staff.userId, action: labelId ? 'approval_label_assigned_bulk' : 'approval_label_cleared_bulk',
      entityType: 'beneficiary', entityId: null,
      details: { count: ids.length, label_id: labelId },
    }).catch(() => {})
    return NextResponse.json({ ok: true, updated: ids.length })
  }

  if (body.beneficiary_id !== undefined) {
    const benId = String(body.beneficiary_id ?? '').trim()
    if (!benId) return NextResponse.json({ error: 'חסר מזהה המשפחה' }, { status: 400 })
    // ⚠️ null מנתק במכוון — ביטול שיוך הוא פעולה תקינה ולא שגיאה.
    const labelId = body.label_id ? String(body.label_id).trim() : null

    const { error } = await db
      .from('beneficiaries')
      .update({ approval_label_id: labelId })
      .eq('id', benId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logActivity(db, {
      userId: staff.userId, action: 'approval_label_assigned',
      entityType: 'beneficiary', entityId: benId, details: { label_id: labelId },
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  // ── מסלול ב׳: עריכת התווית עצמה ──
  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'שם התווית חובה' }, { status: 400 })
    updates.name = name
  }
  if (body.color !== undefined && COLORS.includes(body.color as Color)) updates.color = body.color
  if (body.notes !== undefined) updates.notes = String(body.notes).trim() || null
  if (!Object.keys(updates).length) return NextResponse.json({ ok: true })

  const { error } = await db.from('approval_labels').update(updates).eq('id', id)
  if (error) {
    if (String((error as { code?: string }).code) === '23505') {
      return NextResponse.json({ error: 'כבר קיימת תווית בשם זה' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'approval_label_updated',
    entityType: 'approval_label', entityId: id, details: updates,
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'delete')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const id = String(request.nextUrl.searchParams.get('id') ?? '').trim()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  // ⚠️ האנשים אינם נמחקים — on delete set null במסד מנתק אותם מהתווית
  // והם נשארים כאישור חריג בלי שיוך. נאמר כמה, כדי שהמחיקה לא תפתיע.
  const { data: affected } = await db
    .from('beneficiaries')
    .select('id')
    .eq('approval_label_id', id)

  const { error } = await db.from('approval_labels').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, {
    userId: staff.userId, action: 'approval_label_deleted',
    entityType: 'approval_label', entityId: id,
    details: { unlinked: (affected ?? []).length },
  }).catch(() => {})

  return NextResponse.json({ ok: true, unlinked: (affected ?? []).length })
}
