import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import {
  getMaternityMessages,
  saveMaternityMessages,
  MATERNITY_MESSAGE_META,
  type MaternityMessages,
} from '@/lib/yemotMaternityMessages'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// GET — ההודעות הנוכחיות + המטא-דאטה לבניית הטופס
export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403, headers: NO_STORE })
  const messages = await getMaternityMessages()
  return NextResponse.json({ messages, meta: MATERNITY_MESSAGE_META }, { headers: NO_STORE })
}

// POST — שמירת טקסטים (audio מנוהל בנתיב recording)
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  let body: { messages?: MaternityMessages }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.messages || typeof body.messages !== 'object') return NextResponse.json({ error: 'חסרות הודעות' }, { status: 400 })

  // ולידציה: center_item חייב לכלול את המשתנים הדינמיים
  const ci = body.messages['center_item']?.text
  if (ci && (!ci.includes('{name}') || !ci.includes('{code}'))) {
    return NextResponse.json({ error: 'תבנית שורת מוקד חייבת לכלול את {name} ואת {code}' }, { status: 400 })
  }

  const ok = await saveMaternityMessages(body.messages)
  if (!ok) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json({ ok: true, messages: await getMaternityMessages() })
}
