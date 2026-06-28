// ניהול טקסט הודעת השיחה לאחר רישום (קריאה/שמירה) — admin בלבד.
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getRegistrationCallText, saveRegistrationCallText, DEFAULT_REG_CALL_TEXT } from '@/lib/registrationCallMessage'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403, headers: NO_STORE })
  return NextResponse.json({ text: await getRegistrationCallText(), defaultText: DEFAULT_REG_CALL_TEXT }, { headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  let body: { text?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (typeof body.text !== 'string' || !body.text.trim()) return NextResponse.json({ error: 'נדרש טקסט' }, { status: 400 })
  const ok = await saveRegistrationCallText(body.text)
  if (!ok) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json({ ok: true, text: await getRegistrationCallText() })
}
