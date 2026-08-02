import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getCardReminderSettings, saveCardReminderSettings, DEFAULT_FIRST_DAYS, DEFAULT_SECOND_DAYS } from '@/lib/cardReminderSettings'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// הגדרות תזכורת שיוך/איסוף כרטיס מזון — מתי לשלוח (ימים אחרי הלידה) + הפעלה/כיבוי.
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401, headers: NO_STORE })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })
  return NextResponse.json(await getCardReminderSettings(admin), { headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  if (!(await requirePermission('maternity_cards', 'edit'))) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { enabled?: boolean; firstDays?: number; secondDays?: number | null }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const firstDays = Number.isFinite(Number(body.firstDays)) && Number(body.firstDays) >= 0
    ? Math.trunc(Number(body.firstDays)) : DEFAULT_FIRST_DAYS
  const secondRaw = body.secondDays
  const secondDays = secondRaw == null ? null
    : (Number.isFinite(Number(secondRaw)) && Number(secondRaw) > firstDays ? Math.trunc(Number(secondRaw)) : null)
  if (secondRaw != null && secondDays == null) {
    return NextResponse.json({ error: 'התזכורת השנייה חייבת להיות מאוחרת מהראשונה' }, { status: 400 })
  }

  const settings = { enabled: body.enabled !== false, firstDays, secondDays }
  const ok = await saveCardReminderSettings(admin, settings)
  if (!ok) return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
  return NextResponse.json(settings)
}
