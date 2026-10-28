// כלי אבחון (מנהל בלבד) — שיחת הקראה לטלפון לבחירה עם וריאנט טקסט, כדי למצוא
// איזה טקסט ימות מקריאה בתבנית של קוד האימות. הקוד בשיחה הוא קוד דמה קבוע (123456).
// שימוש: POST {"phone":"05...","variant":"plain|dots|short|semicolon"}
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { placeRawTtsCall, spokenCode } from '@/lib/yemotCall'

export const dynamic = 'force-dynamic'

const DEMO = '123456'
const WORDS = 'אחת שתיים שלוש ארבע חמש שש'.split(' ')

const VARIANTS: Record<string, () => string> = {
  plain: () => spokenCode(DEMO),
  dots: () => `קוד הכניסה שלך הוא ${WORDS.join('. ')}. ואחזור שנית. קוד הכניסה שלך הוא ${WORDS.join('. ')}`,
  semicolon: () => `שלום הקוד שלכם הוא ${WORDS.join(' ; ')} ואני חוזר שנית ${WORDS.join(' ; ')}`,
  short: () => `קוד הכניסה שלך הוא ${WORDS.join(' ')}`,
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const build = VARIANTS[String(body.variant ?? 'plain')]
  if (!build) return NextResponse.json({ error: 'וריאנט לא מוכר', variants: Object.keys(VARIANTS) }, { status: 400 })
  const phone = String(body.phone ?? '')
  const shape = body.shape === 'object' ? 'object' : 'string'
  const result = await placeRawTtsCall(phone, build(), shape)
  return NextResponse.json({ variant: body.variant ?? 'plain', shape, ...result })
}
