import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'

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
  const { data } = await db.from('distributions').select('centers_open').eq('id', id).maybeSingle()
  return NextResponse.json({ centers_open: !!(data as { centers_open?: boolean } | null)?.centers_open })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({})) as { centers_open?: boolean }
  const next = !!body.centers_open

  const { error } = await db.from('distributions').update({ centers_open: next }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[centers-open] חלוקה ${id}: בחירת מוקדים ${next ? 'נפתחה' : 'נסגרה'} · ${staff.email ?? ''}`)
  return NextResponse.json({ ok: true, centers_open: next })
}
