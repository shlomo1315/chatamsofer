import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_CLAIMS_OPEN } from './validate'

export interface MatchmakerSettings {
  regular_amount: number | null
  enlarged_amount: number | null
  max_claims_per_matchmaker: number | null
  /** מתי נפתחת הגשת בקשות לכולם (YYYY-MM-DD) */
  claims_open_from: string
  /** ימי המתנה מההרשמה עד שאפשר להגיש בקשה */
  claim_wait_days: number
}

export async function loadSettings(db: SupabaseClient): Promise<MatchmakerSettings> {
  const { data } = await db.from('matchmaker_settings').select('regular_amount, enlarged_amount, max_claims_per_matchmaker, claims_open_from, claim_wait_days').eq('id', 1).maybeSingle()
  return {
    regular_amount: data?.regular_amount != null ? Number(data.regular_amount) : null,
    enlarged_amount: data?.enlarged_amount != null ? Number(data.enlarged_amount) : null,
    max_claims_per_matchmaker: data?.max_claims_per_matchmaker ?? null,
    claims_open_from: data?.claims_open_from ?? DEFAULT_CLAIMS_OPEN,
    claim_wait_days: data?.claim_wait_days ?? 7,
  }
}

/** סכום מוצע לפי סוג הבקשה (הגדרה שהמנהל קובע; null = טרם נקבע). */
export function suggestedAmount(s: MatchmakerSettings, isGrandchild: boolean): number | null {
  return isGrandchild ? s.enlarged_amount : s.regular_amount
}

/** מגבלת הבקשות של שדכן: ההגבלה הפרטנית גוברת על הכללית. null = ללא הגבלה. */
export function effectiveLimit(s: MatchmakerSettings, personal: number | null | undefined): number | null {
  return personal != null ? personal : s.max_claims_per_matchmaker
}
