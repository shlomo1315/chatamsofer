import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface EmailPayload {
  to?: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    await resend.emails.send({
      from: payload.from ?? 'היכל החתם סופר <office@chasamsofer.info>',
      to: payload.to ?? '',
      subject: payload.subject,
      html: payload.html,
    })
    return { ok: true }
  } catch (err) {
    console.error('[email] send error:', err)
    return { ok: false, error: String(err) }
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

function baseTemplate(title: string, body: string) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#4f46e5;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">היכל החתם סופר</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f1f5f9;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              מייל זה נשלח אוטומטית ממערכת היכל החתם סופר.<br/>
              לפרטים: <a href="mailto:office@chasamsofer.info" style="color:#6366f1;">office@chasamsofer.info</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function templateStatusApproved(name: string): EmailPayload {
  return {
    subject: 'בקשתך אושרה — היכל החתם סופר',
    html: baseTemplate('בקשתך אושרה', `
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">שלום ${name},</h2>
      <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
        שמחים לבשר לך כי בקשתך <strong>אושרה</strong> במערכת היכל החתם סופר.
      </p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin:20px 0;">
        <p style="margin:0;color:#166534;font-size:14px;font-weight:600;">✅ הסטטוס שלך: מאושר</p>
      </div>
      <p style="margin:16px 0 0;color:#475569;font-size:14px;">לשאלות ופרטים נוספים ניתן לפנות אלינו.</p>
    `),
  }
}

export function templateStatusRejected(name: string, reason?: string): EmailPayload {
  return {
    subject: 'הרישום לאיגוד הצאצאים נדחה — היכל החתם סופר',
    html: baseTemplate('הרישום נדחה', `
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">שלום ${name},</h2>
      <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
        לאחר בחינת בקשתך, הרישום ל<strong>איגוד הצאצאים</strong> של היכל החתם סופר <strong>נדחה</strong>.
      </p>
      ${reason ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 4px;color:#991b1b;font-size:13px;font-weight:700;">סיבת הדחייה:</p>
        <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;">${reason}</p>
      </div>` : ''}
      <p style="margin:16px 0 0;color:#475569;font-size:14px;">לשאלות ופרטים נוספים ניתן לפנות אלינו.</p>
    `),
  }
}

export function templateDocsPending(name: string): EmailPayload {
  return {
    subject: 'נדרשים מסמכים נוספים — היכל החתם סופר',
    html: baseTemplate('השלמת מסמכים', `
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">שלום ${name},</h2>
      <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
        קיבלנו את פנייתך ואנו בוחנים אותה. על מנת להמשיך בתהליך, נדרשים מסמכים נוספים.
      </p>
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:16px;margin:20px 0;">
        <p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">📄 אנא השלם את המסמכים הנדרשים דרך הפורטל האישי שלך.</p>
      </div>
      <p style="margin:16px 0 0;color:#475569;font-size:14px;">לשאלות ופרטים נוספים ניתן לפנות אלינו.</p>
    `),
  }
}

export function templateLoanApproved(name: string, amount: number): EmailPayload {
  return {
    subject: 'בקשת ההלוואה אושרה — היכל החתם סופר',
    html: baseTemplate('בקשת הלוואה אושרה', `
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">שלום ${name},</h2>
      <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
        שמחים לבשר לך כי בקשת ההלוואה שלך על סך <strong>₪${amount.toLocaleString('he-IL')}</strong> אושרה.
      </p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin:20px 0;">
        <p style="margin:0;color:#166534;font-size:14px;font-weight:600;">✅ הלוואה מאושרת — סכום: ₪${amount.toLocaleString('he-IL')}</p>
      </div>
      <p style="margin:16px 0 0;color:#475569;font-size:14px;">נציג יצור איתך קשר בהקדם לתיאום פרטי התשלום.</p>
    `),
  }
}

export function templateWidowRequestApproved(name: string): EmailPayload {
  return {
    subject: 'בקשתך אושרה — אגף אלמנות ויתומים',
    html: baseTemplate('בקשה אושרה', `
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">שלום ${name},</h2>
      <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
        שמחים לבשר לך כי בקשתך באגף אלמנות ויתומים <strong>אושרה</strong>.
      </p>
      <div style="background:#fdf4ff;border:1px solid #d8b4fe;border-radius:10px;padding:16px;margin:20px 0;">
        <p style="margin:0;color:#6b21a8;font-size:14px;font-weight:600;">✅ הבקשה אושרה — נציג יצור איתך קשר בהקדם.</p>
      </div>
      <p style="margin:16px 0 0;color:#475569;font-size:14px;">לשאלות ופרטים נוספים ניתן לפנות אלינו.</p>
    `),
  }
}

export function templateRegistrationConfirmed(name: string): EmailPayload {
  return {
    subject: 'קיבלנו את בקשתך — היכל החתם סופר',
    html: baseTemplate('בקשתך התקבלה', `
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">שלום ${name},</h2>
      <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
        תודה על פנייתך! בקשתך להירשם במערכת היכל החתם סופר <strong>התקבלה בהצלחה</strong> ותועברה לטיפול המשרד.
      </p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;margin:20px 0;">
        <p style="margin:0;color:#1e40af;font-size:14px;font-weight:600;">📋 הבקשה בטיפול — נעדכן אותך בהקדם על המשך התהליך.</p>
      </div>
      <p style="margin:16px 0 0;color:#475569;font-size:14px;">לשאלות ופרטים נוספים ניתן לפנות אלינו בכתובת <a href="mailto:office@chasamsofer.info" style="color:#6366f1;">office@chasamsofer.info</a></p>
    `),
  }
}

export function templateDocsPendingWithNotes(name: string, notes?: string): EmailPayload {
  return {
    subject: 'נדרשים מסמכים נוספים — היכל החתם סופר',
    html: baseTemplate('השלמת מסמכים', `
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">שלום ${name},</h2>
      <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
        קיבלנו את פנייתך ואנו בוחנים אותה. על מנת להמשיך בתהליך, נדרשים מסמכים נוספים.
      </p>
      ${notes ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:16px;margin:20px 0;"><p style="margin:0 0 8px;color:#92400e;font-size:13px;font-weight:700;">מסמכים / פרטים נדרשים:</p><p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;white-space:pre-wrap;">${notes}</p></div>` : '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:16px;margin:20px 0;"><p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">📄 אנא השלם את המסמכים הנדרשים דרך הפורטל האישי שלך.</p></div>'}
      <p style="margin:16px 0 0;color:#475569;font-size:14px;">לשאלות ופרטים נוספים ניתן לפנות אלינו.</p>
    `),
  }
}
