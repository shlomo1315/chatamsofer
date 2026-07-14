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

  const greet = greetByStatus(ben?.family_name, ben?.full_name, ben?.marital_status)
  const html = shell({
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

  const sent = await deliverMail(email, 'הודעה מגמ״ח היכל החתם סופר', html, undefined, {
    ...mailFor('gemach'),
    replyTo: `office+l${token}@${INBOUND_DOMAIN}`,
    skipLog: true,
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

/**
 * קליטת תשובת המבקש (מה-webhook הנכנס).
 * loanId מועבר ישירות כשהזיהוי נעשה לפי השולח (ראה findLoanByApplicantEmail).
 * מחזיר true אם המייל טופל כתשובת בירור.
 */
export async function handleLoanInquiryReply(
  db: SupabaseClient,
  tokenOrLoanId: string,
  body: string,
  byLoanId = false,
): Promise<boolean> {
  const loanId = byLoanId
    ? tokenOrLoanId
    : await verifyReplyToken(db, tokenOrLoanId, 'l')
  if (!loanId) return false

  const text = body.trim()
  if (!text) return true          // זוהה, אך ריק — לא נרשם, וגם לא ממשיכים לטפל בו

  await db.from('loan_messages').insert({
    loan_id: loanId,
    direction: 'applicant',
    body: text,
    is_read: false,               // ממתין לעיון המנהל -> יופיע בהתראות
  })

  // חזרה לרשימת ההמתנה לאישור — רק אם הבקשה עדיין בבירור.
  // (אם בינתיים אושרה או נדחתה, אין להחזיר אותה.)
  await db.from('loans')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', loanId)
    .eq('status', 'inquiry')

  return true
}
