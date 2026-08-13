import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyReplyToken, type PublicTokenKind } from './publicToken'
import { parseScores, stripQuotedReply } from './surveyParse'
import { buildGratitudeVoucher } from './gratitudeVoucher'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { gratitudeReceivedEmail } from './emailTemplates'
import { cancelGratitudeReminder } from './scheduledMail'

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

interface BenRow {
  family_name?: string | null
  full_name?: string | null     // שם הבעל
  spouse_name?: string | null   // שם האשה
  city?: string | null
  email?: string | null
}

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

/**
 * 🔴 זיהוי לפי *נושא* המייל — כשהטוקן לא הגיע.
 *
 * Google Workspace עושה dual-delivery: המייל מגיע ל-Resend דרך
 * copy@in.chasamsofer.info, וכתובת ה-reply-to שלנו (office+s<token>@)
 * נאכלת בדרך. כלומר הטוקן פיזית אינו מגיע אלינו, ולכן משובים שנשלחו
 * במייל פשוט *לא נקלטו* — הפונקציות חזרו false מיד ואיש לא ידע.
 *
 * זו בדיוק אותה תקלה שכבר תוקנה לתשובות בירור הלוואה (ראה
 * findLoanByApplicantEmail ב-lib/loanInquiry.ts), רק שהמסלול הזה
 * לא קיבל את אותה נפילה-לאחור.
 *
 * הנושא נקבע על ידינו בטיוטה (`משוב · <בית החלמה>`), ולכן הוא סימן
 * אמין — בניגוד לגוף המייל שהנמענת עורכת בחופשיות.
 */
export function looksLikeFeedbackReply(subject: string): boolean {
  return /^\s*(re:|תגובה:)?\s*משוב\s*·/i.test(String(subject ?? ''))
}

/** אותו רעיון עבור מכתב ברכה — הנושא נקבע בטיוטה שאנחנו בונים. */
export function looksLikeGratitudeReply(subject: string): boolean {
  return /מכתב\s*ברכה|מכתב\s*תודה/i.test(String(subject ?? ''))
}

/**
 * מאתר את הלידה שאליה שייכת התשובה לפי כתובת השולחת — כשהטוקן אבד.
 *
 * ⚠️ בטוח בכוונה: מחזיר רק אם יש *בדיוק התאמה אחת* רלוונטית. אם יש
 * לאותה משפחה כמה לידות פתוחות, אין דרך לדעת לאיזו המשוב שייך —
 * ושיוך שגוי גרוע מאי-קליטה, כי הוא נראה תקין ואיש לא בודק אותו.
 *
 * `table` — הטבלה שאליה נקלטת התשובה, כדי לדלג על לידות שכבר ענו עליהן.
 */
export async function findAidBySenderEmail(
  db: SupabaseClient,
  email: string,
  table: 'survey_responses' | 'gratitude_letters',
): Promise<{ aidId: string; beneficiaryId: string; recoveryHome: string | null } | null> {
  const clean = String(email ?? '').trim().toLowerCase()
  if (!clean) return null

  const { data: bens } = await db
    .from('beneficiaries')
    .select('id')
    .ilike('email', clean)
    .limit(5)
  if (!bens?.length) return null

  const benIds = bens.map(b => b.id)

  // הלידות של המשפחה, מהעדכנית לישנה.
  const { data: aids } = await db
    .from('maternity_aids')
    .select('id, beneficiary_id, recovery_home')
    .in('beneficiary_id', benIds)
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(10)
  if (!aids?.length) return null

  // ⚠️ מדלגים על לידות שכבר נקלטה עבורן תשובה: המשוב החדש שייך כמעט
  // תמיד ללידה האחרונה שטרם נענתה, ולא לזו שכבר יש עליה רשומה.
  const { data: answered } = await db
    .from(table)
    .select('maternity_aid_id')
    .in('maternity_aid_id', aids.map(a => a.id))

  const answeredIds = new Set((answered ?? []).map(r => String(r.maternity_aid_id)))
  const candidate = aids.find(a => !answeredIds.has(String(a.id)))
  if (!candidate) return null

  return {
    aidId: String(candidate.id),
    beneficiaryId: String(candidate.beneficiary_id),
    recoveryHome: (candidate.recovery_home as string | null) ?? null,
  }
}

/**
 * קליטת מכתב ברכה שהגיע במייל. מחזיר true אם טופל.
 * `knownAidId` — שיוך שאותר לפי השולחת כשהטוקן אבד (ראה findAidBySenderEmail).
 */
export async function handleGratitudeReply(
  db: SupabaseClient,
  ctx: InboundCtx,
  knownAidId?: string,
): Promise<boolean> {
  let aidId = knownAidId ?? null

  if (!aidId) {
    const token = extractToken(ctx.recipients, 'g')
    if (!token) return false

    aidId = await verifyReplyToken(db, token, 'g')
    if (!aidId) {
      console.warn('[gratitude] טוקן לא תקין או שפג תוקפו')
      return false
    }
  }

  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, beneficiary_id, beneficiary:beneficiaries(family_name, full_name, spouse_name, city, email)')
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
      is_anonymous: false,
    }, { onConflict: 'maternity_aid_id' })
    void cancelGratitudeReminder(aidId)
    console.log('[gratitude] נקלט שובר סרוק')
    return true
  }

  if (!body) { console.warn(`[gratitude] גוף ריק אחרי חיתוך ציטוט — לא נקלט`); return false }

  // הטקסט שנכתב במייל נשתל בתוך השובר המעוצב
  const voucher = await buildGratitudeVoucher({
    mode: 'filled',
    body,
    familyName: ben?.family_name ?? undefined,
    husbandName: ben?.full_name ?? undefined,
    wifeName: ben?.spouse_name ?? undefined,
    city: ben?.city ?? undefined,
  })

  const { error } = await db.from('gratitude_letters').upsert({
    maternity_aid_id: aidId,
    beneficiary_id: aid.beneficiary_id,
    source: 'email',
    body,
    is_anonymous: false,
  }, { onConflict: 'maternity_aid_id' })
  if (error) { console.error('[gratitude] שמירה נכשלה:', error.message); return false }

  // אישור חוזר ליולדת, עם השובר המלא — לא חוסם
  if (ben?.email) {
    const mail = gratitudeReceivedEmail({ familyName: ben.family_name, motherName: ben.spouse_name })
    void deliverMail(ben.email, mail.subject, mail.html, [voucher], mailFor('maternity'))
  }

  void cancelGratitudeReminder(aidId)
  console.log('[gratitude] נקלט מכתב ברכה מהמייל')
  return true
}

/**
 * קליטת משוב בית החלמה שהגיע במייל (ציונים במספרים). מחזיר true אם טופל.
 *
 * `knownAidId` — שיוך שכבר אותר לפי השולחת (כשהטוקן אבד ב-dual-delivery).
 * כשהוא מועבר, מדלגים על אימות הטוקן שממילא אינו קיים.
 */
export async function handleFeedbackReply(
  db: SupabaseClient,
  ctx: InboundCtx,
  knownAidId?: string,
): Promise<boolean> {
  let aidId = knownAidId ?? null

  if (!aidId) {
    const token = extractToken(ctx.recipients, 's')
    if (!token) return false

    aidId = await verifyReplyToken(db, token, 's')
    if (!aidId) {
      console.warn('[feedback] טוקן לא תקין או שפג תוקפו')
      return false
    }
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
