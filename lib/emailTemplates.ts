// ─────────────────────────────────────────────────────────────────────────────
// תבניות מייל מעוצבות (HTML) — inline styles לתאימות מרבית עם תוכנות מייל.
// ─────────────────────────────────────────────────────────────────────────────

export interface BuiltEmail {
  subject: string
  html: string
}

const OFFICE_EMAIL = 'office@chasamsofer.info'
const PORTAL_BASE_DEFAULT = 'https://chasamsofer.co.il'

// ─── Logo SVG (inline, works in all email clients) ────────────────────────────
const LOGO_SVG = `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <rect width="48" height="48" rx="12" fill="#4f46e5"/>
  <text x="24" y="33" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="800" fill="#ffffff">ח"ס</text>
</svg>`

// כפתור "bullet-proof" תואם לכל תוכנות המייל
function btn(href: string, label: string, bg: string, color = '#ffffff'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr><td align="center" style="border-radius:10px;background:${bg};">
      <a href="${href}" target="_blank"
         style="display:inline-block;padding:13px 28px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:${color};text-decoration:none;border-radius:10px;letter-spacing:-0.2px;">
        ${label}
      </a>
    </td></tr>
  </table>`
}

function detailRow(label: string, value?: string | null): string {
  if (!value) return ''
  return `<tr>
    <td style="padding:8px 12px;color:#64748b;font-size:13px;width:40%;border-bottom:1px solid #f1f5f9;">${label}</td>
    <td style="padding:8px 12px;color:#0f172a;font-size:14px;font-weight:600;border-bottom:1px solid #f1f5f9;">${value}</td>
  </tr>`
}

// ─── מעטפת בסיסית ─────────────────────────────────────────────────────────────
function shell(opts: {
  preheader?: string
  accentColor: string
  title: string
  subtitle: string
  body: string
}): string {
  const { preheader = '', accentColor, title, subtitle, body } = opts
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,'Segoe UI',sans-serif;direction:rtl;">
  <span style="display:none;font-size:1px;color:#f8fafc;max-height:0;overflow:hidden;">${preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:28px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(15,23,42,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,${accentColor} 0%,${accentColor}cc 100%);padding:32px 32px 28px;text-align:center;">
            <div style="margin-bottom:12px;">${LOGO_SVG}</div>
            <h1 style="margin:0 0 4px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${title}</h1>
            <p style="margin:0;color:rgba(255,255,255,0.82);font-size:13px;">${subtitle}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr><td style="padding:32px 36px 24px;">${body}</td></tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0 0 3px;color:#334155;font-size:13px;font-weight:700;">היכל החתם סופר</p>
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              מייל זה נשלח אוטומטית ממערכת היכל החתם סופר.<br/>
              לפרטים: <a href="mailto:${OFFICE_EMAIL}" style="color:#4f46e5;text-decoration:none;">${OFFICE_EMAIL}</a>
            </p>
          </td>
        </tr>

      </table>
      <p style="margin:14px 0 0;color:#cbd5e1;font-size:11px;">© ${new Date().getFullYear()} היכל החתם סופר</p>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── אילו מסמכים נדרשים לפי מצב משפחתי ────────────────────────────────────────
export function requiredDocLabels(maritalStatus?: string | null): string[] {
  if (maritalStatus === 'נשואים') return ['תעודת זהות של הבעל', 'תעודת זהות של האשה']
  return ['תעודת זהות']
}

// ─── מייל אישור רישום ──────────────────────────────────────────────────────────
export function approvalEmail(name: string, portalBase = PORTAL_BASE_DEFAULT): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  const body = `
    <h2 style="margin:0 0 12px;color:#0f172a;font-size:19px;font-weight:800;">שלום ${name}, מזל טוב!</h2>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.7;">
      אנו שמחים לבשר לך כי הרישום שלך ב<strong>היכל החתם סופר</strong> אושר בהצלחה.
      מעתה ניתן להגיש בקשות דרך הפורטל האישי.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;">
        <p style="margin:0;color:#15803d;font-size:14px;font-weight:700;">✅ הסטטוס שלך: מאושר</p>
      </td></tr>
    </table>

    <p style="margin:0 0 14px;color:#334155;font-size:14px;font-weight:700;text-align:center;">להגשת בקשה:</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:10px;">
        ${btn(`${base}/?action=birth`, '👶  בקשת תמיכה ללידה', '#ec4899')}
      </td></tr>
      <tr><td align="center">
        ${btn(`${base}/?action=loan`, '💳  בקשת הלוואה', '#4f46e5')}
      </td></tr>
    </table>

    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;text-align:center;">
      להגשת בקשה תתבקש/י להזין את מספר תעודת הזהות שלך לאימות.
    </p>
  `
  return {
    subject: '✅ הרישום אושר — היכל החתם סופר',
    html: shell({ preheader: 'הרישום שלך אושר! ניתן כעת להגיש בקשות.', accentColor: '#16a34a', title: 'הרישום אושר בהצלחה', subtitle: 'ברוכים הבאים להיכל החתם סופר', body }),
  }
}

// ─── מענה אוטומטי לנתמך קיים ──────────────────────────────────────────────────
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

export function existingContactEmail(b: ContactBeneficiary, portalBase = PORTAL_BASE_DEFAULT): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  const statusHe = STATUS_LABELS_HE[b.eligibility_status ?? ''] ?? (b.eligibility_status ?? '—')
  const isApproved = b.eligibility_status === 'approved'

  const body = `
    <h2 style="margin:0 0 12px;color:#0f172a;font-size:19px;font-weight:800;">שלום ${b.name},</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.7;">
      קיבלנו את פנייתך. הנה הפרטים הרשומים אצלנו:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 22px;overflow:hidden;">
      ${detailRow('שם', b.name)}
      ${detailRow('סטטוס', statusHe)}
      ${detailRow('תעודת זהות', b.id_number)}
      ${detailRow('טלפון', b.phone)}
      ${detailRow('עיר', b.city)}
      ${detailRow('מצב משפחתי', b.marital_status)}
      ${b.children_count != null ? detailRow('מספר ילדים', String(b.children_count)) : ''}
    </table>

    <p style="margin:0 0 14px;color:#334155;font-size:14px;font-weight:700;text-align:center;">
      ${isApproved ? 'להגשת בקשה דרך הפורטל:' : 'לפרטים נוספים ולהגשת בקשות:'}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:10px;">
        ${btn(`${base}/?action=birth`, '👶  בקשת תמיכה ללידה', '#ec4899')}
      </td></tr>
      <tr><td align="center">
        ${btn(`${base}/?action=loan`, '💳  בקשת הלוואה', '#4f46e5')}
      </td></tr>
    </table>

    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;text-align:center;">
      להגשת בקשה תתבקש/י להזין את מספר תעודת הזהות לאימות.<br/>
      אם נדרש טיפול אישי — נחזור אליך בהקדם.
    </p>
  `
  return {
    subject: 'קיבלנו את פנייתך — היכל החתם סופר',
    html: shell({ preheader: 'קיבלנו את פנייתך. הנה הפרטים שלך.', accentColor: '#4f46e5', title: 'קיבלנו את פנייתך', subtitle: 'היכל החתם סופר — משרד ראשי', body }),
  }
}

// ─── הזמנה להרשמה לפונה חדש ───────────────────────────────────────────────────
export function registrationInviteEmail(portalBase = PORTAL_BASE_DEFAULT): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  const body = `
    <h2 style="margin:0 0 12px;color:#0f172a;font-size:19px;font-weight:800;">שלום וברכה,</h2>
    <p style="margin:0 0 14px;color:#475569;font-size:15px;line-height:1.7;">
      תודה על פנייתך ל<strong>היכל החתם סופר</strong>.<br/>
      לא מצאנו אותך עדיין במערכת שלנו — כדי שנוכל לסייע, יש להירשם תחילה. ההרשמה פשוטה ולוקחת דקה.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr><td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 16px;">
        <p style="margin:0;color:#3730a3;font-size:14px;font-weight:600;">
          📝 יש להזין מספר תעודת זהות ולמלא פרטים קצרים — וזהו!
        </p>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr><td align="center">
        ${btn(`${base}/`, '✍️  להרשמה למערכת', '#4f46e5')}
      </td></tr>
    </table>

    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;text-align:center;">
      לאחר ההרשמה ואישור הזכאות תוכל/י להגיש בקשות ישירות דרך הפורטל.
    </p>
  `
  return {
    subject: 'הרשמה למערכת — היכל החתם סופר',
    html: shell({ preheader: 'לא נמצאת רשום/ה — הרשמה פשוטה ומהירה.', accentColor: '#4f46e5', title: 'ברוכים הבאים', subtitle: 'היכל החתם סופר', body }),
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
export function docsPendingEmail(name: string, portalBase = PORTAL_BASE_DEFAULT, maritalStatus?: string | null): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  const docs = requiredDocLabels(maritalStatus)
  const docsList = docs.map(d =>
    `<li style="margin:0 0 6px;color:#92400e;font-size:14px;font-weight:600;">${d}</li>`
  ).join('')

  const body = `
    <h2 style="margin:0 0 12px;color:#0f172a;font-size:19px;font-weight:800;">שלום ${name},</h2>
    <p style="margin:0 0 14px;color:#475569;font-size:15px;line-height:1.7;">
      כדי להמשיך בטיפול בבקשתך, עליך <strong>להשלים את המסמכים הבאים</strong>:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr><td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px 18px;">
        <p style="margin:0 0 8px;color:#92400e;font-size:13px;font-weight:800;">📄 מסמכים נדרשים:</p>
        <ul style="margin:0;padding-right:18px;">${docsList}</ul>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        ${btn(`${base}/?action=docs`, '📤  להעלאת המסמכים', '#d97706')}
      </td></tr>
    </table>

    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;text-align:center;">
      בלחיצה תתבקש/י להזין את מספר תעודת הזהות, ואז תועבר/י ישירות להעלאת המסמכים.
    </p>
  `
  return {
    subject: '📄 נדרשת השלמת מסמכים — היכל החתם סופר',
    html: shell({ preheader: 'נדרשת השלמת מסמכים להמשך הטיפול.', accentColor: '#d97706', title: 'נדרשת השלמת מסמכים', subtitle: 'עוד צעד אחד להשלמת התהליך', body }),
  }
}
