import type { KvitelLineRow, KvitelRequestRow } from './kvitelQuery'

// עריכה ישירה בתוך טבלת הקוויטלאך (app/admin/kvitel/KvitelClient.tsx), בלי חלונית.
// כל עריכה של תא בונה את אותו גוף שהעורך הקודם שלח ל-PUT /api/admin/kvitel/lines
// (כל השורות של הבקשה + פרטי המגיש), כך שהאימות והשמירה בשרת לא השתנו.

export type InlineEdit =
  | { kind: 'line'; index: number; text: string }   // "יוסף בן עדינה"; טקסט ריק = הסרת השם
  | { kind: 'add'; text: string }
  | { kind: 'request'; requestType: string; requestNote?: string }   // חל על כל השמות בבקשה
  | { kind: 'contact'; field: 'name' | 'phone' | 'email'; value: string }

export interface LineInput { name: string; relation: 'ben' | 'bat'; parentName: string; requestType: string; requestNote: string }
export interface LinesBody {
  id: string
  lines: LineInput[]
  contact: { name: string; phone: string; email: string }
}

export const personText = (l: Pick<KvitelLineRow, 'name' | 'relation' | 'parent_name'>) =>
  `${l.name} ${l.relation === 'bat' ? 'בת' : 'בן'} ${l.parent_name}`.trim()

// "חנה דינה בת רחל חיה" → שם, בן/בת, שם האם. החלוקה במופע הראשון של " בן " או " בת "
// (כך "בן ציון בן שרה" עובד: ה"בן" הפותח אינו מוקף ברווחים).
export function parsePerson(text: string): { name: string; relation: 'ben' | 'bat'; parentName: string } | null {
  const t = ` ${text.replace(/\s+/g, ' ').trim()} `
  const m = /^ (.+?) (בן|בת) (.+) $/.exec(t)
  if (!m) return null
  return { name: m[1].trim(), relation: m[2] === 'בת' ? 'bat' : 'ben', parentName: m[3].trim() }
}

const toInput = (l: KvitelLineRow): LineInput => ({
  name: l.name, relation: l.relation === 'bat' ? 'bat' : 'ben', parentName: l.parent_name,
  requestType: l.request_type, requestNote: l.request_note ?? '',
})

export const PERSON_HINT = 'כתבו בצורה: שם בן/בת שם האם'

// גוף השמירה אחרי עריכה אחת, או הודעת שגיאה (בלי לפנות לשרת).
export function inlineEditBody(r: KvitelRequestRow, edit: InlineEdit): { body: LinesBody } | { error: string } {
  let lines = r.kvitel_request_lines.map(toInput)
  const contact = { name: r.contact_name ?? '', phone: r.contact_phone ?? '', email: r.contact_email ?? '' }
  const template = lines[0] ?? { requestType: '', requestNote: '' }

  if (edit.kind === 'line') {
    if (!lines[edit.index]) return { error: 'השם לא נמצא' }
    if (!edit.text.trim()) {
      if (lines.length === 1) return { error: 'זה השם היחיד בבקשה. כדי לבטל אותה, השתמשו בביטול.' }
      lines = lines.filter((_, i) => i !== edit.index)
    } else {
      const p = parsePerson(edit.text)
      if (!p) return { error: PERSON_HINT }
      lines = lines.map((l, i) => (i === edit.index ? { ...l, ...p } : l))
    }
  } else if (edit.kind === 'add') {
    const p = parsePerson(edit.text)
    if (!p) return { error: PERSON_HINT }
    lines = [...lines, { ...p, requestType: template.requestType, requestNote: template.requestNote }]
  } else if (edit.kind === 'request') {
    if (!lines.length) return { error: 'אין שמות בבקשה' }
    const note = edit.requestType === 'other' ? (edit.requestNote ?? '').trim() : ''
    if (edit.requestType === 'other' && !note) return { error: 'כתבו מה הבקשה' }
    lines = lines.map(l => ({ ...l, requestType: edit.requestType, requestNote: note }))
  } else {
    contact[edit.field] = edit.value.trim()
  }
  return { body: { id: r.id, lines, contact } }
}

// השורה אחרי שמירה מוצלחת — מוצגת מיד, עד שהרשימה נטענת מחדש מהשרת.
export function applyLinesBody(r: KvitelRequestRow, body: LinesBody): KvitelRequestRow {
  return {
    ...r,
    contact_name: body.contact.name || null, contact_phone: body.contact.phone || null, contact_email: body.contact.email || null,
    kvitel_request_lines: body.lines.map((l, i) => ({
      id: r.kvitel_request_lines[i]?.id ?? `${r.id}:new:${i}`, position: i + 1,
      name: l.name, relation: l.relation, parent_name: l.parentName,
      request_type: l.requestType, request_note: l.requestNote || null, flagged: false, flag_reason: null,
    })),
  }
}

// השמירה עצמה: אותו נתיב ואותו גוף כמו העורך הקודם. מחזיר שגיאה או את השורה המעודכנת.
export async function saveInlineEdit(r: KvitelRequestRow, edit: InlineEdit, fetcher: typeof fetch = fetch): Promise<{ error: string } | { row: KvitelRequestRow }> {
  const built = inlineEditBody(r, edit)
  if ('error' in built) return built
  try {
    const res = await fetcher('/api/admin/kvitel/lines', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(built.body),
    })
    const data = await res.json().catch(() => ({})) as { error?: string }
    if (!res.ok) return { error: data.error || `השמירה נכשלה (${res.status})` }
    return { row: applyLinesBody(r, built.body) }
  } catch {
    return { error: 'השמירה נכשלה: אין חיבור לשרת' }
  }
}
