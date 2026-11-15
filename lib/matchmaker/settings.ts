import type { SupabaseClient } from '@supabase/supabase-js'

export interface MatchmakerSettings {
  regular_amount: number | null
  enlarged_amount: number | null
  max_claims_per_matchmaker: number | null
}

export async function loadSettings(db: SupabaseClient): Promise<MatchmakerSettings> {
  const { data } = await db.from('matchmaker_settings').select('regular_amount, enlarged_amount, max_claims_per_matchmaker').eq('id', 1).maybeSingle()
  return {
    regular_amount: data?.regular_amount != null ? Number(data.regular_amount) : null,
    enlarged_amount: data?.enlarged_amount != null ? Number(data.enlarged_amount) : null,
    max_claims_per_matchmaker: data?.max_claims_per_matchmaker ?? null,
  }
}

/** סכום מוצע לפי סוג הבקשה (הגדרה שהמנהל קובע; null = טרם נקבע). */
export function suggestedAmount(s: MatchmakerSettings, isGrandchild: boolean): number | null {
  return isGrandchild ? s.enlarged_amount : s.regular_amount
}
