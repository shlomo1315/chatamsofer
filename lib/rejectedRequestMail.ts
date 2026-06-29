// שליחת מייל "לא ניתן לטפל בבקשה — הרישום לא אושר" כשנדחה מנסה להגיש בקשה.
// סטטוס "צאצא נדחה" הוא פנימי; ההודעה נשלחת רק כשהוא מנסה בפועל להגיש בקשה.
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { requestBlockedRejectedEmail } from './emailTemplates'

export function notifyRejectedRequest(ben: {
  email?: string | null; family_name?: string | null; full_name?: string | null
  marital_status?: string | null; rejection_reason?: string | null
}): void {
  if (!ben?.email) return
  const mail = requestBlockedRejectedEmail({
    family_name: ben.family_name, full_name: ben.full_name,
    marital_status: ben.marital_status, reason: ben.rejection_reason,
  })
  deliverMail(ben.email, mail.subject, mail.html, undefined, mailFor('igud'))
    .catch((e) => console.error('[rejectedRequestMail] failed:', e))
}
