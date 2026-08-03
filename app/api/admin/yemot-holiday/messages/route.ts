import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import {
  getHolidayMessages,
  saveHolidayMessages,
  HOLIDAY_MESSAGE_META,
  type HolidayMessages,
} from '@/lib/yemotHolidayMessages'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// GET — ההודעות הנוכחיות + המטא-דאטה לבניית הטופס (זהה לשלוחת היולדות)
export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403, headers: NO_STORE })
  const messages = await getHolidayMessages()
  return NextResponse.json({ messages, meta: HOLIDAY_MESSAGE_META }, { headers: NO_STORE })
}

// POST — שמירת טקסטים
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  let body: { messages?: HolidayMessages }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.messages || typeof body.messages !== 'object') return NextResponse.json({ error: 'חסרות הודעות' }, { status: 400 })

  // ⚠️ ולידציה על ההודעות הדינמיות: בלי {distribution} השיחה לא תאמר לאיזו
  // חלוקה נרשמים, ובלי {name} הזיהוי לא נשמע. עדיף לחסום שמירה מאשר שיחה עיוורת.
  const confirm = body.messages['ask_confirm']?.text
  if (confirm && !confirm.includes('{distribution}')) {
    return NextResponse.json({ error: 'בקשת האישור חייבת לכלול את {distribution} — שם החלוקה' }, { status: 400 })
  }
  const identify = body.messages['identify']?.text
  if (identify && !identify.includes('{name}')) {
    return NextResponse.json({ error: 'הודעת הזיהוי חייבת לכלול את {name}' }, { status: 400 })
  }

  const ok = await saveHolidayMessages(body.messages)
  if (!ok) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json({ ok: true, messages: await getHolidayMessages() })
}
