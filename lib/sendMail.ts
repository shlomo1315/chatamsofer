import { sendEmail } from './email'
import { getGmailClient } from './gmail'
import { buildRawEmail, encodeForGmail } from './buildEmail'

// שליחת מייל דרך Gmail API (מוגדר ועובד), עם נפילה ל-SMTP אם נכשל.
export async function deliverMail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const from     = process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info'
    const fromName = 'היכל החתם סופר משרד ראשי'
    const raw      = buildRawEmail({ from, fromName, to, subject, html })
    const gmail    = await getGmailClient()
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodeForGmail(raw) } })
    return { ok: true }
  } catch (gmailErr) {
    console.error('[mail] Gmail failed, trying SMTP:', gmailErr)
    return sendEmail({ to, subject, html })
  }
}
