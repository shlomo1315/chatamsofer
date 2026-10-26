import type { SupabaseClient } from '@supabase/supabase-js'
import { getNedarimCreds, getClientCard, getClientCardFull, prikatTlush } from '@/lib/nedarim'
import { logActivity } from '@/lib/activityLog'

// ─────────────────────────────────────────────────────────────────────────────
// ביטול ממוקד של הטעינה העודפת (השנייה) ב-8 התיקים שנטענו פעמיים (אוקטובר 2026).
// שלמה אישר ביטול מפורש. מבטל *רק* את ה-tlush העודף בכל תיק, ולא נוגע ב-
// card_load_status / card_tlush_id של התיק (הם מצביעים על הטעינה שנשמרת).
//
// ⚠️ נדרים מורשה רק מכתובות IP מסוימות (שרת האתר), ולכן זה רץ מה-route ולא מבחוץ.
// ⚠️ אין ביטול חלקי: אם היתרה בכרטיס קטנה מסכום הטעינה, הכסף כבר נוצל (בחלקו)
// והתיק מדולג ומדווח.
// ─────────────────────────────────────────────────────────────────────────────
export const DUPLICATE_LOADS = [
  { aidPrefix: 'f83b8b1c', clientId: '529031', excess: '4341268', kept: '4341269' },
  { aidPrefix: 'f457c669', clientId: '517906', excess: '4219371', kept: '4219372' },
  { aidPrefix: '32d327b5', clientId: '519934', excess: '4269452', kept: '4275757' },
  { aidPrefix: '31b25f6b', clientId: '437707', excess: '3656234', kept: '3681797' },
  { aidPrefix: 'd6df92dd', clientId: '429109', excess: '3607314', kept: '3610392' },
  { aidPrefix: 'e0596d98', clientId: '470411', excess: '3556418', kept: '3603033' },
  { aidPrefix: 'c61e0a81', clientId: '426585', excess: '3551977', kept: '3575205' },
  { aidPrefix: '819989ae', clientId: '478318', excess: '3564188', kept: '3570502' },
] as const

export const CANCEL_ACTION = 'maternity_duplicate_load_cancelled'
const AMOUNT = 600

/** ניתן לבטל טעינה מלאה רק כשהיתרה מכסה אותה. */
export function canCancelFully(balance: number | null, amount = AMOUNT): boolean {
  return balance != null && balance >= amount
}

export interface DuplicateRow {
  aidPrefix: string; name: string; clientId: string; excessTlush: string; keptTlush: string
  balanceBefore: number | null; spentEstimate: number | null
  status: 'ready' | 'executed' | 'skipped_spent' | 'already_cancelled' | 'mismatch' | 'failed'
  message?: string; balanceAfter?: number | null; raw?: unknown
}

export async function processDuplicateLoads(
  admin: SupabaseClient, opts: { execute: boolean; by?: string | null },
): Promise<DuplicateRow[]> {
  const creds = await getNedarimCreds()
  if (!creds) throw new Error('נדרים לא מוגדר')
  const out: DuplicateRow[] = []

  for (const d of DUPLICATE_LOADS) {
    const row: DuplicateRow = {
      aidPrefix: d.aidPrefix, name: '', clientId: d.clientId, excessTlush: d.excess, keptTlush: d.kept,
      balanceBefore: null, spentEstimate: null, status: 'ready',
    }
    out.push(row)
    try {
      // אימות מול המסד: הנשמר בתיק הוא kept, והעודף מתועד בלוג כטעינה של אותו תיק.
      const { data: aids } = await admin.from('maternity_aids')
        .select('id, card_tlush_id, beneficiary:beneficiaries(full_name, family_name, nedarim_id)')
        .gte('id', `${d.aidPrefix}-0000-0000-0000-000000000000`)
        .lte('id', `${d.aidPrefix}-ffff-ffff-ffff-ffffffffffff`)
      const aid = aids?.[0] as unknown as {
        id: string; card_tlush_id: string | null
        beneficiary: { full_name?: string; family_name?: string; nedarim_id?: string | null }
          | { full_name?: string; family_name?: string; nedarim_id?: string | null }[] | null
      } | undefined
      const b = Array.isArray(aid?.beneficiary) ? aid?.beneficiary[0] : aid?.beneficiary
      row.name = [b?.full_name, b?.family_name].filter(Boolean).join(' ')
      if (!aid || String(aid.card_tlush_id) !== d.kept || String(b?.nedarim_id) !== d.clientId) {
        row.status = 'mismatch'; row.message = 'התיק לא תואם לרשימה — לא בוצע דבר'; continue
      }
      const { data: logged } = await admin.from('activity_log').select('id')
        .eq('action', 'maternity_card_loaded').eq('entity_id', aid.id).eq('details->>tlushId', d.excess)
      if (!logged?.length) { row.status = 'mismatch'; row.message = 'ה-tlush העודף לא מתועד בלוג של התיק'; continue }
      const { data: done } = await admin.from('activity_log').select('id')
        .eq('action', CANCEL_ACTION).eq('entity_id', aid.id).eq('details->>tlushId', d.excess)
      if (done?.length) { row.status = 'already_cancelled'; continue }

      const card = await getClientCard(creds, d.clientId)
      row.balanceBefore = card?.totalFreeAmount ?? null
      if (!opts.execute) row.raw = await getClientCardFull(creds, d.clientId)
      if (row.balanceBefore == null) { row.status = 'failed'; row.message = 'לא התקבלה יתרה מנדרים'; continue }
      // הערכה גסה: שתי טעינות של 600 פחות היתרה (מניחה שאין טעינות אחרות במשפחה)
      row.spentEstimate = Math.max(0, 2 * AMOUNT - row.balanceBefore)
      if (!canCancelFully(row.balanceBefore)) {
        row.status = 'skipped_spent'; row.message = `היתרה (${row.balanceBefore}) קטנה מ-${AMOUNT} — הכסף נוצל, לא בוטל`; continue
      }
      if (!opts.execute) continue

      const r = await prikatTlush(creds, d.excess)
      if (!r.ok) { row.status = 'failed'; row.message = r.message; continue }
      const after = await getClientCard(creds, d.clientId)
      row.balanceAfter = after?.totalFreeAmount ?? null
      const dropped = row.balanceAfter != null ? row.balanceBefore - row.balanceAfter : null
      row.status = 'executed'
      if (dropped !== AMOUNT) row.message = `⚠️ היתרה ירדה ב-${dropped} ולא ב-${AMOUNT} — לבדוק בנדרים`
      await logActivity(admin, {
        action: CANCEL_ACTION, entityType: 'maternity_aid', entityId: aid.id,
        userId: opts.by ?? null,
        details: { tlushId: d.excess, keptTlush: d.kept, clientId: d.clientId, balanceBefore: row.balanceBefore, balanceAfter: row.balanceAfter, message: r.message, by: opts.by ?? null },
      })
    } catch (e) {
      row.status = 'failed'; row.message = e instanceof Error ? e.message : String(e)
    }
  }
  return out
}
