import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 22.11.2026: שחרור תיקים "ממתינים לתשובת היולדת" שהמשפחה כבר פעלה בהם.
//
// עד היום תיק יצא מההמתנה רק בתשובה למייל. משפחה שתיקנה דורות בקישור, באזור
// האישי, או העלתה מסמך — נשארה תקועה (20 תיקים, למשל ת"ז יולדת שפנתה 22.11).
// מעכשיו הפעולות האלה נרשמות מיד (markMaternityInquiryAnswered), והפונקציה הזו
// היא רשת ביטחון: רצה כל שעה (instrumentation.ts) ומשחררת כל תיק שנתקע —
// גם אלה שנתקעו לפני התיקון, וגם מסלול עתידי שאולי נשכח לחבר.
//
// ⚠️ חוזרת בבטחה: אחרי השחרור ההודעה האחרונה היא 'applicant', והתיק כבר לא
// עונה לתנאי — הרצה שנייה לא תכתוב שוב.
// ─────────────────────────────────────────────────────────────────────────────

export type StuckCase = { aidId: string; family: string; askedAt: string; actions: string[] }

export async function findAnsweredOutsideChat(db: SupabaseClient): Promise<StuckCase[]> {
  const { data: aids } = await db.from('maternity_aids')
    .select('id, beneficiary_id, beneficiary:beneficiaries(family_name, spouse_name, full_name)')
    .in('status', ['pending', 'deep_review'])
  const hits: StuckCase[] = []
  for (const a of aids ?? []) {
    const { data: last } = await db.from('maternity_messages')
      .select('direction, created_at').eq('aid_id', a.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (last?.direction !== 'staff' || !a.beneficiary_id) continue
    const since = last.created_at as string
    const actions: string[] = []

    const { count: applied } = await db.from('activity_log')
      .select('id', { count: 'exact', head: true }).eq('entity_id', a.beneficiary_id)
      .eq('action', 'lineage_review_applied').gt('created_at', since)
    if (applied) actions.push('תיקנה את סדר הדורות בקישור')

    const { data: invites } = await db.from('lineage_share_invites')
      .select('token').eq('beneficiary_id', a.beneficiary_id)
    const tokens = (invites ?? []).map(i => i.token as string).filter(Boolean)
    if (tokens.length) {
      const { count } = await db.from('lineage_review_suggestions')
        .select('id', { count: 'exact', head: true }).in('token', tokens).gt('created_at', since)
      if (count) actions.push('שלחה תיקון/הערה על הדורות בקישור')
    }
    const { count: portalFix } = await db.from('lineage_review_suggestions')
      .select('id', { count: 'exact', head: true }).eq('beneficiary_id', a.beneficiary_id).gt('created_at', since)
    if (portalFix) actions.push('שלחה תיקון דורות מהאזור האישי')

    const { count: docs } = await db.from('documents')
      .select('id', { count: 'exact', head: true }).eq('beneficiary_id', a.beneficiary_id).gt('uploaded_at', since)
    if (docs) actions.push('העלתה מסמכים')

    if (!actions.length) continue
    const raw = (a as { beneficiary?: unknown }).beneficiary
    const b = (Array.isArray(raw) ? raw[0] : raw) as { family_name?: string; spouse_name?: string; full_name?: string } | undefined
    hits.push({
      aidId: a.id as string,
      family: [b?.family_name, b?.spouse_name || b?.full_name].filter(Boolean).join(' '),
      askedAt: since,
      actions,
    })
  }
  return hits
}

export async function releaseAnsweredOutsideChat(db: SupabaseClient): Promise<{ found: StuckCase[]; released: number }> {
  const found = await findAnsweredOutsideChat(db)
  let released = 0
  for (const h of found) {
    const { error } = await db.from('maternity_messages').insert({
      aid_id: h.aidId,
      direction: 'applicant',
      body: `✅ המשפחה פעלה אחרי הבירור: ${h.actions.join(' · ')} (נרשם אוטומטית — לא השיבה למייל)`,
      sender_name: 'המערכת',
      is_read: false,
    })
    if (!error) released++
  }
  return { found, released }
}
