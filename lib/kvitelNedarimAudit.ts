import { MAX_LINES } from './kvitel'
import { parseKvitelEmailText } from './kvitelEmail'
import { parseNedarimKvitel, rawToRecord } from './kvitelNedarim'
import { kvitelRowBody, mapKvitelRow, type KvitelNedarimConfig } from './kvitelNedarimPull'

// דוח בדיקה לקליטה מנדרים פלוס (קריאה בלבד): לכל הגשה, כמה שמות יש במקור וכמה נקלטו.
// המקור הוא raw_text שנשמר בבקשה ("שדה: ערך"), כך שהדוח לא פונה לנדרים ולא משנה דבר.
// ⚠️ הפלט מספרים וסיבות בלבד, בלי שמות: טקסט חופשי גלוי בדף גורם לנטפרי לחסום.

export type AuditReason = 'free_ignored' | 'invalid_field' | 'over_max' | 'unparsed_text' | 'reprocess_would_add' | 'raw_truncated' | 'no_raw'

export const AUDIT_REASON_LABEL: Record<AuditReason, string> = {
  free_ignored: 'הטקסט החופשי לא נקלט, כי היו גם שמות בשדות (קליטה ישירה)',
  invalid_field: 'שם בשדה לא עבר אימות ונזרק',
  over_max: `יותר מ-${MAX_LINES} שמות בהגשה`,
  unparsed_text: 'שורות בטקסט החופשי שלא פוענחו',
  reprocess_would_add: 'הפענוח הנוכחי היה קולט יותר (נקלט בגרסה ישנה)',
  raw_truncated: 'טקסט המקור נחתך ב-6000 תווים, הספירה חלקית',
  no_raw: 'אין טקסט מקור שמור',
}

export interface AuditInput { kind: 'form' | 'direct'; rawText: string | null; captured: number }

export interface AuditResult {
  source: number       // שמות במקור: בשדות + בטקסט החופשי
  structured: number   // שמות בשדות המסודרים
  free: number         // שמות שזוהו בטקסט החופשי
  unclear: number      // שורות בטקסט החופשי שלא פוענחו (ייתכן שיש בהן שמות)
  captured: number     // שורות שנשמרו בבקשה
  current: number      // כמה הקליטה הנוכחית הייתה קולטת מאותו מקור
  missing: number
  reasons: AuditReason[]
}

const FREE_KEYS = ['Comments', 'Comment', 'names', 'text', 'Param1']
const NAME_KEY = /^(?:name|shem|first_name)(?:_?\d+)?$/i
const NAME_IN_LINE = /^(?:name|shem|first_name|שם)$/i
export { rawToRecord }

function structuredCount(body: Record<string, unknown>): number {
  let n = 0
  let arr: unknown = body.lines
  if (typeof arr === 'string') { try { arr = JSON.parse(arr) } catch { arr = null } }
  if (Array.isArray(arr)) {
    n += arr.filter(x => x && typeof x === 'object'
      && Object.entries(x as Record<string, unknown>).some(([k, v]) => NAME_IN_LINE.test(k) && String(v ?? '').trim())).length
  }
  n += Object.entries(body).filter(([k, v]) => NAME_KEY.test(k) && typeof v === 'string' && v.trim()).length
  return n
}

const freeText = (body: Record<string, unknown>) =>
  FREE_KEYS.map(k => body[k]).find((v): v is string => typeof v === 'string' && !!v.trim()) ?? ''

export function auditNedarimSubmission(input: AuditInput, mapping: KvitelNedarimConfig): AuditResult {
  const raw = input.rawText ?? ''
  if (!raw.trim()) {
    return { source: 0, structured: 0, free: 0, unclear: 0, captured: input.captured, current: 0, missing: 0, reasons: ['no_raw'] }
  }
  const record = rawToRecord(raw)
  const body: Record<string, unknown> = input.kind === 'form' ? kvitelRowBody(record, mapping) : record

  const structured = structuredCount(body)
  const free = freeText(body)
  const fp = free ? parseKvitelEmailText('', free) : null
  const freeFound = fp ? (fp.found ?? fp.lines.length) : 0
  const unclear = fp?.leftover.length ?? 0
  const blanked = Object.fromEntries(Object.entries(body).filter(([k]) => !FREE_KEYS.includes(k)))
  const validStructured = structured ? parseNedarimKvitel(blanked).lines.length : 0
  const current = input.kind === 'form' ? mapKvitelRow(record, mapping).lines.length : parseNedarimKvitel(body).lines.length

  const source = structured + freeFound
  const reasons: AuditReason[] = []
  // נקלטו רק השמות שבשדות (הפענוח הישן התעלם מהטקסט החופשי כשהיו גם שדות)
  if (input.kind === 'direct' && structured && freeFound && input.captured < source && input.captured <= validStructured) reasons.push('free_ignored')
  if (validStructured < structured) reasons.push('invalid_field')
  if (source > MAX_LINES) reasons.push('over_max')
  if (unclear) reasons.push('unparsed_text')
  if (input.captured < current) reasons.push('reprocess_would_add')
  if (raw.length >= 6000) reasons.push('raw_truncated')

  return { source, structured, free: freeFound, unclear, captured: input.captured, current, missing: Math.max(0, source - input.captured), reasons }
}
