import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { shell, greetByStatus } from './emailTemplates'
import { getOrCreateReplyToken } from './publicToken'
import { signPublicToken } from './publicToken'

// ─────────────────────────────────────────────────────────────────────────────
// בירור מול היולדת — התכתבות דו-כיוונית, מקבילה לבירור ההלוואות.
//
//   מזכיר כותב → מייל ליולדת → ההודעה נרשמת בתיק
//   יולדת משיבה → נקלטת בשרשור → סימון "התקבלה תשובה"
//
// 🔴 עד כה לא הייתה דרך לברר מול יולדת שהתיק שלה ממתין לאישור מנהל.
// המזכיר שלח מייל מהתיבה הרגילה, והתשובה נעלמה מהתיק.
//
// זיהוי התשובה: reply-to ייחודי (office+m<token>@) — אותו מנגנון מוכח
// של ההלוואות ומכתבי הברכה.
// ─────────────────────────────────────────────────────────────────────────────

const INBOUND_DOMAIN = 'chasamsofer.info'

/** נושא הבסיס. ההודעה הראשונה נשלחת איתו; הבאות עם "Re:" כדי שיישבו יחד. */
const INQUIRY_SUBJECT = 'הודעה מאגף עזר ליולדות — היכל החתם סופר'

/** הטקסט נכנס ל-HTML של המייל — חייב ניטרול. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface AidRow {
  id: string
  beneficiary_id?: string | null
  beneficiary?: {
    family_name?: string | null
    full_name?: string | null
    spouse_name?: string | null
    marital_status?: string | null
    email?: string | null
  } | null
}

interface PriorMessage {
  direction: string
  message_id?: string | null
  references_chain?: string | null
  created_at?: string | null
}

async function loadPriorMessages(db: SupabaseClient, aidId: string): Promise<PriorMessage[]> {
  const { data } = await db
    .from('maternity_messages')
    .select('direction, message_id, references_chain, created_at')
    .eq('aid_id', aidId)
    .order('created_at', { ascending: true })
  return (data ?? []) as PriorMessage[]
}

/** מה מצורף לבירור מעבר לטקסט. */
export type InquiryExtra = 'none' | 'lineage'

/**
 * שולח הודעת בירור ליולדת.
 *
 * @param extra 'lineage' מוסיף קישור אישי לתיקון סדר הדורות — הסיבה
 *   הנפוצה ביותר לבירור בתיק שממתין לאישור מנהל.
 */
export async function sendMaternityInquiry(
  db: SupabaseClient,
  aidId: string,
  body: string,
  sender: { id: string; name: string },
  extra: InquiryExtra = 'none',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = body.trim()
  if (!text) return { ok: false, error: 'ההודעה ריקה' }

  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, beneficiary_id, beneficiary:beneficiaries(family_name, full_name, spouse_name, marital_status, email)')
    .eq('id', aidId)
    .maybeSingle()

  if (!aid) return { ok: false, error: 'התיק לא נמצא' }

  const a = aid as unknown as AidRow
  const ben = Array.isArray(a.beneficiary) ? a.beneficiary[0] : a.beneficiary
  const email = (ben?.email ?? '').trim()
  if (!email) return { ok: false, error: 'למשפחה אין כתובת מייל רשומה' }

  // reply-to ייחודי — כך שהתשובה תזוהה בוודאות לתיק הזה
  const token = await getOrCreateReplyToken(db, 'm', aidId, 'maternity_aids')
  if (!token) return { ok: false, error: 'הנפקת מזהה המענה נכשלה' }

  // ⚠️ קישור תיקון הדורות נשען על המוטב ולא על התיק: העץ שייך למשפחה.
  let lineageBlock = ''
  if (extra === 'lineage' && a.beneficiary_id) {
    const lineageToken = signPublicToken('s', a.beneficiary_id)
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    const url = `${base}/lineage-review/${lineageToken}`
    lineageBlock = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr><td style="background:#eef2ff;border-right:4px solid #4f46e5;border-radius:0 12px 12px 0;padding:16px 20px;">
          <p style="margin:0 0 10px;color:#3730a3;font-size:15px;font-weight:700;">תיקון סדר הדורות</p>
          <p style="margin:0 0 12px;color:#4338ca;font-size:14px;line-height:1.7;">
            ניתן לעדכן את סדר הדורות בקישור האישי הבא:
          </p>
          <a href="${url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:700;">
            לעדכון סדר הדורות
          </a>
        </td></tr>
      </table>`
  }

  const prior = await loadPriorMessages(db, aidId)
  const isFirst = prior.length === 0

  let subject: string
  let html: string
  const thread: { inReplyTo?: string; references?: string } = {}

  if (isFirst) {
    subject = INQUIRY_SUBJECT
    // ⚠️ עוגן השרשור נשלח כבר בהודעה הראשונה, וגם In-Reply-To ולא
    // References בלבד: לקוחות דואר רבים מקבצים לפי In-Reply-To, ובלעדיו
    // ההודעה השנייה נפתחת כשרשור נפרד.
    thread.references = `<maternity-${aidId}@${INBOUND_DOMAIN}>`
    thread.inReplyTo = thread.references
    const greet = greetByStatus(ben?.family_name, ben?.spouse_name || ben?.full_name, ben?.marital_status)
    html = shell({
      preheader: 'נדרשת השלמת פרטים בבקשת הלידה',
      accent: '#ec4899',
      title: 'בנוגע לבקשת הלידה',
      subtitle: 'אגף עזר ליולדות · היכל החתם סופר',
      body: `
        <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">${greet}</p>
        <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">
          בנוגע לבקשה שהגשתם — להלן ההודעה מהמזכירות:
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr><td style="background:#fdf2f8;border-right:4px solid #ec4899;border-radius:0 12px 12px 0;padding:16px 20px;color:#831843;font-size:15px;line-height:1.8;">
            ${esc(text).replace(/\n/g, '<br/>')}
          </td></tr>
        </table>
        ${lineageBlock}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
          <tr><td style="background:#fef3c7;border-right:4px solid #d97706;border-radius:0 10px 10px 0;padding:12px 16px;color:#78350f;font-size:14px;line-height:1.7;">
            <strong>חשוב:</strong> להשיב <strong>בתשובה למייל הזה</strong> (כפתור "השב") — ולא כמייל חדש,
            כדי שהמערכת תזהה את התשובה ותשייך אותה לבקשה שלכם.
          </td></tr>
        </table>`,
    })
  } else {
    subject = `Re: ${INQUIRY_SUBJECT}`
    const lastWithId = [...prior].reverse().find(m => m.message_id)
    if (lastWithId?.message_id) {
      thread.inReplyTo = lastWithId.message_id
      thread.references = [lastWithId.references_chain, lastWithId.message_id]
        .filter(Boolean).join(' ').trim()
    } else {
      // 🔴 נפילה-לאחור כשאין Message-ID של היולדת.
      //
      // ⚠️ קורה בפועל: Google Workspace עושה dual-delivery והכותרות
      // נאכלות בדרך ל-Resend. בלי inReplyTo לקוח הדואר פותח שרשור *חדש*,
      // והמשפחה רואה שתי שיחות נפרדות על אותה בקשה.
      //
      // ⚠️ המזהה חייב להיות זהה בכל הודעה באותו תיק, אחרת כל תשובה תפתח
      // שרשור משלה — ולכן נגזר מ-aidId בלבד ולא מזמן או מאקראי.
      thread.references = `<maternity-${aidId}@${INBOUND_DOMAIN}>`
      thread.inReplyTo = thread.references
    }
    const extraText = lineageBlock
      ? `<div style="margin-top:16px;">${lineageBlock}</div>`
      : ''
    html = `<div dir="rtl" style="font-family:'Heebo',Arial,sans-serif;font-size:15px;line-height:1.9;color:#0f172a;white-space:pre-wrap;">${esc(text).replace(/\n/g, '<br/>')}</div>${extraText}`
  }

  const sent = await deliverMail(email, subject, html, undefined, {
    ...mailFor('maternity'),
    replyTo: `office+m${token}@${INBOUND_DOMAIN}`,
    skipLog: true,
    // 🔴 לא דרך מאגר Gmail — Gmail מחליף כתובת "מאת" שאינה אליאס מאומת
    // בכתובת החשבון עצמו, והמשפחה מקבלת את הבירור מכתובת טכנית. במייל
    // שכל תכליתו לגרום לה להשיב, זה גם נראה חשוד וגם מפצל את השרשור.
    gmailPriority: 'never',
    ...thread,
  })

  if (!sent.ok) return { ok: false, error: 'שליחת המייל נכשלה' }

  await db.from('maternity_messages').insert({
    aid_id: aidId,
    direction: 'staff',
    body: text,
    sender_id: sender.id,
    sender_name: sender.name,
    is_read: true,   // הודעה שלנו — אין מה לסמן כנקראה
  })

  return { ok: true }
}

/**
 * קליטת תשובת היולדת לשרשור.
 *
 * ⚠️ נקרא מ-webhook המייל הנכנס. מחזיר false כשהתשובה אינה שייכת לתיק
 * יולדת — כדי שהקורא ימשיך לנתיבי הקליטה האחרים.
 */
export async function handleMaternityInquiryReply(
  db: SupabaseClient,
  aidId: string,
  body: string,
  meta?: { messageId?: string | null; references?: string | null; senderName?: string | null },
): Promise<boolean> {
  const text = (body ?? '').trim()
  if (!text) return false

  const { error } = await db.from('maternity_messages').insert({
    aid_id: aidId,
    direction: 'applicant',
    body: text,
    sender_name: meta?.senderName ?? null,
    message_id: meta?.messageId ?? null,
    references_chain: meta?.references ?? null,
    is_read: false,   // ⚠️ false — זה מה שמדליק את חיווי "התקבלה תשובה"
  })

  return !error
}
