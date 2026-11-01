import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// רשימות תפוצה לגיליונות: בוחרים כמה רשימות, ומי שנמצא בכמה מהן מקבל מייל אחד.
// האיחוד לפי כתובת מייל (אותיות קטנות). מי שהוסר (גיליונות או ניוזלטר) לא נכלל
// בשום רשימה. מיגרציה: 20261101_gilyonot_lists_archive.sql
// ─────────────────────────────────────────────────────────────────────────────

export type ListKind = 'subscribers' | 'distributors' | 'contact_list'

export interface GilyonotList {
  id: string
  name: string
  kind: ListKind
  contact_list_id: string | null
  preselected: boolean
  active: boolean
  sort_order: number
}

export interface Recipient { email: string; subscriberId: string | null }

export interface ResolvedRecipients {
  recipients: Recipient[]
  perList: { id: string; name: string; count: number }[]
  /** כמה כתובות הוסרו כי הופיעו ביותר מרשימה אחת */
  duplicates: number
  /** כמה כתובות הוסרו כי ביטלו הרשמה */
  suppressed: number
}

const PAGE = 1000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const LIST_COLS = 'id, name, kind, contact_list_id, preselected, active, sort_order'

const norm = (e: unknown) => String(e ?? '').trim().toLowerCase()

/**
 * איחוד קבוצות נמענים לפי מייל. רשומה עם subscriberId (יש קישור הסרה) גוברת על רשומה בלעדיו.
 * suppressed: כתובות שאסור לשלוח אליהן.
 */
export function mergeRecipients(
  groups: { id: string; name: string; rows: Recipient[] }[],
  suppressed: Set<string>,
): ResolvedRecipients {
  const byEmail = new Map<string, Recipient>()
  const perList: ResolvedRecipients['perList'] = []
  let duplicates = 0
  let removed = 0
  const counted = new Set<string>()
  for (const g of groups) {
    const own = new Set<string>()
    for (const r of g.rows) {
      const email = norm(r.email)
      if (!EMAIL.test(email)) continue
      own.add(email)
      if (suppressed.has(email)) {
        if (!counted.has(email)) { counted.add(email); removed++ }
        continue
      }
      const prev = byEmail.get(email)
      if (!prev) byEmail.set(email, { email, subscriberId: r.subscriberId })
      else {
        duplicates++
        if (!prev.subscriberId && r.subscriberId) prev.subscriberId = r.subscriberId
      }
    }
    perList.push({ id: g.id, name: g.name, count: [...own].filter(e => !suppressed.has(e)).length })
  }
  return { recipients: [...byEmail.values()], perList, duplicates, suppressed: removed }
}

async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await fetchPage(offset, offset + PAGE - 1)
    if (error) throw new Error('טעינת הרשימה נכשלה')
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

async function loadListRows(db: SupabaseClient, list: GilyonotList): Promise<Recipient[]> {
  if (list.kind === 'subscribers') {
    const rows = await pageAll<{ id: string; email: string }>((a, b) =>
      db.from('gilyonot_subscribers').select('id, email').eq('status', 'active').order('created_at').range(a, b))
    return rows.map(r => ({ email: r.email, subscriberId: r.id }))
  }
  if (list.kind === 'distributors') {
    const rows = await pageAll<{ email: string | null }>((a, b) =>
      db.from('gilyonot_distributors').select('email').eq('status', 'active').not('email', 'is', null).order('created_at').range(a, b))
    return rows.map(r => ({ email: r.email ?? '', subscriberId: null }))
  }
  const rows = await pageAll<{ email: string }>((a, b) =>
    db.from('contacts').select('email').eq('list_id', list.contact_list_id).order('id').range(a, b))
  return rows.map(r => ({ email: r.email, subscriberId: null }))
}

/** כל מי שביטל הרשמה, בגיליונות או בניוזלטר. */
async function loadSuppressed(db: SupabaseClient): Promise<Set<string>> {
  const [subs, news] = await Promise.all([
    pageAll<{ email: string }>((a, b) => db.from('gilyonot_subscribers').select('email').eq('status', 'unsubscribed').order('created_at').range(a, b)),
    pageAll<{ email: string }>((a, b) => db.from('unsubscribes').select('email').order('email').range(a, b)),
  ])
  return new Set([...subs, ...news].map(r => norm(r.email)))
}

export async function loadLists(db: SupabaseClient): Promise<GilyonotList[]> {
  const { data, error } = await db.from('gilyonot_lists').select(LIST_COLS).order('sort_order').order('created_at')
  if (error) throw new Error('טעינת הרשימות נכשלה')
  return (data ?? []) as GilyonotList[]
}

/** הנמענים הייחודיים של הרשימות שנבחרו (רק רשימות פעילות). */
export async function resolveRecipients(db: SupabaseClient, listIds: string[]): Promise<ResolvedRecipients> {
  const wanted = new Set(listIds)
  const lists = (await loadLists(db)).filter(l => l.active && wanted.has(l.id))
  // הרשימה הראשית קודם, כדי שמנוי יקבל קישור הסרה גם אם הופיע ברשימה אחרת
  lists.sort((a, b) => Number(b.kind === 'subscribers') - Number(a.kind === 'subscribers'))
  const [suppressed, ...rows] = await Promise.all([loadSuppressed(db), ...lists.map(l => loadListRows(db, l))])
  return mergeRecipients(lists.map((l, i) => ({ id: l.id, name: l.name, rows: rows[i] })), suppressed)
}
