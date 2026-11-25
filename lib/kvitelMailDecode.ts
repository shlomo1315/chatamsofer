import { KVITEL_STATUSES, applySharedRequests, requestTypeLabel, type KvitelStatus } from '@/lib/kvitel'
import { decodeEntities, parseKvitelEmailText, stripYedaPhoneNoise } from '@/lib/kvitelEmail'
import type { KvitelLineRow } from '@/lib/kvitelQuery'

// ─────────────────────────────────────────────────────────────────────────────
// עמודת "הפיענוח" בלשונית המייל של הקוויטלעך: מה נקלט מכל מייל.
//
// אם המייל כבר נקלט כבקשה (source_ref = message_id), מוצגות השורות שנשמרו, כפי שהן
// בטבלה ובקובץ, ואיתן השורות הגולמיות לעריכה. אחרת מוצג מה שהפענוח לפי תבנית
// (parseKvitelEmailText) מוצא בו, ומסומן שהמייל עוד לא נקלט.
// בקשה ארוכה שחוזרת מוצגת כ"הנ"ל" (כלל 7 המילים, lib/kvitel applySharedRequests).
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
  statusKey: KvitelStatus | null
  note: string | null         // הערת הקליטה ("פוענח מהמייל ב-AI" וכו')
  lines: KvitelMailDecodeLine[]
  leftover: string[]          // שורות מהמייל שלא פוענחו
  failed: string | null       // סיבת כישלון, כשלא נמצא אף שם
  canEdit?: boolean           // הרשאת עריכה בקוויטלעך (נקבע בנתיב)
  contact?: { name: string | null; phone: string | null; email: string | null }
  rows?: KvitelLineRow[]      // השורות השמורות, לעורך
}

export interface SavedKvitelLine {
  id?: string; flagged?: boolean
  name: string; relation: string; parent_name: string
  request_type: string; request_note: string | null; flag_reason: string | null; position?: number | null
}

const requestText = (type: string, note: string | null) =>
  type === 'other' ? (note || '') : type ? requestTypeLabel(type) : ''

/** מייל שכבר נקלט: השורות כפי שנשמרו. */
export function decodeFromSaved(
  req: { id: string; status: string; note: string | null; contact_name?: string | null; contact_phone?: string | null; contact_email?: string | null },
  lines: SavedKvitelLine[],
): KvitelMailDecode {
  const sorted = [...lines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const shown = applySharedRequests(sorted.map(l => ({ ...l, parentName: l.parent_name, requestType: l.request_type, requestNote: l.request_note })))
  return {
    source: 'saved', requestId: req.id,
    status: KVITEL_STATUSES[req.status as KvitelStatus] ?? req.status,
    statusKey: req.status in KVITEL_STATUSES ? req.status as KvitelStatus : null,
    note: req.note,
    lines: shown.map(l => ({
      name: l.name, relation: l.relation === 'bat' ? 'בת' : 'בן', parentName: l.parent_name,
      request: requestText(l.request_type, l.requestNote ?? null), flag: l.flag_reason,
    })),
    leftover: [],
    failed: sorted.length ? null : 'הבקשה נשמרה בלי שמות: הפיענוח לא מצא שם במייל',
    contact: { name: req.contact_name ?? null, phone: req.contact_phone ?? null, email: req.contact_email ?? null },
    rows: sorted.map((l, i) => ({
      id: l.id ?? String(i), position: l.position ?? i, name: l.name, relation: l.relation, parent_name: l.parent_name,
      request_type: l.request_type, request_note: l.request_note, flagged: !!l.flagged, flag_reason: l.flag_reason,
    })),
  }
}

/** מייל שעוד לא נקלט: הפענוח הקיים לפי תבנית, על אותו טקסט מנוקה שהקליטה משתמשת בו. */
export function decodeFromText(subject: string, text: string): KvitelMailDecode {
  const clean = stripYedaPhoneNoise(decodeEntities(text))
  const p = parseKvitelEmailText(decodeEntities(subject), clean)
  return {
    source: 'pattern', requestId: null, status: null, statusKey: null, note: null,
    lines: applySharedRequests(p.lines).map((l, i) => ({
      name: l.name, relation: l.relation === 'bat' ? 'בת' : 'בן', parentName: l.parentName,
      request: requestText(l.requestType, l.requestNote ?? null), flag: p.flags[i] ?? null,
    })),
    leftover: p.leftover,
    failed: p.lines.length ? null : 'הפיענוח נכשל: לא נמצא במייל שם במבנה "שם בן/בת שם האם". "קליטה" תנסה גם פענוח AI.',
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
