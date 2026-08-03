import { createClient } from '@supabase/supabase-js'
import { getNedarimCreds, prikatTlush, removeMagneticByNumber } from '@/lib/nedarim'

// ─────────────────────────────────────────────────────────────────────────────
// פריקת טעינה של תיק בודד — משותפת לפריקה האוטומטית (6 שבועות) ולביטול טעינה
// בעקבות שינוי סטטוס (אישור שבוטל / הוחזר לממתין).
//
// ⚠️ עד כה טעינה שבוצעה נשארה בתוקף לנצח: ברגע שהתיק נטען, שינוי הסטטוס
// ל"לא מאושר" לא נגע בכסף — היולדת נשארה עם 600 ₪ בכרטיס למרות שהבקשה נדחתה.
// ─────────────────────────────────────────────────────────────────────────────
export interface UnloadableAid {
  id: string
  card_tlush_id?: string | null
  card_number?: string | null
  six_weeks_end?: string | null
  beneficiary?: { nedarim_id?: string | null } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any

export async function unloadAidCard(
  admin: AdminDb,
  creds: NonNullable<Awaited<ReturnType<typeof getNedarimCreds>>>,
  aid: UnloadableAid,
  reason: string,
): Promise<{ ok: boolean; message?: string }> {
  const r = await prikatTlush(creds, String(aid.card_tlush_id))
  if (!r.ok) {
    await admin.from('maternity_aids').update({ card_load_error: r.message }).eq('id', aid.id)
    return { ok: false, message: r.message }
  }

  // מחיקת הכרטיס המגנטי מהמשפחה בנדרים — כדי שבלידה הבאה יקבלו כרטיס חדש
  const nedarimId = aid.beneficiary?.nedarim_id ?? null
  const cardNumber = String(aid.card_number ?? '').trim()
  let cardRemoved = false
  let cardRemoveError: string | null = null
  if (nedarimId && cardNumber) {
    try {
      const rm = await removeMagneticByNumber(creds, String(nedarimId), cardNumber)
      cardRemoved = rm.ok
      if (!rm.ok) cardRemoveError = rm.message
    } catch (e) { cardRemoveError = e instanceof Error ? e.message : String(e) }
  } else {
    cardRemoved = true // אין כרטיס לנתק
  }

  await admin.from('maternity_aids').update({
    card_load_status: 'unloaded',
    card_unloaded_at: new Date().toISOString(),
    card_balance: 0,
    // ניקוי הכרטיס והאיסוף בתיק רק אם נותק בנדרים בהצלחה — כדי שבלידה הבאה אפשר יהיה לחבר מחדש
    card_number: cardRemoved ? null : aid.card_number,
    card_picked_up_at: cardRemoved ? null : undefined,
    card_load_error: cardRemoveError,
  }).eq('id', aid.id)

  await admin.from('activity_log').insert({
    action: 'maternity_card_unloaded',
    entity_type: 'maternity_aid',
    entity_id: aid.id,
    details: {
      tlushId: aid.card_tlush_id, reason,
      card_removed: cardRemoved, card_remove_error: cardRemoveError, card_number_last4: cardNumber.slice(-4),
    },
  })
  return { ok: true }
}

// פריקה אוטומטית של כרטיסים שעברו 6 שבועות מהלידה.
// משמש גם את נקודת-הקצה /api/nedarim/unload-expired וגם את המתזמן הפנימי (instrumentation).
export async function runUnloadExpired(): Promise<{ ok: boolean; processed: number; error?: string }> {
  const creds = await getNedarimCreds()
  if (!creds) return { ok: false, processed: 0, error: 'חיבור נדרים פלוס לא מוגדר' }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, processed: 0, error: 'Supabase לא מוגדר' }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const today = new Date().toISOString().slice(0, 10) // yyyy-mm-dd

  // תיקים שהוטענו, יש להם מזהה טעינה, ועברו 6 שבועות מהלידה (six_weeks_end <= היום)
  // מושכים גם את מספר הכרטיס ואת מזהה המשפחה בנדרים — כדי למחוק את הכרטיס המגנטי בתום הפריקה.
  const { data: aids, error } = await admin
    .from('maternity_aids')
    .select('id, card_tlush_id, six_weeks_end, card_number, beneficiary:beneficiaries(nedarim_id)')
    .eq('card_load_status', 'loaded')
    .not('card_tlush_id', 'is', null)
    .lte('six_weeks_end', today)
  if (error) return { ok: false, processed: 0, error: error.message }

  let processed = 0
  for (const aid of aids ?? []) {
    try {
      const r = await unloadAidCard(admin, creds, aid as UnloadableAid, `פריקה אוטומטית בתום 6 שבועות (${aid.six_weeks_end})`)
      if (r.ok) processed++
    } catch (e) {
      console.error('[unload-expired] failed for', aid.id, e)
    }
  }

  return { ok: true, processed }
}
