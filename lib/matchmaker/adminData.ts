import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptValue, maskId } from './crypto'

// נתוני מסך הניהול: ת"ז תמיד מוסתרת חלקית (*****1234); חשיפה מלאה רק דרך נתיב reveal עם יומן.

export interface AdminClaim {
  id: string; match_date: string; created_at: string
  groom_name: string; groom_id_masked: string | null; groom_father_name: string | null; groom_phone: string | null
  groom_mother_name: string | null; groom_mother_phone: string | null; groom_address: string | null; groom_circle: string | null
  bride_name: string; bride_id_masked: string | null; bride_father_name: string | null; bride_phone: string | null
  bride_mother_name: string | null; bride_mother_phone: string | null; bride_address: string | null; bride_circle: string | null
  second_matchmaker: { first_name: string; last_name: string; phone: string; email: string; city: string; address: string; circle: string; id_number?: string } | null
  reasons: Record<string, unknown>
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
    groom_name: `${r.groom_first_name} ${r.groom_last_name}`, groom_id_masked: r.groom_id_enc ? maskId(decryptValue(r.groom_id_enc)) : null,
    groom_father_name: r.groom_father_name, groom_phone: r.groom_phone,
    groom_mother_name: r.groom_mother_name ?? null, groom_mother_phone: r.groom_mother_phone ?? null, groom_address: r.groom_address ?? null, groom_circle: r.groom_circle ?? null,
    bride_name: `${r.bride_first_name} ${r.bride_last_name}`, bride_id_masked: r.bride_id_enc ? maskId(decryptValue(r.bride_id_enc)) : null,
    bride_father_name: r.bride_father_name, bride_phone: r.bride_phone,
    bride_mother_name: r.bride_mother_name ?? null, bride_mother_phone: r.bride_mother_phone ?? null, bride_address: r.bride_address ?? null, bride_circle: r.bride_circle ?? null,
    second_matchmaker: r.second_matchmaker ? { ...r.second_matchmaker, id_number: r.second_matchmaker.id_number ? maskId(decryptValue(r.second_matchmaker.id_number)) : undefined } : null,
    reasons: r.reasons ?? {},
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

/** שדכן במסך הניהול: חשבון הבנק מוסווה; חשיפה מלאה רק דרך נתיב reveal עם יומן. */
export interface AdminMatchmaker {
  id: string; name: string; phone: string; email: string; circle: string | null; created_at: string
  claims_limit: number | null; claims_count: number
  bank_name: string | null; bank_branch: string | null; bank_account_masked: string | null
}

export async function loadAdminMatchmakers(db: SupabaseClient, claims: AdminClaim[]): Promise<AdminMatchmaker[]> {
  const { data } = await db.from('matchmakers')
    .select('id, first_name, last_name, phone, email, circle, created_at, claims_limit, bank_name, bank_branch, bank_account_enc')
    .order('created_at', { ascending: false }).limit(2000)
  const counts = new Map<string, number>()
  for (const c of claims) counts.set(c.matchmaker.id, (counts.get(c.matchmaker.id) ?? 0) + 1)
  return ((data ?? []) as Record<string, any>[]).map(r => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    id: r.id, name: `${r.first_name} ${r.last_name}`, phone: r.phone, email: r.email, circle: r.circle, created_at: r.created_at,
    claims_limit: r.claims_limit ?? null, claims_count: counts.get(r.id) ?? 0,
    bank_name: r.bank_name, bank_branch: r.bank_branch,
    bank_account_masked: r.bank_account_enc ? maskId(decryptValue(r.bank_account_enc)) : null,
  }))
}
