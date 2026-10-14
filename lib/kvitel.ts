// ─────────────────────────────────────────────────────────────────────────────
// מחלקת קוויטלאך — ליבה משותפת לכל הערוצים (לינק, טלפון, מייל, נדרים פלוס).
//
// כל ערוץ מפענח את הקלט שלו ל-KvitelLineInput, ומשם הכול זהה: אותו ניקוי,
// אותו אימות ואותה צורת שורה בקובץ ה-Word ("מאיר בן פעשא לאה - לרפואה שלימה").
// מיגרציה: supabase/migrations/20261014_kvitel.sql
// ─────────────────────────────────────────────────────────────────────────────

export const KVITEL_REQUEST_TYPES = [
  { key: 'refua',     label: 'לרפואה שלימה' },
  { key: 'parnasa',   label: 'פרנסה ברווח' },
  { key: 'zivug',     label: 'זיווג הגון' },
  { key: 'zera',      label: 'זרע של קיימא' },
  { key: 'hatzlacha', label: 'הצלחה' },
  { key: 'yeshua',    label: 'ישועה וברכה' },
  { key: 'other',     label: 'אחר' },
] as const

export type KvitelRequestType = typeof KVITEL_REQUEST_TYPES[number]['key']
export type KvitelRelation = 'ben' | 'bat'
export type KvitelChannel = 'web' | 'phone' | 'email' | 'nedarim'
// review — הגיע מערוץ אוטומטי (טלפון/מייל) וממתין לאישור צוות לפני שייכנס לקובץ.
export type KvitelStatus = 'review' | 'pending' | 'done' | 'cancelled'

export const KVITEL_CHANNELS: Record<KvitelChannel, string> = {
  web: 'לינק', phone: 'טלפון', email: 'מייל', nedarim: 'נדרים פלוס',
}
export const KVITEL_STATUSES: Record<KvitelStatus, string> = {
  review: 'לבדיקה', pending: 'ממתין', done: 'בוצע', cancelled: 'בוטל',
}

export interface KvitelLineInput {
  name: string
  relation: KvitelRelation
  parentName: string
  requestType: KvitelRequestType
  requestNote?: string | null
}

export const MAX_LINES = 40
const MAX_NAME = 40
const MAX_NOTE = 80

const TYPE_KEYS = new Set<string>(KVITEL_REQUEST_TYPES.map(t => t.key))
export function isRequestType(v: unknown): v is KvitelRequestType {
  return typeof v === 'string' && TYPE_KEYS.has(v)
}
export function requestTypeLabel(key: string): string {
  return KVITEL_REQUEST_TYPES.find(t => t.key === key)?.label ?? key
}

// ניקוי שם: בלי ניקוד וטעמים, בלי תווים שאינם אותיות/רווח/גרש/מקף, רווח אחד.
// "פעשא  לאה" → "פעשא לאה". הכתיב עצמו לא משתנה כאן — זה תפקיד המילון (שלב ה-AI).
export function cleanName(v: unknown): string {
  return String(v ?? '')
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[^\p{L}\s'"׳״\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
}

function cleanNote(v: unknown): string {
  return String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE)
}

// טלפון ישראלי בצורה אחידה (05XXXXXXXX / 0XXXXXXXX), או null אם לא תקין.
export function normalizePhone(v: unknown): string | null {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.startsWith('972')) d = '0' + d.slice(3)
  if (!/^0\d{8,9}$/.test(d)) return null
  return d
}

export type LineResult = { ok: true; line: KvitelLineInput } | { ok: false; error: string }

export function validateLine(raw: Record<string, unknown>, index: number): LineResult {
  const n = index + 1
  const name = cleanName(raw.name)
  const parentName = cleanName(raw.parentName)
  const relation = raw.relation === 'bat' ? 'bat' : raw.relation === 'ben' ? 'ben' : null
  const requestType = raw.requestType
  const requestNote = cleanNote(raw.requestNote)
  if (!name) return { ok: false, error: `שורה ${n}: חסר שם` }
  if (!parentName) return { ok: false, error: `שורה ${n}: חסר שם האם` }
  if (!relation) return { ok: false, error: `שורה ${n}: יש לבחור בן או בת` }
  if (!isRequestType(requestType)) return { ok: false, error: `שורה ${n}: יש לבחור סוג בקשה` }
  if (requestType === 'other' && !requestNote) return { ok: false, error: `שורה ${n}: יש לכתוב את הבקשה` }
  return { ok: true, line: { name, relation, parentName, requestType, requestNote: requestType === 'other' ? requestNote : null } }
}

export function validateLines(raw: unknown): { ok: true; lines: KvitelLineInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'יש להוסיף לפחות שם אחד' }
  if (raw.length > MAX_LINES) return { ok: false, error: `אפשר עד ${MAX_LINES} שמות בהגשה אחת` }
  const lines: KvitelLineInput[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') return { ok: false, error: `שורה ${i + 1}: לא תקינה` }
    const r = validateLine(item as Record<string, unknown>, i)
    if (!r.ok) return r
    lines.push(r.line)
  }
  return { ok: true, lines }
}

// מפתח לזיהוי אותו אדם אצל אותו מגיש (שמות שמורים, ובהמשך כפילויות).
export function personKey(l: { name: string; relation: string; parentName: string }): string {
  return [cleanName(l.name), l.relation, cleanName(l.parentName)].join('|').replace(/['"׳״\s-]/g, '')
}

// השורה כפי שהיא מודפסת בקוויטל.
export function formatLine(l: { name: string; relation: string; parentName: string; requestType: string; requestNote?: string | null }): string {
  const who = `${l.name} ${l.relation === 'bat' ? 'בת' : 'בן'} ${l.parentName}`
  const what = l.requestType === 'other' ? (l.requestNote || '') : requestTypeLabel(l.requestType)
  return what ? `${who} - ${what}` : who
}
