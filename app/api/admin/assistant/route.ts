import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { TOOL_DEFS, runTool, type ToolCtx } from '@/lib/assistant/tools'
import type { UserPermissions } from '@/types'
import { rateLimit } from '@/lib/rateLimit'

// ─────────────────────────────────────────────────────────────────────────────
// עוזר AI — עונה על שאלות על המערכת בלבד.
//
// שתי שכבות הגנה:
//   1. ההנחיה — מגדירה שהעוזר עונה רק על המערכת ומסרב לכל נושא אחר.
//   2. הכלים — קריאה בלבד, ואוכפים הרשאות בשרת. גם אם המודל "ישתכנע"
//      לחרוג, אין לו שום כלי שכותב, ולא יקבל נתונים שאין למשתמש הרשאה אליהם.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = 'claude-sonnet-5'
const MAX_TURNS = 6          // מגן מפני לולאת כלים אינסופית

const SYSTEM = `אתה העוזר של מערכת הניהול של "היכל החתם סופר" — עמותת חסד שמנהלת:
- איגוד הצאצאים (רישום משפחות ואישורן)
- עזר יולדות (בקשות הבראה, בתי החלמה, כרטיסי מזון)
- גמ"ח הלוואות
- סיוע רפואי
- אלמנות ויתומים
- חלוקות וניוזלטר

תפקידך: לענות לצוות על שאלות הנוגעות למערכת הזו בלבד — נתונים, סטטוסים,
משימות פתוחות, סטטיסטיקה, ואיך המערכת עובדת.

## גבולות — קריטי
ענה אך ורק על שאלות הנוגעות למערכת הזו ולנתונים שבה.
אם נשאלת על נושא אחר — כל נושא אחר, גם אם הוא לגיטימי לחלוטין (חדשות, מתכונים,
קוד, עצות אישיות, הלכה, פוליטיקה, או כל דבר שאינו המערכת) — סרב בקצרה ובאדיבות:
"אני יכול לעזור רק בשאלות על מערכת הניהול של היכל החתם סופר."
אל תנסה לענות בכל זאת, ואל תתנצל יותר מדי. פשוט הפנה חזרה למערכת.

## איך לענות
- ענה בעברית, בקצרה ולעניין. אתה מדבר עם צוות עסוק.
- כשנשאלת על נתונים — השתמש בכלים. אל תנחש ואל תמציא מספרים לעולם.
- אם כלי מחזיר שגיאת הרשאה, אמור למשתמש בפשטות שאין לו גישה לאותו אגף.
- הצג מספרים בבירור. כשיש רשימה, סכם אותה — אל תשפוך טבלה גולמית.
- אם אינך יודע, אמור זאת. עדיף "אין לי את הנתון הזה" מאשר תשובה שגויה.

## היום
${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'העוזר אינו מוגדר. יש להוסיף ANTHROPIC_API_KEY להגדרות השרת.' },
      { status: 503 },
    )
  }

  // הגבלת קצב לכל משתמש — מגן מפני שימוש חריג ומפני עלות בלתי צפויה
  if (!rateLimit(`assistant:${staff.userId}`, 40, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי שאלות. נסה שוב בעוד שעה.' }, { status: 429 })
  }

  let body: { messages?: { role: 'user' | 'assistant'; content: string }[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const history = (body.messages ?? []).slice(-12)   // חלון שיחה מוגבל
  if (!history.length) return NextResponse.json({ error: 'לא נשלחה שאלה' }, { status: 400 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const ctx: ToolCtx = {
    db,
    perms: (staff.permissions ?? {}) as UserPermissions,
    isAdmin: staff.role === 'admin',
  }

  const client = new Anthropic({ apiKey: key })

  const messages: Anthropic.MessageParam[] = history.map(m => ({
    role: m.role,
    content: m.content,
  }))

  try {
    // לולאת כלים: המודל מבקש נתונים, אנחנו מריצים, והוא מסכם.
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        tools: TOOL_DEFS,
        messages,
      })

      if (res.stop_reason !== 'tool_use') {
        const text = res.content
          .filter((c): c is Anthropic.TextBlock => c.type === 'text')
          .map(c => c.text)
          .join('\n')
          .trim()
        return NextResponse.json({ reply: text || 'לא הצלחתי לנסח תשובה. נסה לשאול אחרת.' })
      }

      messages.push({ role: 'assistant', content: res.content })

      const results: Anthropic.ToolResultBlockParam[] = []
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue
        let out: unknown
        try {
          out = await runTool(ctx, block.name, block.input as Record<string, unknown>)
        } catch (e) {
          console.error('[assistant] כלי נכשל:', block.name, e)
          out = { error: 'שליפת הנתונים נכשלה' }
        }
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(out),
        })
      }
      messages.push({ role: 'user', content: results })
    }

    return NextResponse.json({ reply: 'השאלה מורכבת מדי. נסה לפצל אותה לשאלות פשוטות יותר.' })
  } catch (e) {
    console.error('[assistant] שגיאה:', e)
    return NextResponse.json({ error: 'העוזר אינו זמין כרגע. נסה שוב.' }, { status: 500 })
  }
}
