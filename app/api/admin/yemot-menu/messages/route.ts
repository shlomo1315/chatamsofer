import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import {
  getMainMenuMessages, saveMainMenuMessages,
  MAIN_MENU_MESSAGE_META, type MainMenuMessages,
} from '@/lib/yemotMainMenu'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// הודעות התפריט הראשי — אותה תבנית בדיוק כמו yemot-holiday/messages.
// ⚠️ אין middleware בפרויקט — כל ראוט מגן על עצמו.

export async function GET() {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403, headers: NO_STORE })
  }
  const messages = await getMainMenuMessages()
  return NextResponse.json({ messages, meta: MAIN_MENU_MESSAGE_META }, { headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  let body: { messages?: MainMenuMessages }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  if (!body.messages || typeof body.messages !== 'object') {
    return NextResponse.json({ error: 'חסרות הודעות' }, { status: 400 })
  }

  // 🔴 התפריט חייב להקריא את המקשים שיש להם יעד.
  //
  // ⚠️ תפריט שאינו מזכיר מקש שולח את המתקשר לנחש, ותפריט שמקריא מקש
  // שאינו מנותב שולח אותו להקשה שתיפול ל"שגוי". שניהם נראים למתקשר
  // כתקלה במערכת.
  const menu = body.messages['menu']?.text ?? ''
  const missing = ['1', '2', '9'].filter(d => !menu.includes(d))
  if (menu.trim() && missing.length) {
    return NextResponse.json(
      { error: `התפריט חייב להזכיר את המקשים ${missing.join(', ')} — הם מנותבים ויישמעו כשגויים בלעדיהם` },
      { status: 400 },
    )
  }

  const ok = await saveMainMenuMessages(body.messages)
  if (!ok) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json({ ok: true, messages: await getMainMenuMessages() })
}
