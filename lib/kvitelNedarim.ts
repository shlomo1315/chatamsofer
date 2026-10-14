import { MAX_LINES, cleanName, isRequestType, normalizePhone, validateLine, KVITEL_REQUEST_TYPES, type KvitelLineInput } from '@/lib/kvitel'
import { guessRequestType, parseKvitelEmailText } from '@/lib/kvitelEmail'

// ─────────────────────────────────────────────────────────────────────────────
// ערוץ נדרים פלוס: הטופס החינמי שכבר קיים אצל נדרים שולח לנו את ההגשה.
//
// ⚠️ שמות השדות המדויקים של הטופס עוד לא הגיעו מנדרים, ולכן הפענוח סלחני:
//   • lines — מערך שורות במבנה של הטופס שלנו (או מחרוזת JSON שלו);
//   • שדות שטוחים ממוספרים: name1 / mother1 / relation1 / request1 ... (וגם בלי מספר);
//   • טקסט חופשי (Comments / names / text) — מפוענח כמו מייל.
// שורה שחסר בה משהו (בן/בת, סוג בקשה) נקלטת מסומנת, והבקשה עוברת ל"לבדיקה".
// ─────────────────────────────────────────────────────────────────────────────

const pick = (b: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const hit = Object.keys(b).find(x => x.toLowerCase() === k.toLowerCase())
    const v = hit ? b[hit] : undefined
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

const NAME = ['name', 'shem', 'שם', 'first_name']
const MOTHER = ['mother', 'parent', 'parentName', 'em', 'שם_האם', 'שם האם']
const RELATION = ['relation', 'ben_bat', 'gender', 'בן_בת']
const REQUEST = ['request', 'requestType', 'bakasha', 'בקשה']
const NOTE = ['requestNote', 'note']

function relationOf(v: string): 'ben' | 'bat' | null {
  if (/^(bat|בת|f|female|נקבה)$/i.test(v)) return 'bat'
  if (/^(ben|בן|m|male|זכר)$/i.test(v)) return 'ben'
  return null
}

function requestOf(v: string, note: string): { requestType: string; requestNote: string | null } | null {
  if (isRequestType(v)) return { requestType: v, requestNote: note || null }
  const byLabel = KVITEL_REQUEST_TYPES.find(t => t.label === v)
  if (byLabel) return { requestType: byLabel.key, requestNote: note || null }
  return guessRequestType(v || note)
}

export interface ParsedNedarimKvitel {
  lines: KvitelLineInput[]
  flags: (string | null)[]
  contactName: string | null
  phone: string | null
  email: string | null
  sourceRef: string | null
  rawText: string
  freeText: string   // טקסט חופשי שלא פוענח — עדיין נקלט לבדיקה ידנית
}

function oneLine(raw: { name: string; mother: string; relation: string; request: string; note: string }, index: number): { line: KvitelLineInput; flag: string | null } | null {
  const rel = relationOf(raw.relation)
  const req = requestOf(raw.request, raw.note)
  const v = validateLine({
    name: raw.name, parentName: raw.mother, relation: rel ?? 'ben',
    requestType: req?.requestType ?? 'yeshua', requestNote: req?.requestNote ?? null,
  }, index)
  if (!v.ok) return null
  const missing = [!rel && 'בן או בת', !req && 'סוג בקשה'].filter(Boolean)
  return { line: v.line, flag: missing.length ? `חסר בטופס נדרים: ${missing.join(', ')}` : null }
}

export function parseNedarimKvitel(body: Record<string, unknown>): ParsedNedarimKvitel {
  const out: ParsedNedarimKvitel = {
    lines: [], flags: [],
    contactName: cleanName(pick(body, ['ClientName', 'FullName', 'contactName'])) || null,
    phone: normalizePhone(pick(body, ['Phone', 'phone', 'Tel'])),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pick(body, ['Mail', 'Email'])) ? pick(body, ['Mail', 'Email']).toLowerCase() : null,
    sourceRef: pick(body, ['TransactionId', 'transaction_id', 'SubmissionId', 'submission_id', 'Id']).slice(0, 100) || null,
    rawText: '', freeText: '',
  }
  const add = (r: ReturnType<typeof oneLine>) => { if (r && out.lines.length < MAX_LINES) { out.lines.push(r.line); out.flags.push(r.flag) } }

  // 1. מערך lines
  let arr: unknown = body.lines
  if (typeof arr === 'string') { try { arr = JSON.parse(arr) } catch { arr = null } }
  if (Array.isArray(arr)) {
    for (const x of arr) {
      if (!x || typeof x !== 'object') continue
      const o = x as Record<string, unknown>
      add(oneLine({ name: pick(o, NAME), mother: pick(o, MOTHER), relation: pick(o, RELATION), request: pick(o, REQUEST), note: pick(o, NOTE) }, out.lines.length))
    }
  }

  // 2. שדות שטוחים: name, name1 ... name40
  if (!out.lines.length) {
    for (let i = 0; i <= MAX_LINES; i++) {
      const sfx = (keys: string[]) => keys.flatMap(k => i ? [`${k}${i}`, `${k}_${i}`] : [k])
      const name = pick(body, sfx(NAME))
      if (!name) continue
      add(oneLine({ name, mother: pick(body, sfx(MOTHER)), relation: pick(body, sfx(RELATION)), request: pick(body, sfx(REQUEST)), note: pick(body, sfx(NOTE)) }, out.lines.length))
    }
  }

  // 3. טקסט חופשי
  const free = pick(body, ['Comments', 'Comment', 'names', 'text', 'Param1'])
  out.freeText = free
  if (!out.lines.length && free) {
    const p = parseKvitelEmailText('', free)
    out.lines = p.lines
    out.flags = p.flags.map((f, i) => f ?? (p.leftover.length && i === 0 ? `לא פוענח: ${p.leftover.join(' / ').slice(0, 120)}` : null))
  }

  out.rawText = Object.entries(body)
    .filter(([k]) => !/token|password|secret|card|cvv/i.test(k))
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n').slice(0, 6000)
  return out
}
