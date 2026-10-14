import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { cleanName } from '@/lib/kvitel'

// מילון השמות המאושרים של סוכן האחידות (lib/kvitelReview).
// POST { names: string[] } — מוסיף שמות (שם הנפש ושם האם) אחרי שאיש צוות אישר את הכתיב.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_NAMES = 100

export async function POST(request: NextRequest) {
  const staff = await requirePermission('kvitel', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown> | null = null
  try { body = await request.json() } catch { /* נבדק מיד */ }
  const raw = body && Array.isArray(body.names) ? body.names : []
  const names = [...new Set(raw.map(cleanName).filter(n => n.length >= 2 && n.length <= 60 && /^[א-ת ]+$/.test(n)))]
  if (!names.length || names.length > MAX_NAMES) return NextResponse.json({ error: 'אין שמות להוספה' }, { status: 400 })

  const { error } = await db.from('kvitel_name_dictionary')
    .upsert(names.map(name => ({ name, created_by: staff.userId })), { onConflict: 'name', ignoreDuplicates: true })
  if (error) {
    console.error('[kvitel] dictionary upsert failed:', error)
    return NextResponse.json({ error: 'ההוספה למילון נכשלה' }, { status: 500 })
  }
  await logActivity(db, { userId: staff.userId, action: 'kvitel_dictionary', entityType: 'kvitel_name_dictionary', entityId: null, details: { names } })
  return NextResponse.json({ ok: true, added: names.length })
}
