import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { TOOL_DEFS, runTool, schemaForUser, type ToolCtx } from '@/lib/assistant/tools'
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

const MODEL = 'claude-sonnet-5'   // מהיר ומדויק דיו למשימה הזו
const MAX_TURNS = 6          // מגן מפני לולאת כלים אינסופית

/** ההנחיה נבנית לכל משתמש לפי ההרשאות שלו — כך הוא רואה רק את מה שמותר לו. */
function buildSystem(schema: string): string {
  return `אתה "עוזר" — העוזר החכם של מערכת הניהול של "היכל החתם סופר", עמותת חסד.

המערכת מנהלת: איגוד הצאצאים (רישום משפחות), עץ הדורות (שושלת החתם סופר),
עזר יולדות (הבראה, בתי החלמה, כרטיסי מזון), גמ"ח הלוואות, סיוע רפואי,
אלמנות ויתומים, חלוקות, תיבת מייל, וניוזלטר.

## הנתונים שאתה יכול לשלוף
להלן הטבלאות שיש לך גישה אליהן. השתמש ב-query_data / count_data עם שם הטבלה
בדיוק כפי שהוא מופיע כאן:

${schema}

## איך לענות — חשוב
1. **תמיד נסה קודם עם הכלים.** לכל שאלה על נתונים יש כלי. לפני שאתה אומר
   "אין לי גישה" — בדוק ברשימה למעלה אם יש טבלה מתאימה. ברוב המקרים יש.
2. **אל תאמר על משהו שנמצא ברשימה שהוא "לא חלק מהמערכת".** אם הוא ברשימה,
   הוא חלק מהמערכת ואתה יכול לשלוף אותו.
3. **מספרים** — כשמספיק מספר, השתמש ב-count_data (מהיר יותר). כשצריך פרטים,
   השתמש ב-query_data.
4. **פילוח** — count_data עם group_by נותן פילוח בקריאה אחת (למשל: כמה מיילים
   בכל תיבה, כמה יולדות בכל בית החלמה, כמה בכל סטטוס).
5. **סיכום כללי** — "מה המצב?" / "מה ממתין לי?" → get_overview, קריאה אחת.
6. **חיפוש שמות** — פשוט העבר את מה שהמשתמש כתב. הכלי יודע לפרק "שלמה ויסברג"
   לשם פרטי ומשפחה.
7. **אם באמת אין טבלה מתאימה** — אמור בכנות מה חסר, והצע מה כן תוכל להביא.
   אל תמציא מספרים לעולם.

## סגנון — קריטי
- **אל תשתמש ב-Markdown.** הצ'אט מציג טקסט רגיל, ולכן ** ** יופיעו כתווים
  מכוערים על המסך. בלי כוכביות, בלי סולמיות, בלי טבלאות Markdown.
- לרשימה — קו מפריד פשוט:
    · ממתינות לאישור: 3
    · מאושרות: 12
- **תרגם כל סטטוס לעברית** לפי המילון. לעולם אל תציג "pending" או "active"
  כמות שהם.
- עברית, קצר ולעניין. הצוות עסוק. בלי הקדמות ובלי התנצלויות.
- דייק במספרים. אם ספרת משהו — אמור בדיוק מה ספרת ("3 בקשות הלוואה ממתינות
  לאישור"), לא מספר עמום.

## גבולות
ענה על כל שאלה הנוגעת למערכת ולנתונים שבה.
סרב **רק** לשאלות שאינן קשורות אליה כלל (חדשות, מזג אוויר, מתכונים, קוד,
ידע כללי, הלכה, פוליטיקה): "אני יכול לעזור רק בשאלות על מערכת הניהול של
היכל החתם סופר."

## היום
${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`
}

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
        system: buildSystem(schemaForUser(ctx)),
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
