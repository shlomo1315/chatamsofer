import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { gratitudeRequestEmail, recoveryFeedbackEmail } from './emailTemplates'
import { signPublicToken, getOrCreateReplyToken } from './publicToken'
import { buildGratitudeVoucher } from './gratitudeVoucher'
import type { ScheduledJob } from './scheduledMail'

// ─────────────────────────────────────────────────────────────────────────────
// בניית ושליחת המיילים המתוזמנים.
// לפני כל שליחה נבדק שהישות עדיין רלוונטית — לידה שבוטלה, סימון הגעה שבוטל,
// או לידה שקטה יחזירו 'cancelled' והמייל לא ייצא.
// ─────────────────────────────────────────────────────────────────────────────

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
const REPLY_DOMAIN = 'chasamsofer.info'

export interface SendOutcome {
  outcome: 'sent' | 'cancelled' | 'failed'
  reason?: string
}

interface BenRow { family_name?: string | null; spouse_name?: string | null; email?: string | null }

export async function sendScheduled(db: SupabaseClient, job: ScheduledJob): Promise<SendOutcome> {
  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, status, birth_type, recovery_home, recovery_arrived, beneficiary:beneficiaries(family_name, spouse_name, email)')
    .eq('id', job.entity_id)
    .maybeSingle()

  if (!aid) return { outcome: 'cancelled', reason: 'הרשומה נמחקה' }
  if (aid.status !== 'active') return { outcome: 'cancelled', reason: 'הלידה אינה מאושרת' }

  const ben = (Array.isArray(aid.beneficiary) ? aid.beneficiary[0] : aid.beneficiary) as BenRow | null
  const familyName = ben?.family_name ?? null
  const motherName = ben?.spouse_name ?? null

  // ── מכתב ברכה לנדיב ──
  if (job.kind === 'gratitude_letter') {
    if ((aid.birth_type ?? 'live') === 'silent') {
      return { outcome: 'cancelled', reason: 'לידה שקטה' }
    }

    // טוקן ארוך לקישור בדפדפן; מזהה קצר לכתובת המענה (כתובת ארוכה נדחית ע"י Resend)
    const token = signPublicToken('g', String(aid.id))
    const replyToken = await getOrCreateReplyToken(db, 'g', String(aid.id))

    const mail = gratitudeRequestEmail({
      familyName,
      motherName,
      formUrl: `${SITE}/gratitude/${token}`,
    })
    // שובר ריק להדפסה — למי שמעדיפה לכתוב ביד
    const blankVoucher = await buildGratitudeVoucher({ mode: 'blank' })

    const res = await deliverMail(job.to_email, mail.subject, mail.html, [blankVoucher], {
      ...mailFor('maternity'),
      // plus-addressing — כך המענה החוזר מזוהה אוטומטית ומשויך ללידה
      ...(replyToken ? { replyTo: `office+g${replyToken}@${REPLY_DOMAIN}` } : {}),
    })
    return res.ok ? { outcome: 'sent' } : { outcome: 'failed', reason: res.error }
  }

  // ── משוב על בית ההחלמה ──
  if (job.kind === 'recovery_survey') {
    if (aid.recovery_arrived !== true) {
      return { outcome: 'cancelled', reason: 'סימון ההגעה בוטל' }
    }

    const { data: questions } = await db
      .from('survey_questions')
      .select('position, text, type')
      .eq('survey', 'recovery')
      .eq('is_active', true)
      .order('position')

    const token = signPublicToken('s', String(aid.id))
    const replyToken = await getOrCreateReplyToken(db, 's', String(aid.id))

    const mail = recoveryFeedbackEmail({
      familyName,
      motherName,
      recoveryHome: aid.recovery_home ?? (job.payload?.recovery_home as string | undefined) ?? null,
      formUrl: `${SITE}/feedback/${token}`,
      questions: questions ?? [],
    })

    const res = await deliverMail(job.to_email, mail.subject, mail.html, undefined, {
      ...mailFor('maternity'),
      ...(replyToken ? { replyTo: `office+s${replyToken}@${REPLY_DOMAIN}` } : {}),
    })
    return res.ok ? { outcome: 'sent' } : { outcome: 'failed', reason: res.error }
  }

  return { outcome: 'cancelled', reason: `סוג מייל לא מוכר: ${job.kind}` }
}
