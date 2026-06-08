// ─────────────────────────────────────────────────────────────────────────────
// תבניות מייל מעוצבות (HTML) — מודול "טהור" ללא תלויות שרת, כך שניתן לייבא אותו
// גם בקומפוננטות צד-לקוח (למשל StatusControl) וגם בקוד שרת.
// כל העיצוב מוטמע (inline styles) לתאימות מרבית עם תוכנות מייל.
// ─────────────────────────────────────────────────────────────────────────────

export interface BuiltEmail {
  subject: string
  html: string
}

const OFFICE_EMAIL = 'office@chasamsofer.info'

// כפתור "חסין" לתוכנות מייל — מבוסס טבלה עם עיצוב מוטמע.
function emailButton(href: string, label: string, bg: string, emoji = ''): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr>
      <td align="center" style="border-radius:12px;background:${bg};box-shadow:0 4px 10px rgba(0,0,0,0.12);">
        <a href="${href}" target="_blank"
           style="display:inline-block;padding:15px 30px;font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">
          ${emoji ? `${emoji}&nbsp;&nbsp;` : ''}${label}
        </a>
      </td>
    </tr>
  </table>`
}

// מעטפת בסיסית חגיגית לכל המיילים.
function shell(opts: { preheader?: string; headerBg: string; headerEmoji: string; headerTitle: string; headerSubtitle: string; body: string }): string {
  const { preheader = '', headerBg, headerEmoji, headerTitle, headerSubtitle, body } = opts
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headerTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,'Segoe UI',sans-serif;direction:rtl;">
  <span style="display:none;font-size:1px;color:#f1f5f9;max-height:0;overflow:hidden;">${preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,0.10);">
        <!-- Header -->
        <tr>
          <td style="background:${headerBg};padding:40px 32px 36px;text-align:center;">
            <div style="font-size:48px;line-height:1;margin-bottom:10px;">${headerEmoji}</div>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.3px;">${headerTitle}</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${headerSubtitle}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 36px 28px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:22px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0 0 4px;color:#475569;font-size:13px;font-weight:700;">היכל החתם סופר</p>
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              מייל זה נשלח אוטומטית ממערכת היכל החתם סופר.<br/>
              לשאלות ופרטים: <a href="mailto:${OFFICE_EMAIL}" style="color:#6366f1;text-decoration:none;">${OFFICE_EMAIL}</a>
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 0;color:#cbd5e1;font-size:11px;">© ${new Date().getFullYear()} היכל החתם סופר</p>
    </td></tr>
  </table>
</body>
</html>`
}

// אילו מסמכים נדרשים לפי מצב משפחתי — תואם ללוגיקת הפורטל.
export function requiredDocLabels(maritalStatus?: string | null): string[] {
  const ms = maritalStatus ?? ''
  if (ms === 'נשואים') return ['תעודת זהות של הבעל', 'תעודת זהות של האשה']
  return ['תעודת זהות']
}

// ─── מייל אישור רישום (חגיגי) ──────────────────────────────────────────────────
export function approvalEmail(name: string, portalBase: string): BuiltEmail {
  const cleanBase = portalBase.replace(/\/$/, '')
  const body = `
    <h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;font-weight:800;">שלום ${name}, מזל טוב! 🎉</h2>
    <p style="margin:0 0 14px;color:#475569;font-size:15px;line-height:1.7;">
      אנו שמחים לבשר לך כי הרישום שלך במערכת <strong>היכל החתם סופר</strong> הושלם
      <strong style="color:#16a34a;">בהצלחה ואושר</strong>. מעתה הינך זכאי/ת להגיש בקשות דרך הפורטל האישי.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">
      <tr><td style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px 18px;">
        <p style="margin:0;color:#166534;font-size:15px;font-weight:700;">✅ הסטטוס שלך: מאושר</p>
      </td></tr>
    </table>

    <p style="margin:24px 0 18px;color:#334155;font-size:15px;font-weight:700;text-align:center;">
      מה תרצה/י לעשות?
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:14px;">
        ${emailButton(`${cleanBase}/?action=birth`, 'הגשת בקשה ללידה', '#ec4899', '👶')}
      </td></tr>
      <tr><td align="center">
        ${emailButton(`${cleanBase}/?action=loan`, 'הגשת בקשת הלוואה', '#4f46e5', '💳')}
      </td></tr>
    </table>

    <p style="margin:26px 0 0;color:#94a3b8;font-size:13px;line-height:1.6;text-align:center;">
      להגשת בקשה תתבקש/י להזין את מספר תעודת הזהות שלך לאימות.
    </p>
  `
  return {
    subject: '🎉 הרישום אושר בהצלחה — היכל החתם סופר',
    html: shell({
      preheader: 'הרישום שלך אושר בהצלחה! ניתן כעת להגיש בקשות דרך הפורטל.',
      headerBg: 'linear-gradient(135deg,#16a34a 0%,#15803d 100%)',
      headerEmoji: '🎉',
      headerTitle: 'הרישום אושר בהצלחה',
      headerSubtitle: 'ברוכים הבאים להיכל החתם סופר',
      body,
    }),
  }
}

// ─── מענה אוטומטי לנתמך קיים שכתב למשרד ─────────────────────────────────────────
const STATUS_LABELS_HE: Record<string, string> = {
  pending: 'ממתין לאישור', review: 'בבדיקה', approved: 'מאושר',
  rejected: 'לא מאושר', docs_pending: 'השלמת מסמכים',
}

export interface ContactBeneficiary {
  name: string
  eligibility_status?: string | null
  id_number?: string | null
  phone?: string | null
  city?: string | null
  marital_status?: string | null
  children_count?: number | null
}

export function existingContactEmail(b: ContactBeneficiary, portalBase: string): BuiltEmail {
  const cleanBase = portalBase.replace(/\/$/, '')
  const statusHe = STATUS_LABELS_HE[b.eligibility_status ?? ''] ?? (b.eligibility_status ?? '—')
  const isApproved = b.eligibility_status === 'approved'

  const detailRow = (label: string, value?: string | null) =>
    value
      ? `<tr>
           <td style="padding:7px 0;color:#64748b;font-size:13px;width:42%;">${label}</td>
           <td style="padding:7px 0;color:#0f172a;font-size:14px;font-weight:600;">${value}</td>
         </tr>`
      : ''

  const body = `
    <h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;font-weight:800;">שלום ${b.name},</h2>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.7;">
      קיבלנו את פנייתך למשרד היכל החתם סופר, ונשמח לסייע. ריכזנו עבורך את הפרטים הרשומים אצלנו:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:6px 18px;margin:0 0 22px;">
      ${detailRow('שם', b.name)}
      ${detailRow('סטטוס', statusHe)}
      ${detailRow('תעודת זהות', b.id_number)}
      ${detailRow('טלפון', b.phone)}
      ${detailRow('עיר', b.city)}
      ${detailRow('מצב משפחתי', b.marital_status)}
      ${b.children_count != null ? detailRow('מספר ילדים', String(b.children_count)) : ''}
    </table>

    <p style="margin:0 0 16px;color:#334155;font-size:15px;font-weight:700;text-align:center;">
      ${isApproved ? 'ניתן להגיש בקשה ישירות דרך הפורטל:' : 'להגשת בקשת תמיכה דרך הפורטל:'}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:14px;">
        ${emailButton(`${cleanBase}/?action=birth`, 'בקשת תמיכה ללידה', '#ec4899', '👶')}
      </td></tr>
      <tr><td align="center">
        ${emailButton(`${cleanBase}/?action=loan`, 'בקשת הלוואה', '#4f46e5', '💳')}
      </td></tr>
    </table>

    <p style="margin:26px 0 0;color:#94a3b8;font-size:13px;line-height:1.6;text-align:center;">
      להגשת בקשה תתבקש/י להזין את מספר תעודת הזהות שלך לאימות.<br/>
      אם נדרש טיפול אישי, נחזור אליך בהקדם.
    </p>
  `
  return {
    subject: 'קיבלנו את פנייתך — היכל החתם סופר',
    html: shell({
      preheader: 'קיבלנו את פנייתך. הנה הפרטים שלך והאפשרויות להגשת בקשה.',
      headerBg: 'linear-gradient(135deg,#4f46e5 0%,#4338ca 100%)',
      headerEmoji: '📬',
      headerTitle: 'קיבלנו את פנייתך',
      headerSubtitle: 'היכל החתם סופר — משרד ראשי',
      body,
    }),
  }
}

// ─── מענה אוטומטי לפונה שאינו רשום — הזמנה להרשמה ───────────────────────────────
export function registrationInviteEmail(portalBase: string): BuiltEmail {
  const cleanBase = portalBase.replace(/\/$/, '')
  const body = `
    <h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;font-weight:800;">שלום וברכה,</h2>
    <p style="margin:0 0 14px;color:#475569;font-size:15px;line-height:1.7;">
      תודה על פנייתך למשרד <strong>היכל החתם סופר</strong>. לא מצאנו אותך רשום/ה במערכת שלנו.
      כדי שנוכל לסייע ולטפל בבקשות (תמיכה ללידה, הלוואות ועוד), יש להירשם תחילה — זה לוקח דקה.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">
      <tr><td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:16px 18px;">
        <p style="margin:0;color:#3730a3;font-size:14px;font-weight:600;">📝 ההרשמה פשוטה ומהירה — יש להזין מספר תעודת זהות ולמלא את הפרטים.</p>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr><td align="center">
        ${emailButton(`${cleanBase}/`, 'להרשמה למערכת', '#4f46e5', '✍️')}
      </td></tr>
    </table>

    <p style="margin:26px 0 0;color:#94a3b8;font-size:13px;line-height:1.6;text-align:center;">
      לאחר ההרשמה ואישור הזכאות תוכל/י להגיש בקשות ישירות דרך הפורטל.
    </p>
  `
  return {
    subject: 'הרשמה למערכת — היכל החתם סופר',
    html: shell({
      preheader: 'לא נמצאת רשום/ה במערכת — הזמנה להרשמה מהירה.',
      headerBg: 'linear-gradient(135deg,#6366f1 0%,#4f46e5 100%)',
      headerEmoji: '✍️',
      headerTitle: 'הרשמה למערכת',
      headerSubtitle: 'היכל החתם סופר',
      body,
    }),
  }
}

// ─── מייל השלמת מסמכים ─────────────────────────────────────────────────────────
export function docsPendingEmail(name: string, portalBase: string, maritalStatus?: string | null): BuiltEmail {
  const cleanBase = portalBase.replace(/\/$/, '')
  const docs = requiredDocLabels(maritalStatus)
  const docsList = docs
    .map(d => `<li style="margin:0 0 6px;color:#92400e;font-size:14px;font-weight:600;">${d}</li>`)
    .join('')

  const body = `
    <h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;font-weight:800;">שלום ${name},</h2>
    <p style="margin:0 0 14px;color:#475569;font-size:15px;line-height:1.7;">
      כדי להמשיך בטיפול בבקשתך, עליך <strong>להשלים את המסמכים הבאים</strong>.
      ניתן להעלות אותם ישירות דרך הפורטל בלחיצה אחת — מהמחשב או מהנייד.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">
      <tr><td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px 18px;">
        <p style="margin:0 0 8px;color:#92400e;font-size:14px;font-weight:800;">📄 מסמכים נדרשים:</p>
        <ul style="margin:0;padding-right:20px;">${docsList}</ul>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr><td align="center">
        ${emailButton(`${cleanBase}/?action=docs`, 'להעלאת המסמכים', '#d97706', '📤')}
      </td></tr>
    </table>

    <p style="margin:26px 0 0;color:#94a3b8;font-size:13px;line-height:1.6;text-align:center;">
      בלחיצה על הכפתור תתבקש/י להזין את מספר תעודת הזהות, ומיד לאחר מכן תועבר/י למסך העלאת המסמכים.
    </p>
  `
  return {
    subject: '📄 נדרשת השלמת מסמכים — היכל החתם סופר',
    html: shell({
      preheader: 'נדרשת השלמת מסמכים כדי להמשיך בטיפול בבקשתך.',
      headerBg: 'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)',
      headerEmoji: '📄',
      headerTitle: 'נדרשת השלמת מסמכים',
      headerSubtitle: 'עוד צעד קטן להשלמת התהליך',
      body,
    }),
  }
}
