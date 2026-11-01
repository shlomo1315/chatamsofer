import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail, cleanSubscriberName, subscribeGilyonot } from '@/lib/gilyonot'

// ─────────────────────────────────────────────────────────────────────────────
// כל נרשם במערכת הצאצאים (beneficiaries) נכנס אוטומטית לרשימת הדיוור.
// ⚠️ דרך subscribeGilyonot עם מקור 'descendants': מי שכבר ברשימה לא משוכפל, ומי
// שהסיר את עצמו לא יוחזר (רק הרשמה חדשה שלו עצמו באתר או בנדרים מחזירה).
// הסנכרון הראשוני של הקיימים: supabase/migrations/20261104_gilyonot_descendants.sql
// ─────────────────────────────────────────────────────────────────────────────

export interface DescendantContact { id?: string | null; email?: string | null; full_name?: string | null }

/** מצרף צאצא אחד לרשימה. best-effort: כשל לא מפיל את ההרשמה. */
export async function addDescendantToMailing(db: SupabaseClient, d: DescendantContact): Promise<void> {
  const email = normalizeEmail(d.email)
  if (!email) return
  try {
    await subscribeGilyonot(db, {
      email, name: cleanSubscriberName(d.full_name), source: 'descendants', sourceRef: d.id ?? null,
    })
  } catch (e) {
    console.error('[gilyonot] descendant sync failed:', e)
  }
}

/** סנכרון חד-פעמי של כל הצאצאים הקיימים (לשימוש סקריפט או ראוט אדמין). */
export async function syncAllDescendantsToMailing(db: SupabaseClient): Promise<{ scanned: number; added: number }> {
  let scanned = 0, added = 0
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from('beneficiaries')
      .select('id, email, full_name').not('email', 'is', null).order('id').range(from, from + page - 1)
    if (error) throw new Error(error.message)
    for (const b of data ?? []) {
      scanned++
      const email = normalizeEmail(b.email)
      if (!email) continue
      const r = await subscribeGilyonot(db, { email, name: cleanSubscriberName(b.full_name), source: 'descendants', sourceRef: b.id })
      if (r.ok && r.outcome === 'added') added++
    }
    if ((data?.length ?? 0) < page) break
  }
  return { scanned, added }
}
