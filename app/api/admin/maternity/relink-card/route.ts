import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getNedarimCreds } from '@/lib/nedarim'
import { relinkMaternityCard } from '@/lib/maternityRelink'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// תיקון שיוך כרטיס ליולדת (כפתור בכרטסת): לקוח נכון לפי ת"ז, שיוך ואימות בכרטסת נדרים.
export async function POST(req: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const { aidId } = await req.json().catch(() => ({})) as { aidId?: string }
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })
  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'חיבור נדרים פלוס לא מוגדר' }, { status: 500 })
  return NextResponse.json(await relinkMaternityCard(db, creds, aidId, staff.userId))
}
