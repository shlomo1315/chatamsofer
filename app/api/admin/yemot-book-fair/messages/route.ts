import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import {
  getBookFairMessages,
  saveBookFairMessages,
  BOOK_FAIR_MESSAGE_META,
  type BookFairMessages,
} from '@/lib/yemotBookFairMessages'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// GET — הנוסחים הנוכחיים + המטא-דאטה לבניית הטופס
export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403, headers: NO_STORE })
  const messages = await getBookFairMessages()
  return NextResponse.json({ messages, meta: BOOK_FAIR_MESSAGE_META }, { headers: NO_STORE })
}

// POST — שמירת טקסטים (audio מנוהל בנתיב recording / generate-voice)
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  let body: { messages?: BookFairMessages }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.messages || typeof body.messages !== 'object') {
    return NextResponse.json({ error: 'חסרות הודעות' }, { status: 400 })
  }

  // 🔴 ולידציה: הודעה דינמית שאיבדה את המשתנה שלה הופכת לשקר שמוקרא
  // באוזני המתקשר ("הספר אזל מהמלאי" בלי שם הספר, "נוספו לסל עותקים
  // של" בלי כמות). נדחה במפורש ולא מתוקן בשקט.
  for (const meta of BOOK_FAIR_MESSAGE_META) {
    const text = body.messages[meta.key]?.text
    if (!text || !meta.placeholders?.length) continue
    const missing = meta.placeholders.filter(p => !text.includes(`{${p}}`))
    if (missing.length) {
      return NextResponse.json({
        error: `"${meta.label}" חייב לכלול ${missing.map(p => `{${p}}`).join(' ו')}`,
      }, { status: 400 })
    }
  }

  const ok = await saveBookFairMessages(body.messages)
  if (!ok) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json({ ok: true, messages: await getBookFairMessages() })
}
