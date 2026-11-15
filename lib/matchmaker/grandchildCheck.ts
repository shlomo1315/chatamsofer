import type { SupabaseClient } from '@supabase/supabase-js'
import { idOrFilter, sameId } from '@/lib/idLookup'

// ─────────────────────────────────────────────────────────────────────────────
// בדיקת "נכד החתם סופר": האם ת"ז החתן/הכלה קיימת כצאצא (id_number) או כבן/בת זוג
// של צאצא (spouse_id_number) במאגר. התוצאה המלצה בלבד: "לא נמצא" לא דוחה אוטומטית.
// ─────────────────────────────────────────────────────────────────────────────

export interface GrandchildMatch {
  side: 'groom' | 'bride'
  beneficiary_id: string
  name: string
  family_id: string | null
  family_name: string | null
  matched_on: 'id_number' | 'spouse_id_number'
}

export interface GrandchildVerification {
  result: 'verified' | 'not_found'
  checked_at: string
  checked_sides: ('groom' | 'bride')[]
  matches: GrandchildMatch[]
}

type SideChoice = 'groom' | 'bride' | 'both'

export async function verifyGrandchild(
  db: SupabaseClient,
  side: SideChoice,
  ids: { groom: string | null; bride: string | null },
  now = new Date(),
): Promise<GrandchildVerification> {
  const sides: ('groom' | 'bride')[] = side === 'both' ? ['groom', 'bride'] : [side]
  const matches: GrandchildMatch[] = []
  for (const s of sides) {
    const id = ids[s]
    if (!id) continue
    const filter = idOrFilter(id, ['id_number', 'spouse_id_number'])
    if (!filter) continue
    const { data } = await db
      .from('beneficiaries')
      .select('id, full_name, family_name, family_id, id_number, spouse_id_number')
      .or(filter)
      .limit(5)
    for (const b of data ?? []) {
      const matched_on = sameId(b.id_number, id) ? 'id_number' : sameId(b.spouse_id_number, id) ? 'spouse_id_number' : null
      if (!matched_on) continue
      matches.push({
        side: s, beneficiary_id: b.id, name: b.full_name, family_id: b.family_id ?? null,
        family_name: b.family_name ?? null, matched_on,
      })
    }
  }
  return { result: matches.length ? 'verified' : 'not_found', checked_at: now.toISOString(), checked_sides: sides, matches }
}
