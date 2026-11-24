import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 A3 (24.11): בקשות תיקון סדר הדורות שהמשפחה שלחה — לתצוגה בתיק היולדת.
//
// ⚠️ תיקון בקישור שלא הוחל אוטומטית (למשל "דור 5 אינו תואם את סדר הדורות
// המאושר") נשמר כ-note ממתין ב-lineage_review_suggestions, ומוצג רק במסך
// "בקשות משפחות" בעץ הדורות. המנהל נכנס לתיק היולדת לאישור ולא ראה שם
// כלום — "תיקנתי, אך לא מופיע באתר" (יעקב, 24.11).
// ─────────────────────────────────────────────────────────────────────────────

export interface FamilyLineageRequest {
  id: string
  createdAt: string
  reviewerName: string | null
  reason: string | null
  chain: { generation: number; name: string; relation: 'son' | 'son_in_law' | null }[]
}

interface Row {
  id: string; created_at: string; reviewer_name: string | null
  payload: { text?: string; chain?: unknown } | null
}

export function toFamilyLineageRequest(r: Row): FamilyLineageRequest {
  const text = r.payload?.text ?? ''
  const reason = /לא הוחלה אוטומטית\s*[—-]\s*([^\n]+?)\):?\s*(\n|$)/.exec(text)?.[1]?.trim() ?? null
  const raw = Array.isArray(r.payload?.chain) ? (r.payload!.chain as Record<string, unknown>[]) : []
  const chain = raw
    .filter(c => typeof c?.name === 'string' && Number.isFinite(Number(c?.generation)))
    .map((c): FamilyLineageRequest['chain'][number] => ({
      generation: Number(c.generation),
      name: String(c.name),
      relation: c.relation === 'son' ? 'son' : c.relation === 'son_in_law' ? 'son_in_law' : null,
    }))
    .sort((a, b) => a.generation - b.generation)
  return { id: r.id, createdAt: r.created_at, reviewerName: r.reviewer_name, reason, chain }
}

export async function loadFamilyLineageRequests(db: SupabaseClient | null, beneficiaryId: string | null | undefined): Promise<FamilyLineageRequest[]> {
  if (!db || !beneficiaryId) return []
  const { data, error } = await db
    .from('lineage_review_suggestions')
    .select('id, created_at, reviewer_name, payload')
    .eq('beneficiary_id', beneficiaryId)
    .eq('kind', 'note')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) {
    console.error('[familyLineageRequests] טעינה נכשלה:', error.message)
    return []
  }
  return ((data ?? []) as Row[]).map(toFamilyLineageRequest)
}
