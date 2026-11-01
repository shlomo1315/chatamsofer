import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'

// עדכון מתגי רשימה: "מסומנת מראש", "פעילה", ושם.
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requirePermission('gilyonot', 'edit')) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (typeof b.preselected === 'boolean') patch.preselected = b.preselected
  if (typeof b.active === 'boolean') patch.active = b.active
  if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim().slice(0, 80)
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  // רשימה כבויה לא יכולה להיות מסומנת מראש
  if (patch.active === false) patch.preselected = false
  const { error } = await db.from('gilyonot_lists').update(patch).eq('id', (await params).id)
  if (error) return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
