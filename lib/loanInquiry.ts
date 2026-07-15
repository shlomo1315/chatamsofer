import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { shell, greetByStatus } from './emailTemplates'
import { getOrCreateReplyToken, verifyReplyToken } from './publicToken'

// ─────────────────────────────────────────────────────────────────────────────
// בירור בקשת הלוואה — התכתבות דו-כיוונית עם המבקש.
//
//   מנהל כותב  → מייל למבקש  → הבקשה עוברת ל'בתהליך בירור'
//   מבקש משיב  → נקלט בשרשור → הבקשה חוזרת ל'ממתין לאישור'
//
// זיהוי התשובה: reply-to ייחודי (office+l<token>@) — אותו מנגנון שכבר עובד
// במכתבי הברכה. אמין גם כשלמוטב כמה בקשות פתוחות במקביל.
// ─────────────────────────────────────────────────────────────────────────────

const INBOUND_DOMAIN = 'chasamsofer.info'

/** הטקסט נכנס ל-HTML של המייל — חייב ניטרול. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface LoanRow {
  id: string
  amount: number
  beneficiary?: {
    family_name?: string | null
    full_name?: string | null
    marital_status?: string | null
    email?: string | null
  } | null
}

// נושא הבסיס של שרשור הבירור. ההודעה הראשונה נשלחת איתו; הבאות עם "Re:"
// כדי שיישבו באותו שרשור אצל המבקש.
const INQUIRY_SUBJECT = 'הודעה מגמ״ח היכל החתם סופר'

interface PriorMessage {
  direction: string
  message_id?: string | null
  references_chain?: string | null
  created_at?: string | null
}

/**
 * טוען את הודעות השרשור הקודמות. עמיד למצב שבו עמודות השרשור עדיין לא קיימות
 * (המיגרציה 20260715 טרם הורצה) — אז נופל לשליפה בסיסית בלי המטא-דאטה.
 */
async function loadPriorMessages(db: SupabaseClient, loanId: string): Promise<PriorMessage[]> {
  const full = await db
    .from('loan_messages')
    .select('direction, message_id, references_chain, created_at')
    .eq('loan_id', loanId)
    .order('created_at', { ascending: true })
  if (!full.error) return (full.data ?? []) as PriorMessage[]

  const basic = await db
    .from('loan_messages')
    .select('direction, created_at')
    .eq('loan_id', loanId)
    .order('created_at', { ascending: true })
  return (basic.data ?? []) as PriorMessage[]
}

/** שולח הודעת בירור למבקש ומעביר את הבקשה ל'בתהליך בירור'. */
export async function sendLoanInquiry(
  db: SupabaseClient,
  loanId: string,
  body: string,
  sender: { id: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = body.trim()
  if (!text) return { ok: false, error: 'ההודעה ריקה' }

  const { data: loan } = await db
    .from('loans')
    .select('id, amount, beneficiary:beneficiaries(family_name, full_name, marital_status, email)')
    .eq('id', loanId)
    .maybeSingle()

  if (!loan) return { ok: false, error: 'הבקשה לא נמצאה' }

  const l = loan as unknown as LoanRow
  const ben = Array.isArray(l.beneficiary) ? l.beneficiary[0] : l.beneficiary
  const email = (ben?.email ?? '').trim()
  if (!email) return { ok: false, error: 'למבקש אין כתובת מייל רשומה' }

  // reply-to ייחודי — כך שהתשובה תזוהה בוודאות לבקשה הזו
  const token = await getOrCreateReplyToken(db, 'l', loanId, 'loans')
  if (!token) return { ok: false, error: 'הנפקת מזהה המענה נכשלה' }

  // ההודעה הראשונה בשרשור נשלחת מעוצבת; מכאן ואילך — טקסט רגיל בתוך גוף המייל,
  // כתשובה משורשרת להודעה האחרונה של המבקש.
  const prior = await loadPriorMessages(db, loanId)
  const isFirst = prior.length === 0

  let subject: string
  let html: string
  const thread: { inReplyTo?: string; references?: string } = {}

  if (isFirst) {
    subject = INQUIRY_SUBJECT
    const greet = greetByStatus(ben?.family_name, ben?.full_name, ben?.marital_status)
    html = shell({
      preheader: 'נדרשת השלמת פרטים בבקשת ההלוואה',
      accent: '#10b981',
      title: 'בנוגע לבקשת ההלוואה',
      subtitle: 'גמ״ח היכל החתם סופר',
      body: `
        <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">${greet}</p>
        <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">
          בנוגע לבקשת ההלוואה שהגשתם — להלן ההודעה מהמזכירות:
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr><td style="background:#f0fdf4;border-right:4px solid #10b981;border-radius:0 12px 12px 0;padding:16px 20px;color:#065f46;font-size:15px;line-height:1.8;">
            ${esc(text).replace(/\n/g, '<br/>')}
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
          <tr><td style="background:#fef3c7;border-right:4px solid #d97706;border-radius:0 10px 10px 0;padding:12px 16px;color:#78350f;font-size:14px;line-height:1.7;">
            <strong>חשוב:</strong> להשיב <strong>בתשובה למייל הזה</strong> (כפתור "השב") — ולא כמייל חדש,
            כדי שהמערכת תזהה את התשובה ותשייך אותה לבקשה שלכם.
          </td></tr>
        </table>`,
    })
  } else {
    // תשובה משורשרת: מתייחסים לתשובה האחרונה של המבקש שיש לה Message-ID אמיתי
    // (נלכד מכותרות המייל הנכנס). כך ההודעה נכנסת לאותו שרשור אצל המבקש.
    subject = `Re: ${INQUIRY_SUBJECT}`
    const lastWithId = [...prior].reverse().find(m => m.message_id)
    if (lastWithId?.message_id) {
      thread.inReplyTo = lastWithId.message_id
      thread.references = [lastWithId.references_chain, lastWithId.message_id]
        .filter(Boolean).join(' ').trim()
    }
    // טקסט רגיל בגוף המייל — כמו התכתבות ישירה, בלי עיצוב/מסגרת.
    html = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.9;color:#0f172a;white-space:pre-wrap;">${esc(text).replace(/\n/g, '<br/>')}</div>`
  }

  const sent = await deliverMail(email, subject, html, undefined, {
    ...mailFor('gemach'),
    replyTo: `office+l${token}@${INBOUND_DOMAIN}`,
    skipLog: true,
    ...thread,
  })

  if (!sent.ok) return { ok: false, error: 'שליחת המייל נכשלה' }

  // רישום ההודעה בשרשור + מעבר לסטטוס בירור
  await db.from('loan_messages').insert({
    loan_id: loanId,
    direction: 'staff',
    body: text,
    sender_id: sender.id,
    sender_name: sender.name,
    is_read: true,          // הודעה שלנו — אין מה לסמן כנקראה
  })

  await db.from('loans')
    .update({ status: 'inquiry', updated_at: new Date().toISOString() })
    .eq('id', loanId)

  return { ok: true }
}

/**
 * מוצא את הבקשה שאליה שייכת תשובה, לפי כתובת השולח.
 *
 * ⚠️ נדרש כי Google Workspace עושה dual-delivery: הוא מעביר את המייל ל-Resend
 * דרך copy@in.chasamsofer.info ו"אוכל" את הכתובת המקורית. ה-reply-to שלנו
 * (office+l<token>@) פשוט לא מגיע — האבחון הראה candidates: ["copy@in..."]
 * בלבד. לכן אי אפשר להסתמך על הטוקן, וצריך לזהות לפי השולח.
 *
 * בטוח: מחזיר בקשה רק אם יש *בדיוק אחת* בבירור לאותו מבקש. אם יש כמה,
 * אין דרך לדעת לאיזו התשובה שייכת — ועדיף לא לנחש.
 */
export async function findLoanByApplicantEmail(
  db: SupabaseClient,
  email: string,
): Promise<string | null> {
  const clean = String(email ?? '').trim().toLowerCase()
  if (!clean) return null

  const { data: bens } = await db
    .from('beneficiaries')
    .select('id')
    .ilike('email', clean)
    .limit(5)

  if (!bens?.length) return null

  const { data: loans } = await db
    .from('loans')
    .select('id')
    .in('beneficiary_id', bens.map(b => b.id))
    .eq('status', 'inquiry')
    .order('updated_at', { ascending: false })

  if (!loans?.length) return null

  // כמה בקשות בבירור לאותו מבקש — לא ניתן לדעת לאיזו התשובה שייכת.
  // לוקחים את העדכנית ביותר, שהיא זו שהוא כנראה ענה עליה.
  return String(loans[0].id)
}

/** מטא-דאטה לשרשור המייל — נלכדת מכותרות המייל הנכנס. */
export interface InboundThreadMeta {
  messageId?: string   // Message-ID של תשובת המבקש
  references?: string  // שרשרת References/In-Reply-To שהמבקש שלח
}

/**
 * קליטת תשובת המבקש (מה-webhook הנכנס).
 * loanId מועבר ישירות כשהזיהוי נעשה לפי השולח (ראה findLoanByApplicantEmail).
 * meta — מזהי השרשור מכותרות המייל, לשרשור הודעות ההמשך שלנו.
 * מחזיר true אם המייל טופל כתשובת בירור.
 */
export async function handleLoanInquiryReply(
  db: SupabaseClient,
  tokenOrLoanId: string,
  body: string,
  byLoanId = false,
  meta?: InboundThreadMeta,
): Promise<boolean> {
  const loanId = byLoanId
    ? tokenOrLoanId
    : await verifyReplyToken(db, tokenOrLoanId, 'l')
  if (!loanId) return false

  const text = body.trim()
  if (!text) return true          // זוהה, אך ריק — לא נרשם, וגם לא ממשיכים לטפל בו

  // שומרים גם את מזהי השרשור, כדי שהודעות ההמשך שלנו יישלחו כתשובה באותו שרשור.
  const row: Record<string, unknown> = {
    loan_id: loanId,
    direction: 'applicant',
    body: text,
    is_read: false,               // ממתין לעיון המנהל -> יופיע בהתראות
  }
  const messageId = meta?.messageId?.trim()
  const references = meta?.references?.trim()
  if (messageId) row.message_id = messageId
  if (references) row.references_chain = references

  const { error: insErr } = await db.from('loan_messages').insert(row)
  // עמידות: אם עמודות השרשור עדיין לא קיימות (מיגרציה טרם הורצה) — שומרים בלי מטא-דאטה,
  // כדי שהתשובה לא תאבד.
  if (insErr && (messageId || references)) {
    await db.from('loan_messages').insert({
      loan_id: loanId,
      direction: 'applicant',
      body: text,
      is_read: false,
    })
  }

  // ⚠️ הסטטוס נשאר 'inquiry'. בעבר החזרנו אותו ל'pending', וזה מחק את המידע
  // שהבקשה בכלל בבירור — היא נעלמה מהקובייה "בתהליך בירור" ברגע שהמבקש ענה,
  // בדיוק כשהיא הכי דורשת טיפול. במקום זה, ההודעה האחרונה בשרשור היא שקובעת
  // אם ממתינים לו או לנו (ראה תת-הסינון ב-LoansTable).
  await db.from('loans')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', loanId)
    .eq('status', 'inquiry')

  return true
}
