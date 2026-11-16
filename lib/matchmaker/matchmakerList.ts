import type { AdminClaim, AdminMatchmaker } from './adminData'

// מסך השדכנים: סיכום לכל שדכן, סינון, מיון ומונים. פונקציות טהורות, כדי שהסינון והמיון ירוצו בשרת ויהיו ניתנים לבדיקה.

export interface MatchmakerRow extends AdminMatchmaker {
  reqs: number; ok: number; wait: number; paid: number
  /** false = יש בקשה ממתינה של נכד החתם סופר שהאימות האוטומטי לא מצא, וממתינה להכרעה אנושית */
  verified: boolean
  recent: { id: string; label: string; created_at: string; status: AdminClaim['status'] }[]
}

export interface MatchmakerFilter {
  q?: string; circle?: string; hasReq?: string; verif?: string; limit?: string
  from?: string; to?: string; counter?: string
}
export type MatchmakerSortKey = 'name' | 'circle' | 'reqs' | 'ok' | 'wait' | 'paid' | 'bank' | 'reg'
export interface MatchmakerSort { key: MatchmakerSortKey; dir: 1 | -1 }

export const MATCHMAKER_SORT_KEYS: MatchmakerSortKey[] = ['name', 'circle', 'reqs', 'ok', 'wait', 'paid', 'bank', 'reg']

export function summarizeMatchmakers(list: AdminMatchmaker[], claims: AdminClaim[]): MatchmakerRow[] {
  const by = new Map<string, AdminClaim[]>()
  for (const c of claims) by.set(c.matchmaker.id, [...(by.get(c.matchmaker.id) ?? []), c])
  return list.map(m => {
    const mine = by.get(m.id) ?? []
    return {
      ...m,
      reqs: mine.length,
      ok: mine.filter(c => c.status === 'approved' || c.status === 'paid').length,
      wait: mine.filter(c => c.status === 'pending').length,
      paid: mine.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount ?? 0), 0),
      verified: !mine.some(c => c.status === 'pending' && c.is_grandchild && c.verification?.result !== 'verified'),
      recent: mine.slice(0, 5).map(c => ({ id: c.id, label: `${c.groom_name} ו${c.bride_name}`, created_at: c.created_at, status: c.status })),
    }
  })
}

export function filterMatchmakers(rows: MatchmakerRow[], f: MatchmakerFilter): MatchmakerRow[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return rows.filter(m => {
    if (q && !`${m.name} ${m.phone} ${m.email} ${m.circle ?? ''}`.toLowerCase().includes(q)) return false
    if (f.circle && m.circle !== f.circle) return false
    if (f.hasReq === 'pending' && m.wait === 0) return false
    if (f.hasReq === 'any' && m.reqs === 0) return false
    if (f.hasReq === 'none' && m.reqs !== 0) return false
    if (f.verif === 'ok' && !m.verified) return false
    if (f.verif === 'wait' && m.verified) return false
    if (f.limit === 'yes' && m.claims_limit == null) return false
    if (f.limit === 'no' && m.claims_limit != null) return false
    const d = m.created_at.slice(0, 10)
    if (f.from && d < f.from) return false
    if (f.to && d > f.to) return false
    if (f.counter === 'active' && m.reqs === 0) return false
    if (f.counter === 'wait' && m.wait === 0) return false
    return true
  })
}

function sortValue(m: MatchmakerRow, key: MatchmakerSortKey): string | number {
  switch (key) {
    case 'name': return m.name
    case 'circle': return m.circle ?? ''
    case 'bank': return m.bank_name ?? ''
    case 'reg': return m.created_at
    default: return m[key]
  }
}

export function sortMatchmakers(rows: MatchmakerRow[], s: MatchmakerSort): MatchmakerRow[] {
  return [...rows].sort((a, b) => {
    const x = sortValue(a, s.key), y = sortValue(b, s.key)
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'he')
    return r * s.dir
  })
}

export function matchmakerCounters(rows: MatchmakerRow[]) {
  return {
    total: rows.length,
    active: rows.filter(m => m.reqs > 0).length,
    waiting: rows.filter(m => m.wait > 0).length,
    paid: rows.reduce((s, m) => s + m.paid, 0),
  }
}

export function matchmakerFilterFromParams(p: URLSearchParams): MatchmakerFilter {
  const g = (k: string) => p.get(k) || undefined
  return { q: g('q'), circle: g('circle'), hasReq: g('hasReq'), verif: g('verif'), limit: g('limit'), from: g('from'), to: g('to'), counter: g('counter') }
}

export function matchmakerSortFromParams(p: URLSearchParams): MatchmakerSort {
  const k = p.get('sort') as MatchmakerSortKey | null
  return { key: k && MATCHMAKER_SORT_KEYS.includes(k) ? k : 'name', dir: p.get('dir') === 'desc' ? -1 : 1 }
}
