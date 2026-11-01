import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { LIST_COLS, loadLists } from '@/lib/gilyonotLists'

// ניהול רשימות התפוצה לגיליונות: יצירת רשימה חדשה (מעל רשימה חיצונית) וסידור מחדש.
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await requirePermission('gilyonot', 'view')) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  try { return NextResponse.json({ lists: await loadLists(db) }) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}

/** רשימה חדשה: יוצר רשימה חיצונית (contact_lists) וקושר אליה. */
export async function POST(req: Request) {
  if (!await requirePermission('gilyonot', 'edit')) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { name } = await req.json().catch(() => ({})) as { name?: unknown }
  const clean = typeof name === 'string' ? name.trim().slice(0, 80) : ''
  if (!clean) return NextResponse.json({ error: 'חסר שם לרשימה' }, { status: 400 })
  const { data: cl, error } = await db.from('contact_lists').insert({ name: clean }).select('id').single()
  if (error || !cl) return NextResponse.json({ error: 'יצירת הרשימה נכשלה' }, { status: 500 })
  const { data: last } = await db.from('gilyonot_lists').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error: e2 } = await db.from('gilyonot_lists')
    .insert({ name: clean, kind: 'contact_list', contact_list_id: cl.id, sort_order: (last?.sort_order ?? 0) + 10 }).select(LIST_COLS).single()
  if (e2) { await db.from('contact_lists').delete().eq('id', cl.id); return NextResponse.json({ error: 'יצירת הרשימה נכשלה' }, { status: 500 }) }
  return NextResponse.json({ list: data })
}

/** סדר חדש: { order: [id, id, ...] } */
export async function PUT(req: Request) {
  if (!await requirePermission('gilyonot', 'edit')) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { order } = await req.json().catch(() => ({})) as { order?: unknown }
  if (!Array.isArray(order) || order.some(x => typeof x !== 'string') || order.length > 200) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const res = await Promise.all((order as string[]).map((id, i) => db.from('gilyonot_lists').update({ sort_order: (i + 1) * 10 }).eq('id', id)))
  if (res.some(r => r.error)) return NextResponse.json({ error: 'שמירת הסדר נכשלה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
