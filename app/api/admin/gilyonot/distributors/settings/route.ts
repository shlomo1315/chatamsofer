import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { normalizeEmail } from '@/lib/gilyonot'
import { cleanPhone, cleanText, normalizeAgentHours } from '@/lib/gilyonotDistributors'

// הגדרות מערך המפיצים: השליח (מקבל הודעה על התנתקות ושינוי כתובת), וטלפון ושעות הנציג.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const optional = (v: unknown) => String(v ?? '').trim() !== ''

// PUT { courier_name, courier_email, agent_phone, agent_hours: [{day, from, to}] }
export async function PUT(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const b = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const courier_email = optional(b.courier_email) ? normalizeEmail(b.courier_email) : null
  if (optional(b.courier_email) && !courier_email) return NextResponse.json({ error: 'מייל השליח אינו תקין' }, { status: 400 })
  const agent_phone = optional(b.agent_phone) ? cleanPhone(b.agent_phone) : null
  if (optional(b.agent_phone) && !agent_phone) return NextResponse.json({ error: 'טלפון הנציג אינו תקין' }, { status: 400 })
  const agent_hours = normalizeAgentHours(b.agent_hours ?? [])
  if (!agent_hours) return NextResponse.json({ error: 'שעות הנציג אינן תקינות (יום, ושעת התחלה לפני שעת הסיום)' }, { status: 400 })

  const row = { id: 1, courier_name: cleanText(b.courier_name, 80), courier_email, agent_phone, agent_hours, updated_at: new Date().toISOString() }
  const { error } = await db.from('gilyonot_distributor_settings').upsert(row)
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_distributor_settings', entityType: 'gilyonot_distributor', details: { courier_email, agent_phone, windows: agent_hours.length } })
  return NextResponse.json({ ok: true, settings: row })
}
