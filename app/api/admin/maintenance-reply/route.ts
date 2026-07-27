import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, getServiceClient, forbidden } from '@/lib/apiAuth'
import { getMaintenanceMap, saveMaintenanceMap, defaultMaintenanceMap, type MaintenanceReplyMap } from '@/lib/maintenanceReply'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

// הגדרות המענה האוטומטי per-mailbox (מתג + נוסח לכל תיבה).
// נשמר ב-app_settings תחת maintenance_reply כ-map לפי מחלקה.
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx || ctx instanceof NextResponse) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const map = await getMaintenanceMap(db)
  // רשימת התיבות (label+email) להצגה ב-UI, בסדר קבוע
  const mailboxes = Object.values(DEPARTMENTS).map(d => ({ key: d.key, label: d.label, email: d.email }))
  return NextResponse.json({ map, mailboxes })
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx || ctx instanceof NextResponse) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let payload: { map?: MaintenanceReplyMap }
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // מיזוג עם הקיים + נרמול. מתג מופעל דורש נוסח.
  const current = await getMaintenanceMap(db)
  const next: MaintenanceReplyMap = { ...defaultMaintenanceMap(), ...current }
  const validKeys = new Set(Object.values(DEPARTMENTS).map(d => d.key))
  for (const [k, v] of Object.entries(payload.map ?? {})) {
    if (!validKeys.has(k as DepartmentKey) || !v || typeof v !== 'object') continue
    const enabled = (v as { enabled?: unknown }).enabled === true
    const message = String((v as { message?: unknown }).message ?? '').slice(0, 800)
    const contactEmail = String((v as { contactEmail?: unknown }).contactEmail ?? '').trim()
    if (enabled && !message.trim()) {
      return NextResponse.json({ error: `יש להזין נוסח למענה האוטומטי של "${Object.values(DEPARTMENTS).find(d => d.key === k)?.label}"` }, { status: 400 })
    }
    next[k as DepartmentKey] = { enabled, message, contactEmail }
  }

  if (!(await saveMaintenanceMap(db, next))) {
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  }
  console.log(`[maintenance-reply] map עודכן ע"י ${ctx?.email}`)
  return NextResponse.json({ ok: true, map: next })
}
