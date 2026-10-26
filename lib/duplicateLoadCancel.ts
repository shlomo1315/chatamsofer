import type { SupabaseClient } from '@supabase/supabase-js'
import { getNedarimCreds, getClientCardResult, parseNedarimAmount, prikatTlush } from '@/lib/nedarim'
import { tlushimOf } from '@/lib/maternityLoadGuard'
import { logActivity } from '@/lib/activityLog'

// ─────────────────────────────────────────────────────────────────────────────
// ביטול ממוקד של הטעינה העודפת (השנייה) ב-8 התיקים שנטענו פעמיים (אוקטובר 2026).
// שלמה אישר ביטול מפורש. מבטל *רק* את ה-tlush העודף בכל תיק, ולא נוגע ב-
// card_load_status / card_tlush_id של התיק (הם מצביעים על הטעינה שנשמרת).
//
// ⚠️ נדרים מורשה רק מכתובות IP מסוימות (שרת האתר), ולכן זה רץ מה-route ולא מבחוץ.
// ⚠️ פורקים רק את היתרה שנשארה ב-tlush העודף עצמו (FreeAmount); מה שכבר נוצל
// לא ניתן להחזרה ומדווח בנפרד. ה-tlush התקין לא נוגע.
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

/** היתרה שנשארה ב-tlush מסוים לפי Tlushim של GetClientCard, או null אם ה-tlush לא ברשימה. */
export function tlushRemaining(card: unknown, tlushId: string): number | null {
  const t = tlushimOf(card).find(x => String(x.TlushId ?? x.Id ?? '').trim() === tlushId)
  return t ? (parseNedarimAmount(t.FreeAmount) ?? 0) : null
}

export interface DuplicateRow {
  aidPrefix: string; name: string; clientId: string; excessTlush: string; keptTlush: string
  /** יתרה כוללת בכרטיס לפני / אחרי */
  balanceBefore: number | null; balanceAfter?: number | null
  /** מה שנשאר ב-tlush העודף (ניתן לפריקה), ומה שכבר נוצל ממנו (לא ניתן להחזרה) */
  excessRemaining: number | null; excessSpent: number | null
  status: 'ready' | 'executed' | 'already_unloaded' | 'already_cancelled' | 'mismatch' | 'failed'
  message?: string
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
      balanceBefore: null, excessRemaining: null, excessSpent: null, status: 'ready',
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

      const { card, message } = await getClientCardResult(creds, d.clientId)
      if (!card) { row.status = 'failed'; row.message = `נדרים לא החזירו את הכרטיס: ${message}`; continue }
      row.balanceBefore = parseNedarimAmount(card.TotalFreeAmount)
      row.excessRemaining = tlushRemaining(card, d.excess)
      if (row.excessRemaining == null) {
        row.status = 'already_unloaded'; row.message = 'ה-tlush העודף כבר לא ברשימה בנדרים'; continue
      }
      row.excessSpent = Math.max(0, Math.round((AMOUNT - row.excessRemaining) * 100) / 100)
      if (row.excessRemaining <= 0) { row.status = 'already_unloaded'; row.message = 'היתרה בטעינה העודפת כבר 0 — אין מה לפרוק'; continue }
      if (!opts.execute) continue

      const r = await prikatTlush(creds, d.excess)
      if (!r.ok) { row.status = 'failed'; row.message = r.message; continue }
      const after = await getClientCardResult(creds, d.clientId)
      row.balanceAfter = after.card ? parseNedarimAmount(after.card.TotalFreeAmount) : null
      const dropped = row.balanceAfter != null && row.balanceBefore != null
        ? Math.round((row.balanceBefore - row.balanceAfter) * 100) / 100 : null
      row.status = 'executed'
      if (dropped !== row.excessRemaining) row.message = `⚠️ היתרה ירדה ב-${dropped} ולא ב-${row.excessRemaining} — לבדוק בנדרים`
      await logActivity(admin, {
        action: CANCEL_ACTION, entityType: 'maternity_aid', entityId: aid.id,
        userId: opts.by ?? null,
        details: { tlushId: d.excess, keptTlush: d.kept, clientId: d.clientId, balanceBefore: row.balanceBefore, balanceAfter: row.balanceAfter, cancelled: row.excessRemaining, spent: row.excessSpent, message: r.message, by: opts.by ?? null },
      })
    } catch (e) {
      row.status = 'failed'; row.message = e instanceof Error ? e.message : String(e)
    }
  }
  return out
}
