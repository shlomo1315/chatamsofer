import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { schemaFor } from '@/lib/assistant/schema'

// ─────────────────────────────────────────────────────────────────────────────
// הצעת ידע ע"י ה-AI עצמו.
//
// המנהל רואה שאלה שהעוזר נכשל בה. במקום לנסח בעצמו מה ללמד אותו, ה-AI מנתח
// *למה* הוא נכשל ומציע ניסוח מוכן — והמנהל רק מאשר או עורך.
//
// זה קריאה נפרדת ומכוונת: המודל כאן אינו העוזר, אלא מנתח שבוחן את הכשל.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'claude-sonnet-5'

export async function POST(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'העוזר אינו מוגדר' }, { status: 503 })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { question?: string; answer?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const question = String(body.question ?? '').trim()
  const answer = String(body.answer ?? '').trim()
  if (!question) return NextResponse.json({ error: 'חסרה השאלה' }, { status: 400 })

  // מה שהעוזר כן יודע — כדי שההצעה תהיה מבוססת מציאות ולא ניחוש
  const schema = schemaFor(() => true, true)

  const { data: known } = await db
    .from('assistant_knowledge')
    .select('content')
    .eq('is_active', true)
    .limit(30)

  const existing = (known ?? []).map(k => `• ${k.content}`).join('\n')

  const system = `אתה עוזר למנהל של מערכת "היכל החתם סופר" לשפר את העוזר החכם של המערכת.

העוזר החכם נכשל בשאלה מסוימת. תפקידך: לנתח *למה* הוא נכשל, ולהציע משפט ידע
קצר שיעזור לו לענות נכון בפעם הבאה.

## מה העוזר יכול לשלוף
${schema}

## ידע שכבר לימדו אותו
${existing || '(עדיין כלום)'}

## איך לנסח את ההצעה
- **משפט אחד או שניים.** קצר, מדויק, בעברית.
- **הסבר מונח** אם המשתמש השתמש במילה שהעוזר לא הבין
  (למשל: "כשהצוות אומר 'תיק' — הכוונה לבקשה").
- **הפנה לטבלה הנכונה** אם העוזר לא ידע איפה לחפש
  (למשל: "נתוני מכתבי הברכה נמצאים בטבלת gratitude_letters").
- **הסבר כלל עסקי** אם זה מה שחסר
  (למשל: "חלון ההגשה ליולדת הוא 30 יום מהלידה").
- **אל תמציא.** אם מהנתונים שברשותך אי אפשר לדעת למה הוא נכשל, או שהשאלה
  פשוט לא נוגעת למערכת — אמור זאת במפורש ואל תציע ידע.

## הפלט
החזר JSON בלבד, בלי טקסט נוסף:
{"canHelp": true, "reason": "<למה הוא נכשל, משפט אחד>", "knowledge": "<המשפט שיילמד>"}
או:
{"canHelp": false, "reason": "<למה אי אפשר לעזור כאן>"}`

  try {
    const client = new Anthropic({ apiKey: key })
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system,
      messages: [{
        role: 'user',
        content: `השאלה שנשאלה:\n"${question}"\n\nמה שהעוזר ענה:\n"${answer || '(לא ענה)'}"\n\nנתח והצע.`,
      }],
    })

    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text).join('').trim()

    // המודל אמור להחזיר JSON נקי, אבל לפעמים עוטף אותו
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return NextResponse.json({ canHelp: false, reason: 'לא הצלחתי לנתח את הכשל' })

    const parsed = JSON.parse(m[0]) as { canHelp?: boolean; reason?: string; knowledge?: string }

    return NextResponse.json({
      canHelp: Boolean(parsed.canHelp),
      reason: String(parsed.reason ?? ''),
      knowledge: String(parsed.knowledge ?? '').slice(0, 500),
    })
  } catch (e) {
    console.error('[assistant/suggest] נכשל:', e)
    return NextResponse.json({ error: 'הניתוח נכשל' }, { status: 500 })
  }
}
