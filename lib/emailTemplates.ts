// ─────────────────────────────────────────────────────────────────────────────
// תבניות מייל מעוצבות — inline styles לתאימות מרבית עם תוכנות מייל
// ─────────────────────────────────────────────────────────────────────────────

export interface BuiltEmail {
  subject: string
  html: string
}

const OFFICE_EMAIL  = 'office@chasamsofer.info'
const PORTAL_BASE_DEFAULT =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il'
const LOGO_URL = `${PORTAL_BASE_DEFAULT.replace(/\/$/, '')}/logo.jpg`

// ─── הערת מענה אוטומטי (בראש המייל) ─────────────────────────────────────────
function autoReplyNote(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr><td style="background:#f1f5f9;border-radius:10px;padding:11px 16px;text-align:center;">
      <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;font-family:Arial,sans-serif;">
        📩 הודעה זו נשלחה <strong>באופן אוטומטי</strong> ממערכת היכל החתם סופר בעקבות פנייתך.
      </p>
    </td></tr>
  </table>`
}

// ─── כפתור בודד (רוחב מלא) ───────────────────────────────────────────────────
function btn(href: string, label: string, bg: string, textColor = '#ffffff'): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;width:100%;">
    <tr><td align="center" style="border-radius:14px;background:${bg};">
      <a href="${href}" target="_blank"
         style="display:block;padding:15px 24px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:${textColor};text-decoration:none;border-radius:14px;text-align:center;">
        ${label}
      </a>
    </td></tr>
  </table>`
}

// ─── זוג כפתורים סימטריים זה לצד זה ─────────────────────────────────────────
function btnPair(
  href1: string, label1: string, bg1: string, text1: string,
  href2: string, label2: string, bg2: string, text2: string,
): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td width="48%" style="padding-left:6px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr><td align="center" style="border-radius:14px;background:${bg1};">
            <a href="${href1}" target="_blank"
               style="display:block;padding:14px 12px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:${text1};text-decoration:none;border-radius:14px;text-align:center;">
              ${label1}
            </a>
          </td></tr>
        </table>
      </td>
      <td width="4%"></td>
      <td width="48%" style="padding-right:6px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr><td align="center" style="border-radius:14px;background:${bg2};">
            <a href="${href2}" target="_blank"
               style="display:block;padding:14px 12px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:${text2};text-decoration:none;border-radius:14px;text-align:center;">
              ${label2}
            </a>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>`
}

function detailRow(label: string, value?: string | null): string {
  if (!value) return ''
  return `<tr>
    <td style="padding:10px 16px;color:#64748b;font-size:13px;width:38%;border-bottom:1px solid #f1f5f9;font-weight:500;">${label}</td>
    <td style="padding:10px 16px;color:#0f172a;font-size:14px;font-weight:700;border-bottom:1px solid #f1f5f9;">${value}</td>
  </tr>`
}

// ─── מעטפת ───────────────────────────────────────────────────────────────────
function shell(opts: {
  preheader?: string
  accent: string      // hex colour for top bar + buttons
  title: string
  subtitle: string
  body: string
}): string {
  const { preheader = '', accent, title, subtitle, body } = opts
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,'Segoe UI',sans-serif;direction:rtl;">
  <span style="display:none;font-size:1px;color:#eef2f7;max-height:0;overflow:hidden;">${preheader}</span>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:36px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0"
             style="max-width:620px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(15,23,42,0.10);">

        <!-- Accent top bar -->
        <tr><td style="background:${accent};height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Header: logo + title -->
        <tr>
          <td style="padding:40px 40px 32px;text-align:center;background:#ffffff;">
            <img src="${LOGO_URL}" alt="היכל החתם סופר" width="80" height="80"
                 style="border-radius:16px;display:inline-block;margin-bottom:20px;border:3px solid ${accent}22;box-shadow:0 2px 12px rgba(0,0,0,0.10);"/>
            <h1 style="margin:0 0 8px;color:#0f172a;font-size:26px;font-weight:900;letter-spacing:-0.5px;">${title}</h1>
            <p style="margin:0;color:#64748b;font-size:15px;">${subtitle}</p>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;"><div style="border-top:1px solid #f1f5f9;"></div></td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px 32px;">${body}</td></tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:2px solid ${accent}22;">
            <img src="${LOGO_URL}" alt="לוגו" width="36" height="36"
                 style="border-radius:8px;display:inline-block;margin-bottom:10px;opacity:0.7;"/>
            <p style="margin:0 0 4px;color:#334155;font-size:13px;font-weight:700;">היכל החתם סופר</p>
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.7;">
              מייל זה נשלח אוטומטית ממערכת היכל החתם סופר.<br/>
              לפרטים ויצירת קשר: <a href="mailto:${OFFICE_EMAIL}" style="color:${accent};text-decoration:none;font-weight:600;">${OFFICE_EMAIL}</a>
            </p>
          </td>
        </tr>

      </table>
      <p style="margin:16px 0 0;color:#cbd5e1;font-size:11px;">© ${new Date().getFullYear()} היכל החתם סופר — כל הזכויות שמורות</p>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── עזרים ────────────────────────────────────────────────────────────────────
export function requiredDocLabels(maritalStatus?: string | null): string[] {
  if (maritalStatus === 'נשואים') return ['תעודת זהות של הבעל', 'תעודת זהות של האשה']
  return ['תעודת זהות']
}

// ─── אישור רישום ──────────────────────────────────────────────────────────────
export interface ApprovedDetails {
  family_name?: string | null
  id_number?: string | null
  phone?: string | null
  city?: string | null
  marital_status?: string | null
  spouse_name?: string | null
  children_count?: number | null
}

export function approvalEmail(name: string, portalBase = PORTAL_BASE_DEFAULT, details: ApprovedDetails = {}): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  const fullName = [details.family_name, name].filter(Boolean).join(' ') || name
  const detailsRows = [
    detailRow('שם מלא', fullName),
    detailRow('מספר זהות', details.id_number),
    detailRow('בן/בת זוג', details.spouse_name),
    detailRow('מצב משפחתי', details.marital_status),
    detailRow('טלפון', details.phone),
    detailRow('עיר', details.city),
    detailRow('מספר ילדים', details.children_count != null ? String(details.children_count) : ''),
  ].join('')

  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">בשורה טובה!</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">שלום ${name}, בקשתך אושרה 🎉</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">
      אנו שמחים לבשר לך כי בקשתך ב<strong>היכל החתם סופר</strong> אושרה.
      מעתה ניתן להגיש בקשות ישירות דרך הפורטל האישי שלך.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#f0fdf4;border-right:4px solid #22c55e;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#15803d;font-size:15px;font-weight:800;">✅ הסטטוס שלך: <span style="color:#16a34a;">מאושר</span></p>
      </td></tr>
    </table>

    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">פרטי הצאצא שלך:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin:0 0 28px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      ${detailsRows}
    </table>

    <p style="margin:0 0 18px;color:#334155;font-size:15px;font-weight:700;text-align:center;">מה תרצה/י לעשות עכשיו?</p>

    ${btnPair(
      `${base}/?action=birth`, '👶  בקשת לידה', '#fce7f3', '#9d174d',
      `${base}/?action=loan`,  '💳  בקשת הלוואה', '#e0e7ff', '#3730a3',
    )}
    <div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>
    ${btn(`${base}/`, '🏠  כניסה לפורטל האישי', '#0f172a')}

    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.7;text-align:center;">
      להגשת בקשה תתבקש/י להזין את מספר תעודת הזהות שלך לאימות.
    </p>
  `
  return {
    subject: '✅ בקשתך אושרה — היכל החתם סופר',
    html: shell({ preheader: 'בקשתך אושרה! ניתן כעת להגיש בקשות.', accent: '#22c55e', title: 'הבקשה אושרה בהצלחה', subtitle: 'ברוכים הבאים להיכל החתם סופר', body }),
  }
}

// ─── מענה אוטומטי לצאצא קיים ──────────────────────────────────────────────────
const STATUS_LABELS_HE: Record<string, string> = {
  pending: 'ממתין לאישור', review: 'ממתין לאישור מסמכים', approved: 'מאושר',
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

  const statusColor = isApproved ? '#22c55e' : '#f59e0b'
  const statusBg    = isApproved ? '#f0fdf4' : '#fffbeb'
  const statusBorder = isApproved ? '#22c55e' : '#f59e0b'

  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">קיבלנו את פנייתך</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">שלום ${b.name},</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">
      תודה שפנית אלינו. ריכזנו עבורך את הפרטים הרשומים במערכת:
    </p>

    <!-- Details card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;margin:0 0 24px;overflow:hidden;">
      ${detailRow('שם', b.name)}
      <tr>
        <td style="padding:10px 16px;color:#64748b;font-size:13px;width:38%;border-bottom:1px solid #f1f5f9;font-weight:500;">סטטוס</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;background:${statusBg};color:${statusColor};border:1px solid ${statusBorder}33;
                       font-size:12px;font-weight:800;padding:3px 10px;border-radius:20px;">${statusHe}</span>
        </td>
      </tr>
      ${detailRow('תעודת זהות', b.id_number)}
      ${detailRow('טלפון', b.phone)}
      ${detailRow('עיר', b.city)}
      ${detailRow('מצב משפחתי', b.marital_status)}
      ${b.children_count != null ? detailRow('מספר ילדים', String(b.children_count)) : ''}
    </table>

    <p style="margin:0 0 18px;color:#334155;font-size:15px;font-weight:700;text-align:center;">
      ${isApproved ? 'ניתן להגיש בקשה ישירות דרך הפורטל:' : 'לטיפול בבקשתך:'}
    </p>

    ${btnPair(
      `${base}/?action=birth`, '👶  בקשת לידה', '#fce7f3', '#9d174d',
      `${base}/?action=loan`,  '💳  בקשת הלוואה', '#e0e7ff', '#3730a3',
    )}

    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.7;text-align:center;">
      להגשת בקשה תתבקש/י להזין את מספר תעודת הזהות לאימות.<br/>
      אם נדרש טיפול אישי — נחזור אליך בהקדם.
    </p>
  `
  return {
    subject: 'קיבלנו את פנייתך — היכל החתם סופר',
    html: shell({ preheader: 'קיבלנו את פנייתך. הנה הפרטים שלך.', accent: '#4f46e5', title: 'קיבלנו את פנייתך', subtitle: 'היכל החתם סופר — משרד ראשי', body }),
  }
}

// ─── הזמנה להרשמה / מייל לא מזוהה ───────────────────────────────────────────
export function registrationInviteEmail(portalBase = PORTAL_BASE_DEFAULT): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">קיבלנו את פנייתך</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">שלום וברכה,</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">
      תודה על פנייתך ל<strong>היכל החתם סופר</strong>.<br/>
      חיפשנו את כתובת המייל שממנה פנית — ולא מצאנו אותה רשומה במערכת שלנו.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#fefce8;border-right:4px solid #eab308;border-radius:0 12px 12px 0;padding:18px 20px;">
        <p style="margin:0 0 8px;color:#854d0e;font-size:14px;font-weight:800;">💡 אם אתה/את כבר רשום/ה אצלנו:</p>
        <p style="margin:0;color:#713f12;font-size:13px;line-height:1.7;">
          ייתכן שכתובת המייל שלך במערכת שונה מהכתובת שממנה שלחת הודעה זו.<br/>
          ניתן להיכנס לפורטל ולהזין את מספר תעודת הזהות — אם אתה/את רשום/ה, הכניסה תצליח מיד.
        </p>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#eef2ff;border-right:4px solid #6366f1;border-radius:0 12px 12px 0;padding:18px 20px;">
        <p style="margin:0 0 6px;color:#3730a3;font-size:14px;font-weight:800;">📋 אם עדיין לא נרשמת:</p>
        <p style="margin:0;color:#4338ca;font-size:13px;line-height:1.6;">
          ההרשמה פשוטה ומהירה — מזינים מספר תעודת זהות ומספר פרטים.<br/>
          לאחר אישור הזכאות תוכל/י להגיש בקשות ישירות דרך הפורטל.
        </p>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr><td align="center">
        ${btn(`${base}/`, 'כניסה לפורטל', '#4f46e5')}
      </td></tr>
    </table>

    <p style="margin:28px 0 0;color:#94a3b8;font-size:13px;line-height:1.7;text-align:center;">
      בלחיצה תגיע לפורטל — הזן/י תעודת זהות לכניסה, או מלא/י פרטים להרשמה חדשה.
    </p>
  `
  return {
    subject: 'קיבלנו את פנייתך — היכל החתם סופר',
    html: shell({ preheader: 'כתובת המייל שלך לא נמצאה — כנס לפורטל לבדיקה.', accent: '#6366f1', title: 'קיבלנו את פנייתך', subtitle: 'היכל החתם סופר', body }),
  }
}

// ─── השלמת מסמכים ─────────────────────────────────────────────────────────────
export function docsPendingEmail(
  name: string,
  portalBase = PORTAL_BASE_DEFAULT,
  maritalStatus?: string | null,
  explicitDocs?: string[],
  extraNote?: string,
): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  const docs = (explicitDocs && explicitDocs.length) ? explicitDocs : requiredDocLabels(maritalStatus)
  const docsList = docs.map(d =>
    `<li style="margin:0 0 8px;color:#92400e;font-size:14px;font-weight:700;">${d}</li>`
  ).join('')

  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">פעולה נדרשת</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">שלום ${name},</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">
      כדי להמשיך בטיפול בבקשתך, עליך <strong>להשלים את המסמכים הבאים</strong>.
      ניתן להעלות אותם ישירות דרך הפורטל — מהמחשב או מהנייד.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#fffbeb;border-right:4px solid #f59e0b;border-radius:0 12px 12px 0;padding:18px 20px;">
        <p style="margin:0 0 10px;color:#92400e;font-size:14px;font-weight:800;">📄 מסמכים נדרשים:</p>
        <ul style="margin:0;padding-right:20px;">${docsList}</ul>
      </td></tr>
    </table>
    ${extraNote && extraNote.trim() ? `<p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.7;background:#f8fafc;border-radius:10px;padding:14px 18px;">${extraNote}</p>` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        ${btn(`${base}/?action=docs`, '📤  להעלאת המסמכים', '#d97706')}
      </td></tr>
    </table>

    <p style="margin:28px 0 0;color:#94a3b8;font-size:13px;line-height:1.7;text-align:center;">
      בלחיצה על הכפתור תתבקש/י להזין את מספר תעודת הזהות,<br/>
      ואז תועבר/י ישירות למסך העלאת המסמכים.
    </p>
  `
  return {
    subject: '📄 נדרשת השלמת מסמכים — היכל החתם סופר',
    html: shell({ preheader: 'נדרשת השלמת מסמכים להמשך הטיפול.', accent: '#d97706', title: 'נדרשת השלמת מסמכים', subtitle: 'עוד צעד אחד להשלמת התהליך', body }),
  }
}

// ─── אישור קבלת בקשה (לידה / הלוואה) ────────────────────────────────────────
export function requestReceivedEmail(
  name: string,
  type: 'birth' | 'loan',
  firstTime: boolean,
): BuiltEmail {
  const reqLabel = type === 'birth' ? 'בקשת הבראה ליולדת' : 'בקשת הלוואה'
  const accent   = type === 'birth' ? '#db2777' : '#4f46e5'
  const firstTimeNote = firstTime ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#fffbeb;border-right:4px solid #f59e0b;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#92400e;font-size:14px;font-weight:800;">⏳ שים/י לב — טרם אושרת סופית</p>
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.7;">
          הבקשה שלך וצילומי תעודת הזהות שצירפת התקבלו והועברו לבדיקת המזכירות.
          לאחר אישור ראשוני של המשפחה תטופל גם הבקשה עצמה. נעדכן אותך בהמשך.
        </p>
      </td></tr>
    </table>` : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#f0fdf4;border-right:4px solid #22c55e;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#15803d;font-size:14px;font-weight:700;">✅ הבקשה התקבלה והועברה לטיפול המזכירות.</p>
      </td></tr>
    </table>`

  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">אישור קבלה</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">שלום ${name},</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.8;">
      <strong>${reqLabel}</strong> שלך התקבלה במערכת היכל החתם סופר ומועברת לטיפול המזכירות.
    </p>
    ${firstTimeNote}
    <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.7;">תקבל/י עדכון על המשך הטיפול בהמשך.</p>
  `
  return {
    subject: `התקבלה ${reqLabel} — היכל החתם סופר`,
    html: shell({ preheader: `${reqLabel} התקבלה ומועברת לטיפול.`, accent, title: 'הבקשה התקבלה', subtitle: reqLabel, body }),
  }
}
