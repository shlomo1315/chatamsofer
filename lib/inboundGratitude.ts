import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyReplyToken, type PublicTokenKind } from './publicToken'
import { parseScores, stripQuotedReply } from './surveyParse'
import { buildGratitudeVoucher } from './gratitudeVoucher'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { gratitudeReceivedEmail } from './emailTemplates'

// ─────────────────────────────────────────────────────────────────────────────
// קליטת מענה שהגיע בגוף מייל חוזר — מכתב ברכה או משוב על בית ההחלמה.
//
// הזיהוי נעשה לפי plus-addressing בכתובת הנמען:
//   office+g<token>@...  → מכתב ברכה
//   office+s<token>@...  → משוב בית החלמה
// הטוקן חתום ב-HMAC, כך שלא ניתן לזייף שיוך ללידה של מישהו אחר.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BODY_CHARS = 1500

export interface InboundAttachment {
  filename: string
  mimeType: string
  url?: string
}

export interface InboundCtx {
  recipients: string[]        // כל כתובות הנמען שנמצאו (envelope + כותרות)
  body: string                // גוף המייל
  attachments?: InboundAttachment[]
}

interface BenRow { family_name?: string | null; spouse_name?: string | null; email?: string | null }

/** מחלץ טוקן מכתובת מהצורה office+g<token>@... */
function extractToken(addresses: string[], kind: PublicTokenKind): string | null {
  const re = new RegExp(`\\+${kind}([A-Za-z0-9_-]{8,})@`, 'i')
  for (const addr of addresses) {
    const m = String(addr ?? '').match(re)
    if (m) return m[1]
  }
  return null
}

/** האם המייל הנכנס מיועד לאחד המסלולים האלה (בדיקה מהירה לפני עיבוד). */
export function isGratitudeOrFeedbackReply(addresses: string[]): boolean {
  return addresses.some(a => /\+[gs][A-Za-z0-9_-]{8,}@/i.test(String(a ?? '')))
}

/** קליטת מכתב ברכה שהגיע במייל. מחזיר true אם טופל. */
export async function handleGratitudeReply(db: SupabaseClient, ctx: InboundCtx): Promise<boolean> {
  const token = extractToken(ctx.recipients, 'g')
  if (!token) return false

  const aidId = await verifyReplyToken(db, token, 'g')
  if (!aidId) {
    console.warn('[gratitude] טוקן לא תקין או שפג תוקפו')
    return false
  }

  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, beneficiary_id, beneficiary:beneficiaries(family_name, spouse_name, email)')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return false

  const ben = (Array.isArray(aid.beneficiary) ? aid.beneficiary[0] : aid.beneficiary) as BenRow | null

  const body = stripQuotedReply(ctx.body).slice(0, MAX_BODY_CHARS)
  const image = ctx.attachments?.find(a => a.mimeType?.startsWith('image/') && a.url)

  // צרופת תמונה = שובר מודפס שצולם ונשלח בחזרה
  if (image) {
    await db.from('gratitude_letters').upsert({
      maternity_aid_id: aidId,
      beneficiary_id: aid.beneficiary_id,
      source: 'scan',
      body: body || null,
      scan_url: image.url,
      is_anonymous: true,
    }, { onConflict: 'maternity_aid_id' })
    console.log('[gratitude] נקלט שובר סרוק')
    return true
  }

  if (!body) return false

  // הטקסט שנכתב במייל נשתל בתוך השובר המעוצב
  const voucher = await buildGratitudeVoucher({ mode: 'filled', body, isAnonymous: true })

  const { error } = await db.from('gratitude_letters').upsert({
    maternity_aid_id: aidId,
    beneficiary_id: aid.beneficiary_id,
    source: 'email',
    body,
    is_anonymous: true,
  }, { onConflict: 'maternity_aid_id' })
  if (error) { console.error('[gratitude] שמירה נכשלה:', error.message); return false }

  // אישור חוזר ליולדת, עם השובר המלא — לא חוסם
  if (ben?.email) {
    const mail = gratitudeReceivedEmail({ familyName: ben.family_name, motherName: ben.spouse_name })
    void deliverMail(ben.email, mail.subject, mail.html, [voucher], mailFor('maternity'))
  }

  console.log('[gratitude] נקלט מכתב ברכה מהמייל')
  return true
}

/** קליטת משוב בית החלמה שהגיע במייל (ציונים במספרים). מחזיר true אם טופל. */
export async function handleFeedbackReply(db: SupabaseClient, ctx: InboundCtx): Promise<boolean> {
  const token = extractToken(ctx.recipients, 's')
  if (!token) return false

  const aidId = await verifyReplyToken(db, token, 's')
  if (!aidId) {
    console.warn('[feedback] טוקן לא תקין או שפג תוקפו')
    return false
  }

  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, beneficiary_id, recovery_home')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return false

  const { data: questions } = await db
    .from('survey_questions')
    .select('id, position, type')
    .eq('survey', 'recovery')
    .eq('is_active', true)
    .order('position')

  const scaleQs = (questions ?? []).filter(q => q.type === 'scale')
  const { scores, freeText } = parseScores(ctx.body, scaleQs.length)

  if (Object.keys(scores).length === 0 && !freeText) {
    console.warn('[feedback] לא נמצאו ציונים ולא טקסט — לא נקלט')
    return false
  }

  // המרה: מספר השאלה במייל → מזהה השאלה ב-DB
  const answers: Record<string, number> = {}
  for (const q of scaleQs) {
    const v = scores[q.position as number]
    if (v !== undefined) answers[q.id as string] = v
  }

  const { error } = await db.from('survey_responses').upsert({
    maternity_aid_id: aidId,
    beneficiary_id: aid.beneficiary_id,
    recovery_home: aid.recovery_home,
    source: 'email',
    answers,
    free_text: freeText || null,
  }, { onConflict: 'maternity_aid_id', ignoreDuplicates: true })
  if (error) { console.error('[feedback] שמירה נכשלה:', error.message); return false }

  console.log(`[feedback] נקלט משוב מהמייל · ${Object.keys(answers).length} ציונים`)
  return true
}
