import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getAlertSettings, saveAlertSettings, DEFAULT_ALERT_THRESHOLD } from '@/lib/cardStock'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// בדיקת תקינות כתובת מייל בסיסית
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

// GET: הגדרות התראת מלאי (סף + רשימת מיילים)
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401, headers: NO_STORE })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })
  const settings = await getAlertSettings(admin)
  return NextResponse.json(settings, { headers: NO_STORE })
}

// POST: שמירת הגדרות — { threshold, emails[] }
export async function POST(request: NextRequest) {
  if (!(await requirePermission('maternity_cards', 'edit'))) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { threshold?: number; emails?: string[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const threshold = Math.max(0, Math.trunc(Number(body.threshold)))
  const finalThreshold = Number.isFinite(threshold) ? threshold : DEFAULT_ALERT_THRESHOLD

  const rawEmails = Array.isArray(body.emails) ? body.emails : []
  const emails = [...new Set(rawEmails.map(e => String(e).trim()).filter(Boolean))]
  const invalid = emails.filter(e => !isEmail(e))
  if (invalid.length) return NextResponse.json({ error: `כתובת מייל לא תקינה: ${invalid[0]}` }, { status: 400 })

  const ok = await saveAlertSettings(admin, { threshold: finalThreshold, emails })
  if (!ok) return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
  return NextResponse.json({ threshold: finalThreshold, emails })
}
