import { cleanName, requestTypeLabel } from '@/lib/kvitel'
import type { KvitelLineRow, KvitelRequestRow } from '@/lib/kvitelQuery'

// ─────────────────────────────────────────────────────────────────────────────
// זיהוי שמות כפולים בקוויטלאך שעוד לא נשלחו — רק אינדיקציה. המיזוג ידני בלבד
// (app/admin/kvitel/KvitelDuplicates.tsx → POST /api/admin/kvitel/merge).
//
// הקליטה כבר מדלגת על כפילות מדויקת (kvitelReview.dropDuplicateLines). כאן נתפסות
// הצורות השונות של אותו אדם: "מרן ישראל בן לאה אסתר", "אדמו״ר ישראל בן לאה אסתר",
// "ישראל הגר בן לאה אסתר שליט״א", כתיב מלא/חסר ("דויד"/"דוד").
//
// אותו אדם = אותו בן/בת, אותו שם האם (אחרי ניקוי), ושם זהה — או שם שהמילים שלו
// מתחילות במילים של השני ("ישראל" ↔ "ישראל הגר"). בלי שם האם לא משווים.
// ─────────────────────────────────────────────────────────────────────────────

// תארים וכינויים שלא שייכים לשם עצמו — כפי שהם אחרי הסרת גרשיים.
const TITLES = new Set([
  'מרן', 'אדמור', 'אדמוהר', 'אדמוהרר', 'כק', 'הרב', 'הרבי', 'רבי', 'רבינו', 'רבנו', 'ר', 'הר', 'הרר', 'מוה', 'מוהר', 'מוהרר', 'מורנו',
  'הרהג', 'הרהצ', 'הרהק', 'הגהצ', 'הגהק', 'הגאון', 'הצדיק', 'הקדוש', 'הרבנית', 'רבנית', 'מרת', 'גב', 'הגב', 'הגברת',
  'הילד', 'הילדה', 'התינוק', 'התינוקת', 'הבחור', 'האברך', 'העלמה', 'תח', 'הרח',
  'שליטא', 'שליט', 'ני', 'נרו', 'תחי', 'תחיה', 'שיחי', 'שיחיה', 'זיע', 'זצל', 'זצוקל', 'עה',
])   // ⚠️ בלי מילים שהן גם שם פרטי ("יאיר" מ"נרו יאיר")
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }

/** המילים של שם אחרי ניקוי: בלי ניקוד, גרשיים, תארים ואותיות סופיות. */
export function nameWords(v: string | null | undefined): string[] {
  return cleanName(v).replace(/['"׳״]/g, '').replace(/-/g, ' ').split(' ')
    .filter(w => w && !TITLES.has(w))
    .map(w => w.replace(/[ךםןףץ]/g, c => FINALS[c]))
}

// כתיב מלא/חסר: בלי ו' ו-י' שאינן בתחילת המילה ("דויד" = "דוד", "יצחק" = "יצחק").
const loose = (w: string) => w[0] + w.slice(1).replace(/[וי]/g, '')

/** שתי רשימות מילים שאחת מהן מתחילה בשנייה (אחרי כתיב רופף). */
function prefixMatch(a: string[], b: string[]): boolean {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  return s.length > 0 && s.every((w, i) => loose(w) === loose(l[i]))
}

export interface DupLine {
  line: KvitelLineRow
  request: KvitelRequestRow
}
export interface DupGroup {
  key: string            // מזהה יציב לקבוצה (מזהה השורה הראשונה)
  exact: boolean         // אחרי ניקוי התארים כל הצורות זהות — כמעט בוודאות אותו אדם
  lines: DupLine[]       // לפי סדר ההגשה (הראשון = ההצעה להשאיר)
}

const parentKey = (l: Pick<KvitelLineRow, 'relation' | 'parent_name'>) => {
  const p = nameWords(l.parent_name)
  return p.length ? `${l.relation}|${p.map(loose).join(' ')}` : null
}
const exactKey = (l: Pick<KvitelLineRow, 'relation' | 'name' | 'parent_name'>) =>
  `${l.relation}|${nameWords(l.name).join(' ')}|${nameWords(l.parent_name).join(' ')}`

/** האם שתי שורות הן כנראה אותו אדם. */
export function samePerson(a: Pick<KvitelLineRow, 'relation' | 'name' | 'parent_name'>, b: Pick<KvitelLineRow, 'relation' | 'name' | 'parent_name'>): boolean {
  const pa = parentKey(a)
  return !!pa && pa === parentKey(b) && prefixMatch(nameWords(a.name), nameWords(b.name))
}

const OPEN = new Set(['review', 'pending'])

/** קבוצות של אותו אדם בבקשות שעוד לא נשלחו (לבדיקה / לא נשלח). רק קבוצות של 2 ומעלה. */
export function findDuplicateGroups(rows: KvitelRequestRow[]): DupGroup[] {
  const items: DupLine[] = rows
    .filter(r => OPEN.has(r.status))
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at) || (a.id < b.id ? -1 : 1))
    .flatMap(r => [...r.kvitel_request_lines].sort((a, b) => a.position - b.position).map(line => ({ line, request: r })))

  // איחוד קבוצות (union-find) בתוך כל שם אם — "ישראל" מחבר בין "ישראל הגר" ל"ישראל צבי" רק דרך שם משותף
  const parent = items.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const byParent = new Map<string, number[]>()
  items.forEach((it, i) => {
    const k = parentKey(it.line)
    if (k && nameWords(it.line.name).length) byParent.set(k, [...(byParent.get(k) ?? []), i])
  })
  for (const idx of byParent.values()) {
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        if (prefixMatch(nameWords(items[idx[x]].line.name), nameWords(items[idx[y]].line.name))) parent[find(idx[y])] = find(idx[x])
      }
    }
  }

  const groups = new Map<number, DupLine[]>()
  items.forEach((it, i) => {
    if (parentKey(it.line) == null) return
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), it])
  })
  return [...groups.values()]
    .filter(g => g.length > 1)
    .map(g => ({ key: g[0].line.id, exact: new Set(g.map(d => exactKey(d.line))).size === 1, lines: g }))
}

/** מזהה שורה → הקבוצה שלה, לסימון ליד השם ברשימה. */
export function duplicateIndex(groups: DupGroup[]): Map<string, DupGroup> {
  const m = new Map<string, DupGroup>()
  for (const g of groups) for (const d of g.lines) m.set(d.line.id, g)
  return m
}

type ReqLine = Pick<KvitelLineRow, 'request_type' | 'request_note'>
export const requestText = (l: ReqLine) => (l.request_type === 'other' ? (l.request_note ?? '').trim() : l.request_type ? requestTypeLabel(l.request_type) : '')
export const MERGED_NOTE_MAX = 300

/**
 * הבקשה של השורה שנשארת אחרי מיזוג: כל הבקשות השונות של כל הצורות, בלי לאבד אף אחת.
 * בקשה אחת (או כמה זהות) — נשארת כמו שהיא. כמה שונות — "אחר" עם כולן מופרדות בפסיקים.
 */
export function mergedRequest(keep: ReqLine, others: ReqLine[]): { request_type: string; request_note: string | null } | { error: string } {
  const all = [keep, ...others]
  const texts: string[] = []
  for (const l of all) {
    const t = requestText(l)
    if (t && !texts.includes(t)) texts.push(t)
  }
  if (texts.length <= 1) {
    const src = all.find(l => requestText(l)) ?? keep
    return { request_type: src.request_type ?? '', request_note: src.request_type === 'other' ? src.request_note : null }
  }
  const note = texts.join(', ')
  if (note.length > MERGED_NOTE_MAX) return { error: 'הבקשות המאוחדות ארוכות מדי לשורה אחת. קצרו אחת מהן ונסו שוב' }
  return { request_type: 'other', request_note: note }
}

export const personText = (l: Pick<KvitelLineRow, 'name' | 'relation' | 'parent_name'>) =>
  `${l.name} ${l.relation === 'bat' ? 'בת' : 'בן'} ${l.parent_name}`
export const MERGE_MAX = 50
const appendNote = (note: string | null, add: string) => (note?.trim() ? `${note.trim()}\n${add}` : add)

export interface MergePlan {
  keep: { id: string; request_type: string; request_note: string | null }
  deleteIds: string[]
  requests: { id: string; note: string; cancel: boolean }[]   // הערה מעודכנת; cancel = לא נשארו בה שמות
  removed: { id: string; request_id: string; name: string; relation: string; parent_name: string; request_type: string | null; request_note: string | null }[]
}

/**
 * תכנון מיזוג ידני: השורה keepId נשארת (עם כל הבקשות של כולן), השורות mergeIds נמחקות.
 * rows = הבקשות שמעורבות, עם כל השורות שלהן. נבדק שכולן פתוחות ובאותה קבוצת כפילות.
 * בקשה שנשארה בלי שמות מבוטלת, ובכל בקשה נרשמת הערה — כדי שאפשר יהיה לדעת מה קרה.
 */
export function planMerge(rows: KvitelRequestRow[], keepId: string, mergeIds: string[]): MergePlan | { error: string } {
  const ids = [...new Set(mergeIds)].filter(id => id !== keepId)
  if (!ids.length) return { error: 'לא נבחרו שמות למיזוג' }
  if (ids.length > MERGE_MAX) return { error: 'יותר מדי שמות למיזוג אחד' }
  const all = new Map(rows.flatMap(r => r.kvitel_request_lines.map(l => [l.id, { line: l, request: r }] as const)))
  const keep = all.get(keepId)
  if (!keep || ids.some(id => !all.has(id))) return { error: 'חלק מהשמות כבר לא קיימים. רעננו את המסך' }
  if ([keep, ...ids.map(id => all.get(id)!)].some(d => !OPEN.has(d.request.status))) return { error: 'אפשר למזג רק שמות שעוד לא נשלחו' }
  const group = duplicateIndex(findDuplicateGroups(rows)).get(keepId)
  if (!group || ids.some(id => !group.lines.some(d => d.line.id === id))) return { error: 'השמות שנבחרו אינם אותו אדם' }

  const others = ids.map(id => all.get(id)!)
  const req = mergedRequest(keep.line, others.map(d => d.line))
  if ('error' in req) return req

  const keepWho = `${personText(keep.line)} (בקשה של ${keep.request.contact_name || 'מגיש לא ידוע'})`
  const notes = new Map<string, { note: string | null; cancel: boolean }>()
  const noteOf = (r: KvitelRequestRow) => notes.get(r.id) ?? { note: r.note, cancel: false }
  for (const d of others) {
    const left = d.request.kvitel_request_lines.filter(l => !ids.includes(l.id))
    const cur = noteOf(d.request)
    notes.set(d.request.id, { note: appendNote(cur.note, `מוזג: ${personText(d.line)} ← ${keepWho}`), cancel: left.length === 0 })
  }
  const k = noteOf(keep.request)
  notes.set(keep.request.id, { ...k, note: appendNote(k.note, `מוזגו לכאן ${others.length} צורות של ${personText(keep.line)}`) })

  return {
    keep: { id: keepId, ...req },
    deleteIds: ids,
    requests: [...notes].map(([id, n]) => ({ id, note: n.note ?? '', cancel: n.cancel })),
    removed: others.map(({ line: l, request: r }) => ({
      id: l.id, request_id: r.id, name: l.name, relation: l.relation, parent_name: l.parent_name, request_type: l.request_type, request_note: l.request_note,
    })),
  }
}
