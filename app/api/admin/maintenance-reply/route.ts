import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, getServiceClient } from '@/lib/apiAuth'

// הגדרות המענה האוטומטי הזמני ("המערכת בפיתוח").
// נשמר ב-app_settings תחת maintenance_reply.
export const dynamic = 'force-dynamic'

const KEY = 'maintenance_reply'

export interface MaintenanceReplySettings {
  enabled: boolean
  contactEmail: string
  message: string
  /** כמה מיילים נשלחו מאז ההפעלה — לתצוגה בלבד */
  sentCount?: number
}

export const DEFAULT_SETTINGS: MaintenanceReplySettings = {
  enabled: false,
  contactEmail: 'chasamsofer3@gmail.com',
  message: 'המערכת החדשה שלנו נמצאת כרגע בפיתוח, ותתחיל לפעול בימים הקרובים.',
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()

  let settings = DEFAULT_SETTINGS
  try {
    if (data?.value) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(String(data.value)) }
  } catch { /* ערך פגום — ברירת מחדל */ }

  return NextResponse.json({ settings })
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let payload: Partial<MaintenanceReplySettings>
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const email = String(payload.contactEmail ?? '').trim()
  if (payload.enabled && !email.includes('@')) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }

  // שומרים על מונה השליחות הקיים
  const { data: current } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  let sentCount = 0
  try {
    if (current?.value) sentCount = Number(JSON.parse(String(current.value)).sentCount ?? 0)
  } catch { /* ignore */ }

  const settings: MaintenanceReplySettings = {
    enabled: Boolean(payload.enabled),
    contactEmail: email || DEFAULT_SETTINGS.contactEmail,
    message: String(payload.message ?? DEFAULT_SETTINGS.message).slice(0, 500),
    sentCount,
  }

  const { error } = await db.from('app_settings').upsert({
    key: KEY,
    value: JSON.stringify(settings),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[maintenance-reply] ${settings.enabled ? 'הופעל' : 'כובה'} ע"י ${ctx?.email}`)
  return NextResponse.json({ ok: true, settings })
}
