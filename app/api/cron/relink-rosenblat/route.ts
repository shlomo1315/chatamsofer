// ⚠️ זמני: הרצה חד-פעמית של תיקון שיוך כרטיס 5399 ליולדת רוזנבלט (aid 974383fa). מוגן ב-CRON_SECRET. להסיר מיד אחרי ההרצה.
import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronSecret, getServiceClient } from '@/lib/apiAuth'
import { getNedarimCreds } from '@/lib/nedarim'
import { relinkMaternityCard } from '@/lib/maternityRelink'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCronSecret(request)) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const db = getServiceClient()
  const creds = await getNedarimCreds()
  if (!db || !creds) return NextResponse.json({ error: 'חיבור חסר' }, { status: 500 })
  return NextResponse.json(await relinkMaternityCard(db, creds, '974383fa-f31c-446c-8f01-2a880ea63043', null))
}
