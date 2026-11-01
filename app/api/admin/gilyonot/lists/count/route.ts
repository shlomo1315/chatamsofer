import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { resolveRecipients } from '@/lib/gilyonotLists'

// כמה נמענים ייחודיים יקבלו, לפי הרשימות שנבחרו. מוצג מיד בשלב השליחה.
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: Request) {
  if (!await requirePermission('gilyonot', 'view')) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { listIds } = await req.json().catch(() => ({})) as { listIds?: unknown }
  if (!Array.isArray(listIds) || listIds.some(x => typeof x !== 'string') || listIds.length > 100) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  try {
    const r = await resolveRecipients(db, listIds as string[])
    return NextResponse.json({ total: r.recipients.length, perList: r.perList, duplicates: r.duplicates, suppressed: r.suppressed })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
