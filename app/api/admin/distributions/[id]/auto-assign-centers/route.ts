import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { buildAssignPlan, type AssignCenter, type AssignRecipient } from '@/lib/autoAssignCenters'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// שיבוץ אוטומטי למוקד לפי עיר — למי שלא בחר עד תום המועד.
//
// GET  — תצוגה מקדימה בלבד. לא נוגע בדבר.
// POST — הביצוע.
//
// 🔴 שני שלבים ולא אחד: הפעולה כותבת על מאות שורות ונועלת בחירה. כפתור
// שמבצע מיד היה מחייב את המנהל לסמוך על מספר שלא ראה.
//
// 🔴 כל שיבוץ נושא center_source='auto' — כך יידע לתמיד מי בחר בעצמו ומי
// שובץ על ידינו, וזו בדיוק ההבחנה שנדרשת לחלוקה הבאה.
//
// ⚠️ מדלג על מי שהמועד המוארך שלו עדיין פתוח: שיבוץ נועל את הבחירה, ולא
// נועלים משפחה שעוד רשאית לבחור בעצמה. ראו lib/centerDeadline.
// ─────────────────────────────────────────────────────────────────────────────

interface RecRow {
  id: string
  source: string | null
  deadline_extended: boolean | null
  beneficiary: { city: string | null } | { city: string | null }[] | null
}

/** שולף את מה שנדרש לתכנון, ובונה את התוכנית. */
async function loadPlan(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  distributionId: string,
  skipExtended: boolean,
) {
  // המוקדים הפתוחים בחלוקה הזו
  const { data: openRows } = await db.from('holiday_center_openings')
    .select('center_id').eq('distribution_id', distributionId)
  const openIds = (openRows ?? []).map(r => String((r as { center_id: string }).center_id))
  if (!openIds.length) return { error: 'לא הוגדרו מוקדים פתוחים בחלוקה זו' as const }

  const { data: centerRows } = await db.from('holiday_centers')
    .select('id, name, city, is_active').in('id', openIds)

  // כמה כבר משובצים בכל מוקד — קובע מיהו המוקד הגדול בעיר.
  // ⚠️ שליפה בדפים: .limit() לבדו נחתך ל-1000. ראו lib/fetchAllRows.
  const { rows: assigned } = await fetchAllRows<{ center_id: string | null }>((from, to) =>
    db.from('distribution_recipients').select('center_id')
      .eq('distribution_id', distributionId).not('center_id', 'is', null).range(from, to))
  const taken = new Map<string, number>()
  for (const r of assigned) {
    if (r.center_id) taken.set(r.center_id, (taken.get(r.center_id) ?? 0) + 1)
  }

  const centers: AssignCenter[] = (centerRows ?? [])
    .filter(c => (c as { is_active?: boolean }).is_active !== false)
    .map(c => {
      const row = c as { id: string; name: string | null; city: string | null }
      return { id: row.id, name: row.name, city: row.city, taken: taken.get(row.id) ?? 0 }
    })

  // מי עדיין בלי מוקד
  const { rows: pending } = await fetchAllRows<RecRow>((from, to) =>
    db.from('distribution_recipients')
      .select('id, source, deadline_extended, beneficiary:beneficiaries(city)')
      .eq('distribution_id', distributionId).is('center_id', null).range(from, to))

  // ⚠️ join של Supabase מחזיר מערך או אובייקט לפי ההקשר — מטפלים בשתי הצורות.
  const recipients: AssignRecipient[] = pending.map(r => {
    const b = Array.isArray(r.beneficiary) ? r.beneficiary[0] : r.beneficiary
    return {
      id: r.id, city: b?.city ?? null,
      source: r.source, deadline_extended: r.deadline_extended,
    }
  })

  return { plan: buildAssignPlan(recipients, centers, { skipExtended }) }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireStaff(['admin']))) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const skipExtended = request.nextUrl.searchParams.get('include_extended') !== '1'
  const res = await loadPlan(db, id, skipExtended)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })

  const { plan } = res
  return NextResponse.json({
    total: plan.rows.length,
    byCenter: plan.byCenter,
    noCenterInCity: plan.noCenterInCity,
    noCity: plan.noCity,
    skippedStillOpen: plan.skippedStillOpen,
  })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // 🔒 מנהלים בלבד — כתיבה על מאות שורות שנועלת בחירה.
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({})) as {
    includeExtended?: boolean
    /** מספר השורות שהוצגו בתצוגה המקדימה — אישור שהמנהל ראה את המספר. */
    expected?: number
  }
  const skipExtended = body.includeExtended !== true

  const res = await loadPlan(db, id, skipExtended)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
  const { plan } = res

  if (!plan.rows.length) {
    return NextResponse.json({ ok: true, assigned: 0, message: 'אין מי לשבץ' })
  }

  // 🔴 התוכנית נבנית מחדש בשרת ואינה מגיעה מהלקוח.
  //
  // ⚠️ expected הוא בדיקת-שפיות בלבד: אם משפחה בחרה מוקד בין התצוגה
  // המקדימה ללחיצה, המספר זז — והמנהל צריך לראות את המספר החדש ולא
  // לגלות בדיעבד ששובצו יותר או פחות ממה שאישר.
  if (typeof body.expected === 'number' && body.expected !== plan.rows.length) {
    return NextResponse.json({
      error: `המצב השתנה: כעת ${plan.rows.length} לשיבוץ במקום ${body.expected}. רעננו ונסו שוב.`,
      current: plan.rows.length,
    }, { status: 409 })
  }

  // ⚠️ עדכון מקובץ לפי מוקד: שאילתה אחת לכל מוקד במקום אחת לכל שורה.
  // ⚠️ is('center_id', null) נשמר גם כאן — מרוץ מול משפחה שבוחרת באותו
  // רגע לא ידרוס את בחירתה שלה.
  const byCenter = new Map<string, string[]>()
  for (const r of plan.rows) {
    const arr = byCenter.get(r.centerId)
    if (arr) arr.push(r.recipientId)
    else byCenter.set(r.centerId, [r.recipientId])
  }

  let assigned = 0
  const now = new Date().toISOString()
  for (const [centerId, ids] of byCenter) {
    // ⚠️ במנות: רשימת מזהים ארוכה מדי נחתכת בשקט ב-PostgREST.
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { data, error } = await db.from('distribution_recipients')
        .update({ center_id: centerId, center_source: 'auto', center_chosen_at: now })
        .in('id', chunk)
        .is('center_id', null)
        .select('id')
      if (error) {
        console.error('[auto-assign] update failed:', error.message)
        return NextResponse.json({ error: error.message, assigned }, { status: 500 })
      }
      assigned += (data ?? []).length
    }
  }

  console.log(
    `[auto-assign] חלוקה ${id}: ${assigned} שובצו אוטומטית · ${staff.email ?? ''}`,
  )

  return NextResponse.json({
    ok: true,
    assigned,
    noCenterInCity: plan.noCenterInCity,
    skippedStillOpen: plan.skippedStillOpen,
  })
}
