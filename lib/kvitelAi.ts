import Anthropic from '@anthropic-ai/sdk'

// ─────────────────────────────────────────────────────────────────────────────
// קריאה ל-Claude עבור מחלקת הקוויטלאך (פענוח מייל, בדיקת בקשות).
// ההרשאה נקראת מהסביבה ע"י ה-SDK עצמו, כמו בשאר הקריאות במערכת.
//
// ⚠️ נכשל-שקט: כשה-AI לא מוגדר, בתקלה, בפסק זמן או בתשובה שאינה JSON — מחזיר
// null, וכל קורא חייב להתנהג נכון גם כך (בקשה ל"לבדיקה" במקום אישור אוטומטי).
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-5-5'
const FAST_MODEL = 'claude-haiku-5-5'

export async function askClaudeJson<T>(o: { system: string; prompt: string; maxTokens?: number; timeoutMs?: number; fast?: boolean }): Promise<T | null> {
  try {
    const client = new Anthropic({ timeout: o.timeoutMs ?? 20_000, maxRetries: 0 })
    const msg = await client.messages.create({
      model: o.fast ? FAST_MODEL : MODEL,
      max_tokens: o.maxTokens ?? 1500,
      system: o.system,
      messages: [{ role: 'user', content: o.prompt }],
    })
    const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('')
    const start = text.indexOf('{'), end = text.lastIndexOf('}')
    return start >= 0 && end > start ? (JSON.parse(text.slice(start, end + 1)) as T) : null
  } catch (e) {
    console.error('[kvitel-ai] failed:', e instanceof Error ? e.message : e)
    return null
  }
}
