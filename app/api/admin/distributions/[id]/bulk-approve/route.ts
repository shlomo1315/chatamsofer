import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { logActivity } from '@/lib/activityLog'
import { scopeBulkApproval, type ApprovalCandidate } from '@/lib/bulkApproval'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// אישור המוני של נרשמים לחלוקה.
//
// 🔴 אישור פותח את הדרך לכסף: מאושר יכול לבחור מוקד, ומי שבחר ייטען.
// לכן אותו דפוס בדיוק כמו בטעינה — GET מציג תצוגה מקדימה ואינו כותב,
// POST דורש confirm:true מפורש.
//
// 🔴 לעולם לא נוגעים במי שכבר הוכרע ידנית. "אשר את כולם" שהופך דחייה
// לאישור הוא תקלה בלתי הפיכה: אי אפשר לדעת מי נדחה בכוונה.
//
// ⚠️ אין middleware בפרויקט — כל ראוט מגן על עצמו.
// ─────────────────────────────────────────────────────────────────────────────

interface Ben { id_number: string | null }

interface Row {
  id: string
  approval_status: string | null
  beneficiary: Ben | Ben[] | null
}

/** ⚠️ Supabase מחזיר join כמערך או כאובייקט — שתי הצורות נתמכות. */
const firstBen = (b: Row['beneficiary']): Ben | null =>
  Array.isArray(b) ? (b[0] ?? null) : b

/**
 * ⚠️ fetchAllRows ולא שאילתה בודדת: תקרת 1,000 השקטה הייתה חותכת
 * את הרשימה, ואישור המוני על חלוקה של 6,000 היה מדלג על רובה
 * בלי שום סימן.
 */
async function loadCandidates(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  distributionId: string,
): Promise<ApprovalCandidate[]> {
  const { rows } = await fetchAllRows<Row>((from, to) => db
    .from('distribution_recipients')
    .select('id, approval_status, beneficiary:beneficiaries(id_number)')
    .eq('distribution_id', distributionId)
    .range(from, to))

  return rows.map(r => ({
    id: r.id,
    approval_status: r.approval_status,
    idNumber: firstBen(r.beneficiary)?.id_number ?? null,
  }))
}

/** תצוגה מקדימה — כמה יאושרו ומי יידלג. אינה כותבת דבר. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const scope = scopeBulkApproval(await loadCandidates(db, id))

  return NextResponse.json({
    eligible: scope.ids.length,
    total: scope.total,
    skipped: scope.skipped,
  })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({})) as {
    confirm?: boolean
    /** אופציונלי — צמצום לשורות שסומנו. אינו מרחיב את הכללים. */
    ids?: string[]
  }

  // 🔴 שער האישור. בלי confirm מפורש לא מאשרים דבר.
  if (!body.confirm) {
    return NextResponse.json({ error: 'נדרש אישור מפורש' }, { status: 400 })
  }

  const onlyIds = body.ids?.length ? new Set(body.ids.map(String)) : undefined
  const scope = scopeBulkApproval(await loadCandidates(db, id), { onlyIds })

  if (!scope.ids.length) {
    return NextResponse.json({ ok: true, approved: 0, note: 'אין מי לאשר', skipped: scope.skipped })
  }

  // ⚠️ בקבוצות: IN עם אלפי מזהים חורג ממגבלת אורך השאילתה של PostgREST
  // ונדחה — האישור היה נכשל דווקא בחלוקה הגדולה שבשבילה הוא נבנה.
  const CHUNK = 500
  let approved = 0
  for (let i = 0; i < scope.ids.length; i += CHUNK) {
    const slice = scope.ids.slice(i, i + CHUNK)
    const { error } = await db.from('distribution_recipients')
      .update({ approval_status: 'approved' })
      .in('id', slice)
      // 🔴 תנאי מרוץ: השורה חייבת להיות עדיין 'pending' *ברגע הכתיבה*.
      // בלעדיו אישור ידני שנעשה בין הבדיקה לכתיבה היה נדרס.
      .eq('approval_status', 'pending')
    if (error) {
      return NextResponse.json(
        { error: error.message, approved }, { status: 500 })
    }
    approved += slice.length
  }

  console.log(`[bulk-approve] חלוקה ${id}: ${approved} אושרו · ${staff.email ?? ''}`)
  await logActivity(db, {
    userId: staff.userId, action: 'distribution_bulk_approve',
    entityType: 'distribution', entityId: id,
    details: { approved, skipped: scope.skipped },
  }).catch(() => {})

  return NextResponse.json({ ok: true, approved, skipped: scope.skipped })
}
