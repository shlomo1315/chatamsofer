import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptValue, maskId } from './crypto'

// נתוני מסך הניהול: ת"ז תמיד מוסתרת חלקית (*****1234); חשיפה מלאה רק דרך נתיב reveal עם יומן.

export interface AdminClaim {
  id: string; match_date: string; created_at: string
  groom_name: string; groom_id_masked: string; groom_father_name: string | null; groom_phone: string | null
  bride_name: string; bride_id_masked: string; bride_father_name: string | null; bride_phone: string | null
  is_grandchild: boolean; grandchild_side: 'groom' | 'bride' | 'both' | null
  verification: { result: 'verified' | 'not_found'; checked_at: string; matches: { side: string; name: string; family_name: string | null; matched_on: string }[] } | null
  status: 'pending' | 'approved' | 'rejected' | 'paid'
  amount: number | null; reject_reason: string | null
  handled_by: string | null; handled_at: string | null; paid_at: string | null
  matchmaker: { id: string; name: string; phone: string; email: string; city: string }
}

export interface ClaimFilter {
  status?: string; grandchild?: string; from?: string; to?: string; matchmaker?: string; q?: string
}

interface Row extends Record<string, any> { matchmakers: Record<string, any> | null } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadAdminClaims(db: SupabaseClient): Promise<AdminClaim[]> {
  const { data } = await db.from('matchmaker_claims')
    .select('*, matchmakers(id, first_name, last_name, phone, email, city)')
    .order('created_at', { ascending: false }).limit(5000)
  return ((data ?? []) as Row[]).map(r => ({
    id: r.id, match_date: r.match_date, created_at: r.created_at,
    groom_name: `${r.groom_first_name} ${r.groom_last_name}`, groom_id_masked: maskId(decryptValue(r.groom_id_enc)),
    groom_father_name: r.groom_father_name, groom_phone: r.groom_phone,
    bride_name: `${r.bride_first_name} ${r.bride_last_name}`, bride_id_masked: maskId(decryptValue(r.bride_id_enc)),
    bride_father_name: r.bride_father_name, bride_phone: r.bride_phone,
    is_grandchild: r.is_grandchild, grandchild_side: r.grandchild_side, verification: r.verification,
    status: r.status, amount: r.amount != null ? Number(r.amount) : null, reject_reason: r.reject_reason,
    handled_by: r.handled_by, handled_at: r.handled_at, paid_at: r.paid_at,
    matchmaker: {
      id: r.matchmakers?.id ?? '', name: `${r.matchmakers?.first_name ?? ''} ${r.matchmakers?.last_name ?? ''}`.trim(),
      phone: r.matchmakers?.phone ?? '', email: r.matchmakers?.email ?? '', city: r.matchmakers?.city ?? '',
    },
  }))
}

export function filterClaims(rows: AdminClaim[], f: ClaimFilter): AdminClaim[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return rows.filter(c => {
    if (f.status && c.status !== f.status) return false
    if (f.matchmaker && c.matchmaker.id !== f.matchmaker) return false
    if (f.grandchild === 'yes' && !c.is_grandchild) return false
    if (f.grandchild === 'no' && c.is_grandchild) return false
    if (f.grandchild === 'verified' && c.verification?.result !== 'verified') return false
    if (f.grandchild === 'not_found' && !(c.is_grandchild && c.verification?.result === 'not_found')) return false
    const d = c.created_at.slice(0, 10)
    if (f.from && d < f.from) return false
    if (f.to && d > f.to) return false
    if (q && ![c.groom_name, c.bride_name, c.matchmaker.name, c.matchmaker.phone, c.matchmaker.email, c.groom_phone, c.bride_phone]
      .some(v => (v ?? '').toLowerCase().includes(q))) return false
    return true
  })
}

export function computeCounters(rows: AdminClaim[]) {
  return {
    pending: rows.filter(c => c.status === 'pending').length,
    approved: rows.filter(c => c.status === 'approved' || c.status === 'paid').length,
    grandchildren: rows.filter(c => c.is_grandchild).length,
    payable: rows.filter(c => c.status === 'approved').reduce((s, c) => s + (c.amount ?? 0), 0),
  }
}

export function filterFromParams(p: URLSearchParams): ClaimFilter {
  const g = (k: string) => p.get(k) || undefined
  return { status: g('status'), grandchild: g('grandchild'), from: g('from'), to: g('to'), matchmaker: g('matchmaker'), q: g('q') }
}

export async function logAudit(db: SupabaseClient, claimId: string | null, action: string, detail: string | null, actor: string | null) {
  await db.from('matchmaker_audit').insert({ claim_id: claimId, action, detail, actor })
}
