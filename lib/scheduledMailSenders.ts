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

interface BenRow {
  family_name?: string | null
  full_name?: string | null     // שם הבעל
  spouse_name?: string | null   // שם האשה
  city?: string | null
  email?: string | null
}

export async function sendScheduled(db: SupabaseClient, job: ScheduledJob): Promise<SendOutcome> {
  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, status, birth_type, recovery_home, recovery_arrived, beneficiary:beneficiaries(family_name, full_name, spouse_name, city, email)')
    .eq('id', job.entity_id)
    .maybeSingle()

  if (!aid) return { outcome: 'cancelled', reason: 'הרשומה נמחקה' }
  if (aid.status !== 'active') return { outcome: 'cancelled', reason: 'הלידה אינה מאושרת' }

  const ben = (Array.isArray(aid.beneficiary) ? aid.beneficiary[0] : aid.beneficiary) as BenRow | null
  const familyName = ben?.family_name ?? null
  const motherName = ben?.spouse_name ?? null

  // ── מכתב ברכה לנדיב (בקשה או תזכורת) ──
  if (job.kind === 'gratitude_letter' || job.kind === 'gratitude_reminder') {
    if ((aid.birth_type ?? 'live') === 'silent') {
      return { outcome: 'cancelled', reason: 'לידה שקטה' }
    }

    const isReminder = job.kind === 'gratitude_reminder'

    // ⚠️ הבדיקה הקריטית: אם כבר התקבל מכתב — מכל מסלול (טופס, מייל, סריקה) —
    // אין לשלוח תזכורת. הבדיקה נעשית כאן, ברגע השליחה, ולא בזמן התזמון —
    // כי בין התזמון לשליחה היולדת אולי כבר שלחה.
    const { data: existingLetter } = await db
      .from('gratitude_letters')
      .select('id')
      .eq('maternity_aid_id', aid.id)
      .maybeSingle()

    if (existingLetter) {
      return { outcome: 'cancelled', reason: 'המכתב כבר התקבל' }
    }

    // טוקן ארוך לקישור בדפדפן; מזהה קצר לכתובת המענה (כתובת ארוכה נדחית ע"י Resend)
    const token = signPublicToken('g', String(aid.id))
    const replyToken = await getOrCreateReplyToken(db, 'g', String(aid.id))

    const mail = gratitudeRequestEmail({
      familyName,
      motherName,
      formUrl: `${SITE}/gratitude/${token}`,
      isReminder,
    })
    // שובר להדפסה — שורות ריקות לכתיבה ביד, אבל החתימה כבר מודפסת
    // (המשפחה לא צריכה לכתוב את שמה — הוא רשום אצלנו)
    const blankVoucher = await buildGratitudeVoucher({
      mode: 'blank',
      familyName: ben?.family_name ?? undefined,
      husbandName: ben?.full_name ?? undefined,
      wifeName: ben?.spouse_name ?? undefined,
      city: ben?.city ?? undefined,
    })

    const res = await deliverMail(job.to_email, mail.subject, mail.html, [blankVoucher], {
      ...mailFor('maternity'),
      // plus-addressing — כך המענה החוזר מזוהה אוטומטית ומשויך ללידה
      ...(replyToken ? { replyTo: `office+g${replyToken}@${REPLY_DOMAIN}` } : {}),
    })

    if (!res.ok) return { outcome: 'failed', reason: res.error }

    // אחרי הבקשה הראשונה — מתזמנים תזכורת ליומיים.
    // התזכורת עצמה בודקת שוב אם המכתב הגיע, ומתבטלת אם כן.
    // (אחרי התזכורת לא שולחים יותר — מספיק פעם אחת.)
    if (!isReminder) {
      try {
        const { scheduleEmail } = await import('./scheduledMail')
        const { addDays } = await import('./jewishCalendar')
        await scheduleEmail({
          kind: 'gratitude_reminder',
          entityTable: 'maternity_aids',
          entityId: String(aid.id),
          toEmail: job.to_email,
          sendAfter: addDays(new Date(), 2),
        })
      } catch (e) {
        console.error('[gratitude] תזמון התזכורת נכשל:', e)
      }
    }

    return { outcome: 'sent' }
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

    const replyAddress = replyToken
      ? `office+s${replyToken}@${REPLY_DOMAIN}`
      : `office@${REPLY_DOMAIN}`

    const mail = recoveryFeedbackEmail({
      familyName,
      motherName,
      recoveryHome: aid.recovery_home ?? (job.payload?.recovery_home as string | undefined) ?? null,
      formUrl: `${SITE}/feedback/${token}`,
      replyTo: replyAddress,
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
