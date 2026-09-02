import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { deadlineState } from '@/lib/centerDeadline'

export const dynamic = 'force-dynamic'

// מתג בחירת המוקדים בחלוקה.
//
// 🔴 עצמאי משער הרישום: הבחירה נפתחת דווקא *אחרי* שהרישום נסגר, ולכן
// מתג משותף היה חוסם אותה בדיוק כשהיא אמורה לפעול.
//
// ⚠️ הטבלה היא distributions — לשם מצביע distribution_recipients (FK).

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const { data } = await db.from('distributions')
    .select('centers_open, centers_deadline, centers_deadline_extended, pickup_open, pickup_note').eq('id', id).maybeSingle()
  const row = data as {
    centers_open?: boolean; centers_deadline?: string | null
    centers_deadline_extended?: string | null
    pickup_open?: boolean; pickup_note?: string | null
  } | null
  const dl = deadlineState(row?.centers_deadline ?? null)

  // כמה בקבוצת ההארכה, וכמה מהם עדיין לא בחרו — המנהל צריך לדעת על מי
  // ההגדרה חלה בפועל לפני שהוא קובע שעה.
  // ⚠️ head+count ולא שליפת שורות: המספר הוא כל מה שנדרש כאן.
  const [{ count: extTotal }, { count: extPending }] = await Promise.all([
    db.from('distribution_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('distribution_id', id)
      .or('source.eq.admin,deadline_extended.is.true'),
    db.from('distribution_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('distribution_id', id)
      .is('center_id', null)
      .or('source.eq.admin,deadline_extended.is.true'),
  ])

  return NextResponse.json({
    extended_count: { total: extTotal ?? 0, pending: extPending ?? 0 },
    centers_open: !!row?.centers_open,
    centers_deadline: row?.centers_deadline ?? null,
    // 🔴 המועד המוארך — חל על source=admin ועל מי שסומן ידנית.
    centers_deadline_extended: row?.centers_deadline_extended ?? null,
    // 🔴 שער האיסוף — שער שלישי ונפרד. ראו המיגרציה 20260901_pickup_open.
    pickup_open: !!row?.pickup_open,
    pickup_note: row?.pickup_note ?? null,
    // ⚠️ הספירה מחושבת בשרת: שעון הדפדפן עלול להיות מוסט, והמנהל
    // היה רואה מספר אחר ממה שהמשפחות שומעות בטלפון.
    ms_left: dl.msLeft,
    deadline_passed: dl.closed,
  })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({})) as {
    centers_open?: boolean
    /** ⚠️ undefined = לא נגענו במועד. null = הסרת המועד. */
    centers_deadline?: string | null
    /** 🔴 המועד המוארך — לקבוצה בלבד. undefined = לא נגענו, null = ביטול. */
    centers_deadline_extended?: string | null
    /** 🔴 שער האיסוף — נפרד לחלוטין משער הבחירה. */
    pickup_open?: boolean
    pickup_note?: string | null
  }

  const patch: Record<string, unknown> = {}

  if (body.centers_open !== undefined) patch.centers_open = !!body.centers_open
  if (body.pickup_open !== undefined) patch.pickup_open = !!body.pickup_open
  // ⚠️ מחרוזת ריקה נשמרת כ-null: "מחקתי את ההודעה" חייב למחוק אותה.
  if (body.pickup_note !== undefined) {
    patch.pickup_note = String(body.pickup_note ?? '').trim() || null
  }

  // ⚠️ המועד מטופל בנפרד מהמתג: שמירת המתג אינה אמורה למחוק מועד
  // שהוגדר, ולהפך. הבחנה בין undefined ל-null היא כל ההבדל.
  if (body.centers_deadline !== undefined) {
    const raw = String(body.centers_deadline ?? '').trim()
    if (!raw) {
      patch.centers_deadline = null
    } else {
      const at = new Date(raw)
      // 🔴 תאריך פגום נדחה כאן ולא נשמר: deadlineState אינה חוסמת על
      // תאריך פגום (במכוון — לא נועלים משפחות בגלל הקלדה), ולכן ערך
      // שבור היה נשמר בשקט ופשוט לא עושה כלום.
      if (Number.isNaN(at.getTime())) {
        return NextResponse.json({ error: 'תאריך לא תקין' }, { status: 400 })
      }
      patch.centers_deadline = at.toISOString()
    }
  }

  // 🔴 המועד המוארך — לקבוצה בלבד (source=admin או סימון ידני).
  // ⚠️ אותה הבחנה undefined/null בדיוק כמו במועד הכללי.
  if (body.centers_deadline_extended !== undefined) {
    const raw = String(body.centers_deadline_extended ?? '').trim()
    if (!raw) {
      patch.centers_deadline_extended = null
    } else {
      const at = new Date(raw)
      if (Number.isNaN(at.getTime())) {
        return NextResponse.json({ error: 'תאריך ההארכה אינו תקין' }, { status: 400 })
      }
      patch.centers_deadline_extended = at.toISOString()
    }
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  }

  const { error } = await db.from('distributions').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[centers-open] חלוקה ${id}: ${JSON.stringify(patch)} · ${staff.email ?? ''}`)

  const dl = deadlineState((patch.centers_deadline as string | null | undefined) ?? null)
  return NextResponse.json({
    ok: true,
    centers_open: patch.centers_open,
    centers_deadline: patch.centers_deadline ?? undefined,
    ms_left: dl.msLeft,
  })
}
