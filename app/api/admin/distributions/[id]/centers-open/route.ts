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
    .select('centers_open, centers_deadline').eq('id', id).maybeSingle()
  const row = data as { centers_open?: boolean; centers_deadline?: string | null } | null
  const dl = deadlineState(row?.centers_deadline ?? null)
  return NextResponse.json({
    centers_open: !!row?.centers_open,
    centers_deadline: row?.centers_deadline ?? null,
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
  }

  const patch: Record<string, unknown> = {}

  if (body.centers_open !== undefined) patch.centers_open = !!body.centers_open

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
