import { KVITEL_STATUSES, requestTypeLabel, type KvitelStatus } from '@/lib/kvitel'
import { decodeEntities, parseKvitelEmailText, stripYedaPhoneNoise } from '@/lib/kvitelEmail'

// ─────────────────────────────────────────────────────────────────────────────
// עמודת "הפיענוח" בלשונית המייל של הקוויטלעך: מה נקלט מכל מייל.
//
// בלי פענוח חדש. אם המייל כבר נקלט כבקשה (source_ref = message_id), מוצגות השורות
// שנשמרו, כפי שהן בטבלה ובקובץ. אחרת מוצג מה שהפענוח הקיים לפי תבנית
// (parseKvitelEmailText) מוצא בו, ומסומן שהמייל עוד לא נקלט.
// ─────────────────────────────────────────────────────────────────────────────

export interface KvitelMailDecodeLine {
  name: string
  relation: 'בן' | 'בת'
  parentName: string
  request: string
  flag: string | null
}

export interface KvitelMailDecode {
  source: 'saved' | 'pattern'
  requestId: string | null
  status: string | null       // תווית הסטטוס של הבקשה שנשמרה
  note: string | null         // הערת הקליטה ("פוענח מהמייל ב-AI" וכו')
  lines: KvitelMailDecodeLine[]
  leftover: string[]          // שורות מהמייל שלא פוענחו
  failed: string | null       // סיבת כישלון, כשלא נמצא אף שם
}

export interface SavedKvitelLine {
  name: string; relation: string; parent_name: string
  request_type: string; request_note: string | null; flag_reason: string | null; position?: number | null
}

const requestText = (type: string, note: string | null) =>
  type === 'other' ? (note || '') : type ? requestTypeLabel(type) : ''

/** מייל שכבר נקלט: השורות כפי שנשמרו. */
export function decodeFromSaved(req: { id: string; status: string; note: string | null }, lines: SavedKvitelLine[]): KvitelMailDecode {
  const sorted = [...lines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  return {
    source: 'saved', requestId: req.id,
    status: KVITEL_STATUSES[req.status as KvitelStatus] ?? req.status,
    note: req.note,
    lines: sorted.map(l => ({
      name: l.name, relation: l.relation === 'bat' ? 'בת' : 'בן', parentName: l.parent_name,
      request: requestText(l.request_type, l.request_note), flag: l.flag_reason,
    })),
    leftover: [],
    failed: sorted.length ? null : 'הבקשה נשמרה בלי שמות: הפיענוח לא מצא שם במייל',
  }
}

/** מייל שעוד לא נקלט: הפענוח הקיים לפי תבנית, על אותו טקסט מנוקה שהקליטה משתמשת בו. */
export function decodeFromText(subject: string, text: string): KvitelMailDecode {
  const clean = stripYedaPhoneNoise(decodeEntities(text))
  const p = parseKvitelEmailText(decodeEntities(subject), clean)
  return {
    source: 'pattern', requestId: null, status: null, note: null,
    lines: p.lines.map((l, i) => ({
      name: l.name, relation: l.relation === 'bat' ? 'בת' : 'בן', parentName: l.parentName,
      request: requestText(l.requestType, l.requestNote ?? null), flag: p.flags[i] ?? null,
    })),
    leftover: p.leftover,
    failed: p.lines.length ? null : 'הפיענוח נכשל: לא נמצא במייל שם במבנה "שם בן/בת שם האם"',
  }
}

/** טקסט המייל לפענוח: הטקסט הגולמי, או ה-HTML בלי תגיות. */
export function mailPlainText(plain: string | null | undefined, html: string | null | undefined): string {
  if (plain && plain.trim()) return plain
  return (html ?? '')
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
