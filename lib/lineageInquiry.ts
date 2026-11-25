import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { lineageOrderFixEmail } from '@/lib/emailTemplates'
import { recipientNameOf } from '@/lib/lineageFaultNotice'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { logActivity } from '@/lib/activityLog'
import { isAutoDeepReason, isUncheckedDeepReason } from '@/lib/earlyLineageGate'
import { LINEAGE_LINK_DAYS, linkSentRecently, type InquiryRow } from '@/lib/lineageInquiryTag'

// ── בירור סדר הדורות: שליחת הקישור לתיקון וסימון התשובה ──
// התווית עצמה ("נשלח לבירור" / "חזר מבירור") ב-lib/lineageInquiryTag.
export { LINEAGE_LINK_DAYS, lineageInquiryTag, linkSentRecently, type LineageInquiryTag, type InquiryRow } from '@/lib/lineageInquiryTag'

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export interface AutoSendBen extends InquiryRow {
  email?: string | null
  lineage_node_id?: string | null
  deep_review_reason?: string | null
}

/**
 * למה לא לשלוח קישור אוטומטי (null = לשלוח).
 * ⚠️ רק כשהשער קבע שהסדר לא תואם את הקובץ. סיבה שהמזכירות הקלידה, או כשל
 * בטעינת הקובץ (לא באשמת המשפחה), לא מפעילים מייל.
 */
export function autoSendSkipReason(ben: AutoSendBen, now = Date.now()): string | null {
  if (ben.eligibility_status !== 'deep_review') return 'לא בבדיקה מעמיקה'
  const reason = ben.deep_review_reason ?? ''
  if (!isAutoDeepReason(reason) || isUncheckedDeepReason(reason)) return 'הבדיקה המעמיקה אינה בגלל אי-התאמה לקובץ'
  if (!ben.lineage_node_id) return 'אין שיוך לעץ'
  if (!isValidEmail((ben.email ?? '').trim())) return 'אין מייל תקין'
  if (linkSentRecently(ben.lineage_link_sent_at, now)) return 'כבר נשלח קישור בתוקף'
  return null
}

const BEN_COLUMNS = 'id, full_name, family_name, spouse_name, marital_status, email, lineage_node_id, eligibility_status, deep_review_reason, lineage_link_sent_at, lineage_inquiry_returned_at'

type BenRow = AutoSendBen & {
  id: string; full_name: string | null; family_name?: string | null
  spouse_name?: string | null; marital_status?: string | null
}

export type SendLinkResult =
  | { ok: true; link: string; sentTo: string; mailError?: string }
  | { ok: false; error: string; status: number }

/**
 * יצירת קישור אישי לתיקון סדר הדורות ושליחתו במייל.
 * ⚠️ ההזמנה משויכת לצאצא (beneficiary_id) ו-mode='order' — הצעות בלבד, בענף שלו.
 * שורש הענף הוא האב האחרון המשויך (lineage_node_id).
 */
export async function sendLineageFixLink(
  db: SupabaseClient,
  ben: BenRow,
  opts: { email?: string; userId?: string | null; auto?: boolean } = {},
): Promise<SendLinkResult> {
  const email = (opts.email ?? '').trim() || (ben.email ?? '').trim()
  if (!email || !isValidEmail(email)) return { ok: false, error: 'לצאצא אין כתובת מייל תקינה — יש להזין אחת', status: 400 }
  if (!ben.lineage_node_id) {
    return { ok: false, error: 'לצאצא אין שיוך לעץ הדורות — יש לשייך אותו לצומת לפני שליחת הקישור', status: 400 }
  }

  await ensureEmailTexts()
  const token = randomBytes(16).toString('base64url')
  const recipientName = recipientNameOf(ben)
  // 🔴 30 יום, אחרי שהיה 7: חצי מהקישורים פגו אצל משפחות שכבר פתחו אותם.
  // החשיפה מוגבלת — הצעות בלבד, ענף אחד, ביטול מיידי מהממשק.
  const expiresAt = new Date(Date.now() + LINEAGE_LINK_DAYS * 86400_000).toISOString()

  const { error } = await db.from('lineage_share_invites').insert({
    token,
    root_node_id: ben.lineage_node_id,
    beneficiary_id: ben.id,
    mode: 'order',
    expires_at: expiresAt,
    recipient_name: recipientName,
    recipient_email: email,
    created_by: opts.userId ?? null,
  })
  if (error) return { ok: false, error: error.message, status: 500 }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
  const link = `${base}/lineage-review/${token}`

  const mail = lineageOrderFixEmail({ recipientName, link })
  try {
    // מחלקת איגוד הצאצאים: התשובות צריכות להגיע לתיבה שמטפלת ביוחסין.
    await deliverMail(email, mail.subject, mail.html, [], { ...mailFor('igud'), transactional: true })
  } catch (e) {
    // ההזמנה כבר נוצרה — מחזירים את הקישור כדי שאפשר יהיה לשלוח ידנית.
    return { ok: true, link, sentTo: email, mailError: e instanceof Error ? e.message : String(e) }
  }

  await db.from('beneficiaries').update({ lineage_link_sent_at: new Date().toISOString() }).eq('id', ben.id)
  await logActivity(db, {
    userId: opts.userId ?? null, action: 'lineage_order_link_sent',
    entityType: 'beneficiary', entityId: ben.id,
    details: { email, rootNodeId: ben.lineage_node_id, ...(opts.auto ? { auto: true } : {}) },
  })
  return { ok: true, link, sentTo: email }
}

export async function loadBenForLink(db: SupabaseClient, id: string): Promise<BenRow | null> {
  const { data } = await db.from('beneficiaries').select(BEN_COLUMNS).eq('id', id).maybeSingle()
  return (data as BenRow | null) ?? null
}

/**
 * שליחה אוטומטית אחרי רישום, שיוך או עריכה: מי שנכנס לבדיקה מעמיקה כי סדר
 * הדורות לא תואם את הקובץ מקבל מיד קישור לתיקון. best-effort — לא זורק לעולם.
 */
export async function autoSendLineageFixLink(db: SupabaseClient, beneficiaryId: string | null | undefined, userId?: string | null): Promise<boolean> {
  if (!beneficiaryId) return false
  try {
    const ben = await loadBenForLink(db, beneficiaryId)
    if (!ben || autoSendSkipReason(ben)) return false
    const res = await sendLineageFixLink(db, ben, { userId, auto: true })
    if (!res.ok || res.mailError) {
      console.error('[lineage-inquiry] שליחה אוטומטית נכשלה:', beneficiaryId, res.ok ? res.mailError : res.error)
      return false
    }
    return true
  } catch (e) {
    console.error('[lineage-inquiry] שליחה אוטומטית נכשלה:', e instanceof Error ? e.message : e)
    return false
  }
}

/** המשפחה השיבה דרך הקישור (תיקון או הערה). best-effort. */
export async function markLineageInquiryReturned(db: SupabaseClient, beneficiaryId: string | null | undefined): Promise<void> {
  if (!beneficiaryId) return
  try {
    await db.from('beneficiaries').update({ lineage_inquiry_returned_at: new Date().toISOString() }).eq('id', beneficiaryId)
  } catch (e) {
    console.error('[lineage-inquiry] סימון "חזר מבירור" נכשל:', e instanceof Error ? e.message : e)
  }
}
