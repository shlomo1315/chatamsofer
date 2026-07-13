// ─────────────────────────────────────────────────────────────────────────────
// תבניות מייל מעוצבות — inline styles לתאימות מרבית עם תוכנות מייל
//
// טקסטים הניתנים לעריכה ממסך ההגדרות ("הודעות מייל") נקראים דרך textFor().
// הפונקציה סינכרונית (המטמון נטען בעליית השרת ומתרענן בכל שמירה), ולכן
// התבניות נשארות סינכרוניות ואין צורך לשנות את כל מקומות הקריאה.
// ─────────────────────────────────────────────────────────────────────────────
import { textFor } from './emailTextsStore'

export interface BuiltEmail {
  subject: string
  html: string
}

const OFFICE_EMAIL  = 'office@chasamsofer.info'
const PORTAL_BASE_DEFAULT =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il'
const LOGO_URL = `${PORTAL_BASE_DEFAULT.replace(/\/$/, '')}/logo.png`

// מנטרל תווי HTML בערכים מבוססי-משתמש לפני שילובם ב-HTML של המייל (מניעת הזרקת HTML)
function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// פתיח מכובד אחיד לכל המיילים: "שלום וברכה, הרב <שם> הי״ו,"
export function greetHe(name?: string | null): string {
  const n = (name ?? '').trim()
  return n ? `שלום וברכה, הרב ${escapeHtml(n)} הי״ו,` : 'שלום וברכה,'
}

// פתיח לפי מצב משפחתי: ברירת מחדל "הרב <משפחה> <שם הבעל> הי״ו".
// באלמנה/גרושה: "הרבנית <משפחה> <שם האשה> תחי׳" (השם נלקח מ-full_name של הרשומה).
export function greetByStatus(
  familyName?: string | null,
  fullName?: string | null,
  maritalStatus?: string | null,
): string {
  const nm = [familyName, fullName].filter(Boolean).join(' ').trim()
  if (!nm) return 'שלום וברכה,'
  const female = maritalStatus === 'אלמנה' || maritalStatus === 'גרושה'
  const safe = escapeHtml(nm)
  return female ? `שלום וברכה, הרבנית ${safe} תחי׳,` : `שלום וברכה, הרב ${safe} הי״ו,`
}

// פתיח למיילי יולדות — הפנייה ליולדת (האשה): "שלום וברכה, מרת <משפחה> <שם האשה> תחי׳,"
export function greetMrs(familyName?: string | null, motherName?: string | null): string {
  const nm = [familyName, motherName].filter(Boolean).join(' ').trim()
  return nm ? `שלום וברכה, מרת ${escapeHtml(nm)} תחי׳,` : 'שלום וברכה,'
}

// ─── הערת מענה אוטומטי (בראש המייל) ─────────────────────────────────────────
function autoReplyNote(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr><td style="background:#f1f5f9;border-radius:10px;padding:11px 16px;text-align:center;">
      <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;font-family:Arial,sans-serif;">
        הודעה זו נשלחה <strong>באופן אוטומטי</strong> ממערכת היכל החתם סופר בעקבות פנייתך.
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
    <td style="padding:10px 16px;color:#0f172a;font-size:14px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(value)}</td>
  </tr>`
}

// ─── מעטפת ───────────────────────────────────────────────────────────────────
export function shell(opts: {
  preheader?: string
  accent: string      // hex colour for top bar + buttons
  title: string
  subtitle: string
  body: string
}): string {
  const { preheader = '', accent, title, subtitle, body } = opts
  // ערכי טקסט מבוססי-משתמש מנוטרלים; body הוא HTML בנוי מראש ולכן אינו מנוטרל
  const safeTitle = escapeHtml(title)
  const safeSubtitle = escapeHtml(subtitle)
  const safePreheader = escapeHtml(preheader)
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&display=swap" rel="stylesheet"/>
  <style>* { font-family: 'Heebo', Arial, sans-serif !important; }</style>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Heebo',Arial,sans-serif;direction:rtl;">
  <span style="display:none;font-size:1px;color:#eef2f7;max-height:0;overflow:hidden;">${safePreheader}</span>

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
                 style="display:inline-block;margin-bottom:20px;"/>
            <h1 style="margin:0 0 8px;color:#0f172a;font-size:26px;font-weight:900;letter-spacing:-0.5px;">${safeTitle}</h1>
            <p style="margin:0;color:#64748b;font-size:15px;">${safeSubtitle}</p>
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

// ─── הודעת "אל תשיבו" מודגשת (לתחתית מיילים אוטומטיים מהאיגוד) ───────────────
function noReplyBox(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
    <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 18px;">
      <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
        מייל זה נשלח <strong>באופן אוטומטי</strong> ואין להשיב אליו —
        הודעות הנשלחות לכתובת זו אינן נקראות.<br/>
        בכל עניין שאינו קשור להגשת בקשות בנושאים הנ"ל, ניתן לפנות למשרד בכתובת <a href="mailto:${OFFICE_EMAIL}" style="color:#b91c1c;font-weight:700;text-decoration:none;">${OFFICE_EMAIL}</a>
      </p>
    </td></tr>
  </table>`
}

// ─── מייל "רשימת הטבות והגשת בקשות" (נשלח מ-igud בלחיצה בפורטל או בפנייה במייל) ─
// כל כפתור מפנה ישירות לטופס ההגשה הספציפי בפורטל (?action=...). הנמען מתחבר
// (סיסמה / קוד טלפוני) ואז הטופס נפתח אוטומטית.
export function benefitsLinkEmail(
  name: string,
  portalBase: string = PORTAL_BASE_DEFAULT,
  details?: [string, string | number | null | undefined][],
  draftLinks?: { label: string; href: string }[],
  maritalStatus?: string | null,
): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  const accent = '#4f46e5'
  const greet = greetHe(name)
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('benefits_link', k)
  const T = (k: string) => escapeHtml(t(k))
  // התאמת הכפתורים לפי סטטוס: לידה — רק נשואים; אלמנות — רק אלמן/אלמנה; הלוואה+סיוע — לכולם.
  const married = maritalStatus === 'נשואים'
  const widower = maritalStatus === 'אלמן' || maritalStatus === 'אלמנה'
  const gap = '<div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>'
  const buttons = [
    married ? btn(`${base}/?action=birth`, t('btn_birth'), '#fce7f3', '#9d174d') : '',
    btn(`${base}/?action=loan`, t('btn_loan'), '#e0f2fe', '#075985'),
    btn(`${base}/?action=aid`, t('btn_aid'), '#dcfce7', '#166534'),
    widower ? btn(`${base}/?action=aid`, t('btn_widow'), '#ede9fe', '#5b21b6') : '',
  ].filter(Boolean).join(gap)
  const draftBlock = (draftLinks && draftLinks.length) ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
      <tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 10px;color:#9a3412;font-size:17px;font-weight:800;">${T('draft_title')}</p>
        <p style="margin:0 0 12px;color:#9a3412;font-size:14px;line-height:1.8;">${T('draft_note')}</p>
        ${draftLinks.map(l => `<a href="${l.href}" style="display:inline-block;margin:0 0 8px;color:#c2410c;font-size:15px;font-weight:700;text-decoration:underline;">${l.label}</a><br/>`).join('')}
      </td></tr>
    </table>` : ''
  const detailsRows = (details ?? []).map(([l, v]) => detailRow(l, v != null && v !== '' ? String(v) : '')).join('')
  const detailsTable = detailsRows ? `
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;font-family:Arial,sans-serif;">${T('details_title')}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${detailsRows}</table>` : ''
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:Arial,sans-serif;">${greet}</p>
    ${detailsTable}
    <p style="margin:0 0 20px;color:#334155;font-size:14px;line-height:1.8;font-family:Arial,sans-serif;">
      ${t('intro')}
    </p>
    ${buttons}
    ${draftBlock}
    ${noReplyBox()}`
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent, title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── הגשת בקשה במייל: אישור קליטה ──────────────────────────────────────────
export function emailIntakeConfirmedEmail(name: string, typeLabel: string): BuiltEmail {
  const greet = greetHe(name)
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:Arial,sans-serif;">${greet}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr><td style="background:#f0fdf4;border-right:4px solid #22c55e;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#15803d;font-size:15px;font-weight:800;">${typeLabel} שלך נקלטה במערכת ומועברת לטיפול המזכירות.</p>
        <p style="margin:6px 0 0;color:#166534;font-size:13px;line-height:1.7;">תקבלו עדכון על המשך הטיפול בהמשך.</p>
      </td></tr>
    </table>
    ${noReplyBox()}`
  return {
    subject: `התקבלה ${typeLabel} — היכל החתם סופר`,
    html: shell({ preheader: `${typeLabel} נקלטה ומועברת לטיפול.`, accent: '#22c55e', title: 'הבקשה נקלטה', subtitle: 'איגוד הצאצאים', body }),
  }
}

// ─── בקשה נחסמה כי הרישום נדחה (נשלח רק כשנדחה מנסה להגיש בקשה) ───────────────
export function requestBlockedRejectedEmail(opts: {
  family_name?: string | null; full_name?: string | null; marital_status?: string | null; reason?: string | null
}): BuiltEmail {
  const greet = greetByStatus(opts.family_name, opts.full_name, opts.marital_status)
  const reason = (opts.reason ?? '').trim()
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('request_blocked_rejected', k)
  const officeLink = `<a href="mailto:${OFFICE_EMAIL}" style="color:#b91c1c;font-weight:700;text-decoration:none;">${OFFICE_EMAIL}</a>`
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:Arial,sans-serif;">${greet}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 8px;color:#b91c1c;font-size:15px;font-weight:900;">${escapeHtml(t('box_title'))}</p>
        <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.8;">
          ${t('box_text').replace(/\{סיבה\}/g, reason ? ` — ${escapeHtml(reason)}` : '')}
        </p>
      </td></tr>
    </table>
    <p style="margin:14px 0 0;color:#334155;font-size:13px;line-height:1.7;">${t('contact_note').replace(/\{מייל\}/g, officeLink)}</p>
    ${noReplyBox()}`
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#dc2626', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── הגשת בקשה במייל: דחייה + טמפלט למילוי מחדש ─────────────────────────────
export function emailIntakeRejectedEmail(opts: {
  name: string; typeLabel: string; errors: string[]; draftHref?: string | null; action?: string; portalUrl?: string
  // פתיח מוכן שגובר על ברירת המחדל. בבקשות לידה הפנייה היא ליולדת
  // ("מרת <שם> תחי׳") ולא לבעל — ראה greetMrs.
  greeting?: string | null
}): BuiltEmail {
  const { name, typeLabel, errors, draftHref, action, portalUrl = PORTAL_BASE_DEFAULT } = opts
  const greet = opts.greeting?.trim() || greetHe(name)
  const errorList = errors.map(e => `<li style="margin:0 0 4px;">${e}</li>`).join('')
  // הכפתור מפנה ישירות לטופס ההגשה המתאים (?action=birth|loan|aid) ולא לדף הכללי.
  const base = portalUrl.replace(/\/$/, '')
  const digitalUrl = action ? `${base}/?action=${action}` : `${base}/`

  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל"). textFor מחזיר את
  // הערך הערוך, ובהיעדרו את ברירת המחדל — שזהה לטקסט שהיה כאן קשיח.
  // {סוג} מוחלף בסוג הבקשה, כדי שהעריכה לא תאבד את התוכן הדינמי.
  const T = (k: string) => escapeHtml(textFor('email_intake_rejected', k).replace(/\{סוג\}/g, typeLabel))

  // "הגשה חוזרת" — קישור לטיוטה מוכנה (mailto) במקום הדבקת כל הטקסט.
  const draftBlock = draftHref ? `
    <p style="margin:18px 0 8px;color:#334155;font-size:14px;font-weight:700;">${T('draft_note')}</p>
    <p style="margin:0;"><a href="${draftHref}" style="display:inline-block;color:#c2410c;font-size:15px;font-weight:700;text-decoration:underline;">${T('draft_button')}</a></p>` : ''
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:Arial,sans-serif;">${greet}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
      <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 8px;color:#b91c1c;font-size:15px;font-weight:900;">${escapeHtml(typeLabel)} שלך לא נקלטה</p>
        <p style="margin:0 0 8px;color:#991b1b;font-size:13px;">${T('errors_intro')}</p>
        <ul style="margin:0;padding-inline-start:18px;color:#991b1b;font-size:13px;line-height:1.7;">${errorList}</ul>
      </td></tr>
    </table>
    <p style="margin:0 0 6px;color:#334155;font-size:14px;line-height:1.7;">${T('digital_note')}</p>
    ${btn(digitalUrl, textFor('email_intake_rejected', 'digital_button'), '#4f46e5')}
    ${draftBlock}
    ${noReplyBox()}`
  const title = textFor('email_intake_rejected', 'title')
  return {
    subject: `${typeLabel} לא נקלטה — היכל החתם סופר`,
    html: shell({ preheader: 'הבקשה לא נקלטה — נא לתקן ולשלוח שוב.', accent: '#dc2626', title, subtitle: 'איגוד הצאצאים', body }),
  }
}

// ─── דוח שבועי של הלוואות (נשלח לכתובת שמוגדרת בהגדרות הפורטל) ────────────────
export interface ReportLoanRow {
  name: string
  amount: number
  statusLabel: string
  createdAt: string
}

export function weeklyLoansReportEmail(
  stats: { pending: number; awaitingDisbursement: number; disbursedThisWeek: number; newLoans?: ReportLoanRow[] },
  portalUrl: string,
  sinceISO?: string,
): BuiltEmail {
  const accent = '#6366f1'
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('weekly_loans_report', k)
  const T = (k: string) => escapeHtml(t(k))
  const fmtCur = (n: number) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

  const statBox = (value: number, label: string, color: string) => `
    <td width="33%" style="padding:6px;" valign="top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
        <tr><td style="padding:18px 10px;text-align:center;">
          <div style="font-size:32px;font-weight:900;color:${color};line-height:1;">${value}</div>
          <div style="font-size:12px;color:#64748b;margin-top:8px;line-height:1.4;">${label}</div>
        </td></tr>
      </table>
    </td>`

  const newLoans = stats.newLoans ?? []
  const sinceLabel = sinceISO ? fmtDate(sinceISO) : ''
  const sinceSuffix = sinceLabel ? ` (${sinceLabel})` : ''

  // טבלת ההלוואות שאושרו מאז הדוח הקודם
  const newLoansSection = newLoans.length > 0
    ? `
    <h2 style="margin:30px 0 12px;color:#0f172a;font-size:16px;font-weight:800;">
      ${escapeHtml(t('new_loans_title').replace(/\{תאריך\}/g, sinceSuffix).replace(/\{מספר\}/g, String(newLoans.length)))}
    </h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr style="background:#f1f5f9;">
        <td style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-align:right;">${T('col_family')}</td>
        <td style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-align:right;">${T('col_amount')}</td>
        <td style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-align:right;">${T('col_status')}</td>
        <td style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-align:right;">${T('col_date')}</td>
      </tr>
      ${newLoans.map((l, i) => `
      <tr style="background:${i % 2 ? '#ffffff' : '#fafbfc'};">
        <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-top:1px solid #f1f5f9;">${l.name}</td>
        <td style="padding:10px 12px;font-size:13px;color:#0f172a;font-weight:700;border-top:1px solid #f1f5f9;">${fmtCur(l.amount)}</td>
        <td style="padding:10px 12px;font-size:13px;color:#64748b;border-top:1px solid #f1f5f9;">${l.statusLabel}</td>
        <td style="padding:10px 12px;font-size:13px;color:#64748b;border-top:1px solid #f1f5f9;">${fmtDate(l.createdAt)}</td>
      </tr>`).join('')}
    </table>`
    : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
      <tr><td style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:18px;text-align:center;">
        <p style="margin:0;color:#94a3b8;font-size:13px;">${escapeHtml(t('empty_note').replace(/\{תאריך\}/g, sinceSuffix))}</p>
      </td></tr>
    </table>`

  const body = `
    <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.7;text-align:center;">
      ${t('intro')}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr>
        ${statBox(stats.awaitingDisbursement, T('stat_awaiting'), '#6366f1')}
        ${statBox(stats.pending, T('stat_pending'), '#d97706')}
        ${statBox(stats.disbursedThisWeek, T('stat_disbursed'), '#059669')}
      </tr>
    </table>

    ${newLoansSection}

    <div style="margin:28px 0 0;">${btn(portalUrl, t('button'), accent)}</div>

    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;text-align:center;">
      ${T('footnote')}
    </p>`

  const pending = String(stats.pending)
  return {
    subject: t('subject').replace(/\{ממתינות\}/g, pending),
    html: shell({
      preheader: t('preheader').replace(/\{ממתינות\}/g, pending),
      accent,
      title: t('title'),
      subtitle: t('subtitle'),
      body,
    }),
  }
}

// ─── עזרים ────────────────────────────────────────────────────────────────────
export function requiredDocLabels(maritalStatus?: string | null): string[] {
  if (maritalStatus === 'נשואים') return ['תעודת זהות של הבעל (כולל ספח)', 'תעודת זהות של האשה (כולל ספח)']
  return ['תעודת זהות (כולל ספח)']
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
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(details.family_name, name, details.marital_status)} הרישום אושר </h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">
      אנו שמחים לבשר לך כי הרישום שלך ל<strong>איגוד הצאצאים</strong> של היכל החתם סופר התקבל במערכת ואושר.
      מעתה ניתן להגיש בקשות לאחת מההטבות ישירות מכאן — לחצו על הכפתור המתאים:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#f0fdf4;border-right:4px solid #22c55e;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#15803d;font-size:15px;font-weight:800;">הסטטוס שלך: <span style="color:#16a34a;">מאושר</span></p>
      </td></tr>
    </table>

    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">פרטי הצאצא שלך:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin:0 0 28px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      ${detailsRows}
    </table>

    <p style="margin:0 0 18px;color:#334155;font-size:15px;font-weight:700;text-align:center;">מה תרצה/י לעשות עכשיו?</p>

    ${btnPair(
      `${base}/?action=birth`, 'בקשת לידה', '#fce7f3', '#9d174d',
      `${base}/?action=loan`,  'בקשת הלוואה', '#e0e7ff', '#3730a3',
    )}
    <div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>
    ${btn(`${base}/?action=aid`, 'בקשת סיוע רפואי', '#dcfce7', '#166534')}

    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.7;text-align:center;">
      להגשת בקשה תתבקש/י להזין את מספר תעודת הזהות שלך לאימות.
    </p>
  `
  return {
    subject: 'הרישום לאיגוד הצאצאים אושר — היכל החתם סופר',
    html: shell({ preheader: 'הרישום לאיגוד הצאצאים התקבל ואושר! ניתן כעת להגיש בקשות.', accent: '#22c55e', title: 'הרישום אושר בהצלחה', subtitle: 'ברוכים הבאים להיכל החתם סופר', body }),
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
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(null, b.name, b.marital_status)}</h2>
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
      ${isApproved ? 'ניתן להגיש בקשה ישירות דרך המערכת הדיגיטלית שלנו:' : 'לטיפול בבקשתך:'}
    </p>

    ${btnPair(
      `${base}/?action=birth`, 'בקשת לידה', '#fce7f3', '#9d174d',
      `${base}/?action=loan`,  'בקשת הלוואה', '#e0e7ff', '#3730a3',
    )}
    <div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>
    ${btn(`${base}/?action=aid`, 'בקשת סיוע רפואי', '#dcfce7', '#166534')}

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
        <p style="margin:0 0 8px;color:#854d0e;font-size:14px;font-weight:800;">אם אתה/את כבר רשום/ה אצלנו:</p>
        <p style="margin:0;color:#713f12;font-size:13px;line-height:1.7;">
          ניתן לכתוב לנו ב<strong>מייל חדש</strong> לכתובת
          <a href="mailto:igud@chasamsofer.info" style="color:#854d0e;font-weight:700;text-decoration:none;">igud@chasamsofer.info</a>,
          וב<strong>שורת הנושא</strong> לכתוב את <strong>מספר תעודת הזהות שלך במלואו (כולל ספרת ביקורת)</strong> —
          והמערכת תשלח אליך אוטומטית מייל עם הפרטים שלך וקישורים להגשת בקשות.
        </p>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#eef2ff;border-right:4px solid #6366f1;border-radius:0 12px 12px 0;padding:18px 20px;">
        <p style="margin:0 0 6px;color:#3730a3;font-size:14px;font-weight:800;">אם עדיין לא נרשמת:</p>
        <p style="margin:0;color:#4338ca;font-size:13px;line-height:1.6;">
          ההרשמה פשוטה ומהירה — מזינים מספר תעודת זהות ומספר פרטים.<br/>
          לאחר אישור הזכאות תוכל/י להגיש בקשות ישירות דרך המערכת הדיגיטלית שלנו.
        </p>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr><td align="center">
        ${btn(`${base}/`, 'כניסה למערכת הדיגיטלית', '#4f46e5')}
      </td></tr>
    </table>

    <p style="margin:28px 0 0;color:#94a3b8;font-size:13px;line-height:1.7;text-align:center;">
      בלחיצה תגיע/י למערכת הדיגיטלית שלנו — הזן/י תעודת זהות לכניסה, או מלא/י פרטים להרשמה חדשה.
    </p>
  `
  return {
    subject: 'קיבלנו את פנייתך — היכל החתם סופר',
    html: shell({ preheader: 'כתובת המייל שלך לא נמצאה — כנס/י למערכת הדיגיטלית לבדיקה.', accent: '#6366f1', title: 'קיבלנו את פנייתך', subtitle: 'היכל החתם סופר', body }),
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
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('docs_pending', k)
  const docs = (explicitDocs && explicitDocs.length) ? explicitDocs : requiredDocLabels(maritalStatus)
  const docsList = docs.map(d =>
    `<li style="margin:0 0 8px;color:#92400e;font-size:14px;font-weight:700;">${d}</li>`
  ).join('')

  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(t('kicker'))}</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(null, name, maritalStatus)}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">
      ${t('intro')}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#fffbeb;border-right:4px solid #f59e0b;border-radius:0 12px 12px 0;padding:18px 20px;">
        <p style="margin:0 0 10px;color:#92400e;font-size:14px;font-weight:800;">${escapeHtml(t('docs_title'))}</p>
        <ul style="margin:0;padding-right:20px;">${docsList}</ul>
      </td></tr>
    </table>
    ${extraNote && extraNote.trim() ? `<p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.7;background:#f8fafc;border-radius:10px;padding:14px 18px;">${extraNote}</p>` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        ${btn(`${base}/?action=docs`, t('button'), '#d97706')}
      </td></tr>
    </table>

    <p style="margin:28px 0 0;color:#94a3b8;font-size:13px;line-height:1.7;text-align:center;">
      ${t('footnote')}
    </p>
  `
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#d97706', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── אישור קבלת בקשה (לידה / הלוואה) ────────────────────────────────────────
// פרטי המבקש לטבלת אישור הקבלה
export interface ReceivedBeneficiary {
  full_name?: string | null; family_name?: string | null; id_number?: string | null
  phone?: string | null; email?: string | null; address?: string | null; city?: string | null
  marital_status?: string | null; spouse_name?: string | null; spouse_id_number?: string | null
  children_count?: number | null
}

function beneficiaryDetailRows(b: ReceivedBeneficiary): string {
  const fullName = [b.family_name, b.full_name].filter(Boolean).join(' ') || (b.full_name ?? '')
  const married = (b.marital_status ?? '').startsWith('נשו')
  return [
    detailRow('שם מלא', fullName),
    detailRow('תעודת זהות', b.id_number),
    detailRow('טלפון', b.phone),
    detailRow('דוא"ל', b.email),
    detailRow('כתובת', [b.address, b.city].filter(Boolean).join(', ')),
    detailRow('מצב משפחתי', b.marital_status),
    married ? detailRow('בן/בת זוג', b.spouse_name) : '',
    married ? detailRow('ת.ז בן/בת הזוג', b.spouse_id_number) : '',
    detailRow('מספר ילדים', b.children_count != null ? String(b.children_count) : ''),
  ].join('')
}

// אישור קבלת בקשה — מעוצב עם פרטי המבקש + פרטי הבקשה + המסמכים המצורפים.
export function requestReceivedEmail(opts: {
  type: 'birth' | 'loan' | 'financial_aid' | 'widow'
  firstTime: boolean
  beneficiary: ReceivedBeneficiary
  requestRows?: [string, string | number | null | undefined][]
  documents?: { name: string; url?: string }[]
}): BuiltEmail {
  const { type, firstTime, beneficiary, requestRows = [], documents = [] } = opts
  const reqLabel = type === 'birth' ? 'בקשת הבראה ליולדת' : type === 'financial_aid' ? 'בקשת סיוע רפואי' : type === 'widow' ? 'בקשת סיוע' : 'בקשת הלוואה'
  const accent   = type === 'birth' ? '#db2777' : type === 'financial_aid' ? '#10b981' : type === 'widow' ? '#7c3aed' : '#4f46e5'
  const fullName = [beneficiary.family_name, beneficiary.full_name].filter(Boolean).join(' ') || (beneficiary.full_name ?? '')
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל"). {סוג} מוחלף בסוג הבקשה.
  const t = (k: string) => textFor('request_received', k).replace(/\{סוג\}/g, reqLabel)
  const T = (k: string) => escapeHtml(t(k))

  const firstTimeNote = firstTime ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr><td style="background:#f0fdf4;border-right:4px solid #22c55e;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#15803d;font-size:14px;font-weight:800;">${T('first_time_title')}</p>
        <p style="margin:0;color:#15803d;font-size:13px;line-height:1.7;">
          ${T('first_time_note')}
        </p>
      </td></tr>
    </table>` : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr><td style="background:#f0fdf4;border-right:4px solid #22c55e;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#15803d;font-size:14px;font-weight:700;">${T('repeat_note')}</p>
      </td></tr>
    </table>`

  const reqRowsHtml = requestRows.map(([l, v]) => detailRow(l, v != null && v !== '' ? String(v) : '')).join('')
  const docsHtml = documents.length ? `
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">${T('docs_title')}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;color:#334155;font-size:14px;line-height:2;">
        ${documents.map(d => d.url
          ? `<a href="${d.url}" target="_blank" download style="color:#4f46e5;font-weight:600;text-decoration:underline;">${d.name}</a>`
          : `${d.name}`).join('<br/>')}
      </td></tr>
    </table>` : ''

  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:0.5px;">${T('kicker')}</p>
    <h2 style="margin:0 0 14px;color:#0f172a;font-size:22px;font-weight:900;">${type === 'birth' ? greetMrs(beneficiary.family_name, beneficiary.spouse_name || beneficiary.full_name) : greetByStatus(beneficiary.family_name, beneficiary.full_name, beneficiary.marital_status)}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.8;">
      ${t('intro')}
    </p>
    ${firstTimeNote}
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">${T('beneficiary_title')}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${beneficiaryDetailRows(beneficiary)}</table>
    ${reqRowsHtml ? `
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">${T('request_title')}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${reqRowsHtml}</table>` : ''}
    ${docsHtml}
    <p style="margin:0 0 4px;color:#94a3b8;font-size:13px;line-height:1.7;">${T('footnote')}</p>
    ${noReplyBox()}
  `
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent, title: t('title'), subtitle: reqLabel, body }),
  }
}

// ─── אישור קבלת רישום ראשוני — מעוצב עם כל פרטי הרישום + קישור לפורטל ──────────
export function registrationReceivedEmail(
  d: {
    full_name?: string | null; family_name?: string | null; id_number?: string | null
    phone?: string | null; email?: string | null; address?: string | null; city?: string | null
    marital_status?: string | null; spouse_name?: string | null; spouse_id_number?: string | null
    children_count?: number | null
  },
  portalBase = PORTAL_BASE_DEFAULT,
  // קישורי טיוטה מוכנה (mailto) — להגשת בקשה ישירות מהמייל, בלי להיכנס לאתר.
  // חיוני למי שחסום לגלישה. נבנים ע"י buildDraftLinks.
  draftLinks?: { label: string; href: string }[],
): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('registration_received', k)
  const fullName = [d.family_name, d.full_name].filter(Boolean).join(' ') || (d.full_name ?? '')

  const draftBlock = (draftLinks && draftLinks.length) ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
      <tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#9a3412;font-size:14px;font-weight:900;">${escapeHtml(t('drafts_title'))}</p>
        <p style="margin:0 0 12px;color:#9a3412;font-size:13px;line-height:1.7;">${escapeHtml(t('drafts_note'))}</p>
        ${draftLinks.map(l => `<a href="${l.href}" style="display:inline-block;margin:0 0 8px;color:#c2410c;font-size:15px;font-weight:700;text-decoration:underline;">${escapeHtml(l.label)}</a><br/>`).join('')}
      </td></tr>
    </table>` : ''
  const married = (d.marital_status ?? '').startsWith('נשו')
  const widowerBen = d.marital_status === 'אלמן' || d.marital_status === 'אלמנה'
  const rows = [
    detailRow('שם מלא', fullName),
    detailRow('תעודת זהות', d.id_number),
    detailRow('טלפון', d.phone),
    detailRow('דוא"ל', d.email),
    detailRow('כתובת', [d.address, d.city].filter(Boolean).join(', ')),
    detailRow('מצב משפחתי', d.marital_status),
    married ? detailRow('בן/בת זוג', d.spouse_name) : '',
    married ? detailRow('ת.ז בן/בת הזוג', d.spouse_id_number) : '',
    detailRow('מספר ילדים', d.children_count != null ? String(d.children_count) : ''),
  ].join('')
  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:0.5px;">${escapeHtml(t('kicker'))}</p>
    <h2 style="margin:0 0 14px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(d.family_name, d.full_name, d.marital_status)}</h2>
    <p style="margin:0 0 22px;color:#475569;font-size:15px;line-height:1.8;">
      ${t('intro')}
    </p>
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">${escapeHtml(t('details_title'))}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${rows}</table>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;font-weight:700;text-align:center;">${escapeHtml(t('buttons_title'))}</p>
    ${[
      married ? btn(`${base}/?action=birth`, t('btn_birth'), '#fce7f3', '#9d174d') : '',
      btn(`${base}/?action=loan`, t('btn_loan'), '#e0f2fe', '#075985'),
      btn(`${base}/?action=aid`, t('btn_aid'), '#dcfce7', '#166534'),
      widowerBen ? btn(`${base}/?action=aid`, t('btn_widow'), '#ede9fe', '#5b21b6') : '',
    ].filter(Boolean).join('<div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>')}
    ${draftBlock}
  `
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#4f46e5', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── סיוע רפואי — פנייה מעוצבת לגורם המאשר ─────────────────────────────────────
// הגורם המאשר משיב באותו שרשור: מספר = סכום מאושר · X = נדחה.
export function financialAidInquiryEmail(
  b: { family_name?: string | null; full_name?: string | null; id_number?: string | null; spouse_name?: string | null; marital_status?: string | null; phone?: string | null; city?: string | null; children_count?: number | null },
  reason?: string | null,
): BuiltEmail {
  const fullName = [b.family_name, b.full_name].filter(Boolean).join(' ') || (b.full_name ?? '')
  const rows = [
    detailRow('שם מלא', fullName),
    detailRow('מספר זהות', b.id_number),
    detailRow('בן/בת זוג', b.spouse_name),
    detailRow('מצב משפחתי', b.marital_status),
    detailRow('טלפון', b.phone),
    detailRow('עיר', b.city),
    detailRow('מספר ילדים', b.children_count != null ? String(b.children_count) : ''),
  ].join('')
  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">בקשת סיוע רפואי</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">בקשה לאישור סיוע רפואי</h2>
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">פרטי המבקש:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${rows}</table>
    ${reason ? `
    <p style="margin:0 0 8px;color:#334155;font-size:14px;font-weight:700;">סיבת הבקשה:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#f8fafc;border-right:4px solid #6366f1;border-radius:0 12px 12px 0;padding:14px 18px;color:#334155;font-size:14px;line-height:1.7;white-space:pre-wrap;">${reason}</td></tr>
    </table>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;">
        <p style="margin:0;color:#1e40af;font-size:15px;font-weight:800;">להחלטתך:</p>
        <p style="margin:6px 0 0;color:#1e3a8a;font-size:14px;line-height:1.7;">
          להשיב למייל זה <strong>בסכום לאישור</strong> (מספר בלבד, למשל 1000), או באות <strong>X</strong> לדחיית הבקשה.
        </p>
      </td></tr>
    </table>
  `
  return {
    subject: `בקשת סיוע רפואי — ${fullName}${b.id_number ? ` (ת.ז ${b.id_number})` : ''}`,
    html: shell({ preheader: 'בקשת סיוע רפואי להחלטתך — השב בסכום או X.', accent: '#6366f1', title: 'בקשת סיוע רפואי', subtitle: 'היכל החתם סופר', body }),
  }
}

// ─── סיוע רפואי — אישור קבלה למבקש (בעת הגשה) ──────────────────────────────────
export function financialAidReceivedEmail(name: string): BuiltEmail {
  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:0.5px;">אישור קבלה</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetHe(name)}</h2>
    <p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.8;">
      בקשתך ל<strong>סיוע רפואי</strong> התקבלה במערכת היכל החתם סופר והועברה לטיפול המזכירות.
    </p>
    <p style="margin:0;color:#334155;font-size:15px;line-height:1.8;">בסיום הטיפול תישלח אליך הודעה.</p>
  `
  return {
    subject: 'בקשתך לסיוע רפואי התקבלה — היכל החתם סופר',
    html: shell({ preheader: 'בקשתך לסיוע רפואי התקבלה והועברה לטיפול המזכירות.', accent: '#10b981', title: 'הבקשה התקבלה', subtitle: 'סיוע רפואי', body }),
  }
}

// ─── סיוע רפואי — הודעת החלטה למבקש (אושר/נדחה) ────────────────────────────────
export function financialAidDecisionEmail(name: string, approved: boolean, amount?: number | null): BuiltEmail {
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('financial_aid_decision', k)
  const T = (k: string) => escapeHtml(t(k))
  const body = approved ? `
    <p style="margin:0 0 8px;color:#059669;font-size:13px;font-weight:700;letter-spacing:0.5px;">${T('kicker_approved')}</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetHe(name)}</h2>
    <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.8;">
      ${t('intro_approved')}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:18px 22px;text-align:center;">
        <p style="margin:0;color:#065f46;font-size:13px;font-weight:600;">${T('amount_label')}</p>
        <p style="margin:6px 0 0;color:#047857;font-size:30px;font-weight:900;" dir="ltr">₪${Number(amount ?? 0).toLocaleString('he-IL')}</p>
      </td></tr>
    </table>
    <p style="margin:0;color:#334155;font-size:14px;line-height:1.8;">${T('footer_approved')}</p>
  ` : `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:0.5px;">${T('kicker_rejected')}</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetHe(name)}</h2>
    <p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.8;">
      ${t('intro_rejected')}
    </p>
    <p style="margin:0;color:#334155;font-size:14px;line-height:1.8;">${T('footer_rejected')}</p>
  `
  return {
    subject: approved ? t('subject_approved') : t('subject_rejected'),
    html: shell({ preheader: approved ? `בקשתך אושרה על סך ₪${Number(amount ?? 0).toLocaleString('he-IL')}` : t('preheader_rejected'), accent: approved ? '#10b981' : '#64748b', title: approved ? t('title_approved') : t('title_rejected'), subtitle: t('subtitle'), body }),
  }
}

// ─── אישור בקשה (לידה / הלוואה) — מייל מעוצב עם פרטי הנרשם ופרטי הבקשה ──────────
export interface RequestApprovedBeneficiary {
  family_name?: string | null
  full_name?: string | null
  id_number?: string | null
  spouse_name?: string | null
  marital_status?: string | null
  phone?: string | null
  city?: string | null
  children_count?: number | null
}

export function loanApprovedEmail(
  b: RequestApprovedBeneficiary,
  loan: { amount?: number | null; approved_amount?: number | null; installments?: number | null; monthly_payment?: number | null; purpose?: string | null },
): BuiltEmail {
  const fullName = [b.family_name, b.full_name].filter(Boolean).join(' ') || (b.full_name ?? '')
  const fmt = (n?: number | null) => (n != null ? `₪${Number(n).toLocaleString('he-IL')}` : '')
  const benRows = [
    detailRow('שם מלא', fullName),
    detailRow('מספר זהות', b.id_number),
    detailRow('בן/בת זוג', b.spouse_name),
    detailRow('מצב משפחתי', b.marital_status),
    detailRow('טלפון', b.phone),
    detailRow('עיר', b.city),
    detailRow('מספר ילדים', b.children_count != null ? String(b.children_count) : ''),
  ].join('')
  const loanRows = [
    // מציגים את הסכום שאושר בפועל (נפילה-לאחור לסכום המבוקש אם טרם הוזן)
    detailRow('סכום ההלוואה', fmt(loan.approved_amount ?? loan.amount)),
    detailRow('מספר תשלומים', loan.installments != null ? String(loan.installments) : ''),
    detailRow('תשלום חודשי', fmt(loan.monthly_payment)),
    detailRow('מטרת ההלוואה', loan.purpose),
  ].join('')
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('loan_approved', k)
  const T = (k: string) => escapeHtml(t(k))
  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${T('kicker')}</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(b.family_name, b.full_name, b.marital_status)} ${T('heading_suffix')}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#f0fdf4;border-right:4px solid #22c55e;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#15803d;font-size:15px;font-weight:800;">${T('approved_note')}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">${T('loan_details_title')}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${loanRows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#eef2ff;border-right:4px solid #4f46e5;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#3730a3;font-size:14px;font-weight:700;line-height:1.7;">
          ${T('next_note')}
        </p>
      </td></tr>
    </table>
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">${T('ben_details_title')}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${benRows}</table>
  `
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#4f46e5', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

export type FoodCardCenter = { name: string; city?: string | null; address?: string | null }

export function birthApprovedEmail(
  b: RequestApprovedBeneficiary,
  birth: { baby_name?: string | null; baby_gender?: string | null; birth_date?: string | null; recovery_home?: string | null },
  opts: { center?: FoodCardCenter | null; stockAvailable?: boolean; serial?: string | null; phones?: (string | null | undefined)[] } = {},
): BuiltEmail {
  const center = opts.center ?? null
  const stockAvailable = !!opts.stockAvailable
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('birth_approved', k)
  const T = (k: string) => escapeHtml(t(k))
  const fullName = [b.family_name, b.full_name].filter(Boolean).join(' ') || (b.full_name ?? '')
  const genderLabel = birth.baby_gender === 'male' ? 'בן' : birth.baby_gender === 'female' ? 'בת' : ''
  const nameLabel = birth.baby_gender === 'female' ? 'שם הנולדת' : 'שם הנולד'
  const birthRows = [
    detailRow(nameLabel, birth.baby_name),
    detailRow('מין', genderLabel),
    detailRow('תאריך הלידה', birth.birth_date),
    detailRow('בית החלמה', birth.recovery_home),
  ].join('')
  const benRows = [
    detailRow('שם מלא', fullName),
    detailRow('מספר זהות', b.id_number),
    detailRow('בן/בת זוג', b.spouse_name),
    detailRow('מצב משפחתי', b.marital_status),
    detailRow('טלפון', b.phone),
    detailRow('עיר', b.city),
    detailRow('מספר ילדים', b.children_count != null ? String(b.children_count) : ''),
  ].join('')
  // בלוק כרטיס המזון — לפי המוקד שנבחר ולפי זמינות המלאי בו
  const centerPlace = center ? [center.city, center.address].filter(Boolean).join(', ') : ''
  const foodCardBlock = stockAvailable
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#b45309;font-size:15px;font-weight:900;">${T('card_title')}</p>
        <p style="margin:0;color:#92400e;font-size:14px;line-height:1.7;">
          ${t('card_text')}
        </p>
        ${center ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 0;border:1px solid #fcd34d;border-radius:10px;overflow:hidden;background:#ffffff;">
          <tr><td style="padding:10px 16px;color:#92400e;font-size:15px;font-weight:800;">${center.name}</td>
              <td style="padding:10px 16px;color:#b45309;font-size:13px;text-align:left;">${centerPlace || '—'}</td></tr>
        </table>` : ''}
      </td></tr>
    </table>
    ${cardActivationNotice(opts.phones)}`
    : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#b91c1c;font-size:15px;font-weight:900;">${T('card_title_no_stock')}</p>
        <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.7;">
          ${t('no_stock_note').replace(/\{מוקד\}/g, center ? ` (<strong>${center.name}</strong>)` : '')}
        </p>
      </td></tr>
    </table>`
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px 18px;text-align:center;">
        <p style="margin:0;color:#3730a3;font-size:15px;font-weight:900;line-height:1.7;">${T('vouchers_title')}</p>
        <p style="margin:4px 0 0;color:#4338ca;font-size:13px;line-height:1.7;">${T('vouchers_note')}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${T('kicker')}</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetMrs(b.family_name, b.spouse_name || b.full_name)} ${T('heading_suffix')} </h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#fdf2f8;border-right:4px solid #db2777;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#be185d;font-size:15px;font-weight:800;">${T('approved_note')}</p>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;">
        <p style="margin:0;color:#1e40af;font-size:15px;font-weight:800;">${T('next_title')}</p>
        <p style="margin:6px 0 0;color:#1e3a8a;font-size:14px;line-height:1.7;">
          ${t('next_text').replace(/\{בית_החלמה\}/g, birth.recovery_home ? ` — <strong>${birth.recovery_home}</strong>` : '')}
        </p>
      </td></tr>
    </table>
    ${foodCardBlock}
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">${T('birth_details_title')}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${birthRows}</table>
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">${T('ben_details_title')}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${benRows}</table>
  `
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#db2777', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── אישור כרטיס מזון ליולדת (שובר) ───────────────────────────────────────────
// בלוק "הפעלת הכרטיס" — הוראה מודגשת המשותפת למיילי הכרטיס. חובה להפעיל את הכרטיס דרך המוקד
// הטלפוני, ורק ממספרי הטלפון המעודכנים במערכת. אם נמסרו מספרים — הם מוצגים במפורש (בכיוון LTR).
function cardActivationNotice(phones?: (string | null | undefined)[]): string {
  const list = [...new Set((phones ?? []).map(p => String(p ?? '').trim()).filter(Boolean))]
  const numbersLine = list.length
    ? `<p style="margin:8px 0 0;color:#7f1d1d;font-size:13px;line-height:1.9;">
          <strong>שימו לב:</strong> המערכת מזהה אתכם אוטומטית לפי מספרי הטלפון המעודכנים אצלנו — ההפעלה אפשרית אך ורק בשיחה מהמספרים הבאים:<br />
          <span style="display:inline-block;margin-top:4px;font-weight:900;color:#991b1b;">${list.map(p => `<span dir="ltr" style="unicode-bidi:embed;">${p}</span>`).join(' &nbsp;·&nbsp; ')}</span>
        </p>`
    : `<p style="margin:8px 0 0;color:#7f1d1d;font-size:13px;line-height:1.8;">
          <strong>שימו לב:</strong> המערכת מזהה אתכם אוטומטית לפי מספרי הטלפון המעודכנים במערכת — ההפעלה אפשרית אך ורק בשיחה ממספרים אלו.
        </p>`
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#b91c1c;font-size:15px;font-weight:900;">הפעלת הכרטיס — חובה לפני השימוש!</p>
        <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.8;">
          לאחר קבלת הכרטיס מהמוקד, יש להפעילו בהתקשרות למוקד הטלפוני <strong style="direction:ltr;unicode-bidi:embed;">02-3131325</strong> שלוחה <strong>1</strong>, ולפעול לפי ההנחיות.
        </p>
        ${numbersLine}
      </td></tr>
    </table>`
}

export function maternityCardEmail(
  b: { full_name?: string | null; family_name?: string | null; spouse_name?: string | null },
  opts: { centerName?: string | null; phones?: (string | null | undefined)[] } = {},
): BuiltEmail {
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('maternity_card', k)
  const T = (k: string) => escapeHtml(t(k))
  const rows = [
    detailRow('שם המשפחה', [b.family_name, b.full_name].filter(Boolean).join(' ')),
    detailRow('מוקד החלוקה', opts.centerName),
  ].join('')
  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${T('kicker')}</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetMrs(b.family_name, b.spouse_name || b.full_name)} ${T('heading_suffix')} </h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#ecfdf5;border-right:4px solid #059669;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#047857;font-size:15px;font-weight:800;">${T('intro')}</p>
      </td></tr>
    </table>
    ${opts.centerName ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;">
        <p style="margin:0;color:#1e40af;font-size:15px;font-weight:800;">${T('next_title')}</p>
        <p style="margin:6px 0 0;color:#1e3a8a;font-size:14px;line-height:1.7;">
          ${t('next_text').replace(/\{מוקד\}/g, opts.centerName)}
        </p>
      </td></tr>
    </table>` : ''}
    ${cardActivationNotice(opts.phones)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${rows}</table>
  `
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#059669', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── עדכון: המלאי במוקד התחדש — מצורף שובר הכרטיס לאיסוף ──────────────────────
export function cardStockReplenishedEmail(name: string, centerName?: string | null, phones?: (string | null | undefined)[]): BuiltEmail {
  const greet = greetMrs(null, name)
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('card_stock_replenished', k)
  const T = (k: string) => escapeHtml(t(k))
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px 18px;text-align:center;">
        <p style="margin:0;color:#3730a3;font-size:15px;font-weight:900;line-height:1.7;">${T('voucher_title')}</p>
        <p style="margin:4px 0 0;color:#4338ca;font-size:13px;line-height:1.7;">${T('voucher_note')}</p>
      </td></tr>
    </table>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greet} ${T('heading_suffix')} </h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr><td style="background:#ecfdf5;border-right:4px solid #059669;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#047857;font-size:15px;font-weight:800;">
          ${t('intro').replace(/\{מוקד\}/g, centerName ? ` <strong>${centerName}</strong>` : ' שבחרתם')}
        </p>
        <p style="margin:6px 0 0;color:#065f46;font-size:14px;line-height:1.7;">${T('intro_note')}</p>
      </td></tr>
    </table>
    ${cardActivationNotice(phones)}
  `
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#059669', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── פרטי כניסה לפורטל (בית החלמה / ביצוע הלוואות) — מייל מעוצב עם קישור וסיסמה ──
export function portalCredentialsEmail(opts: {
  title: string                 // שם הפורטל, למשל "פורטל בתי החלמה" / "פורטל ביצוע הלוואות"
  intro: string                 // משפט הסבר קצר
  portalUrl: string
  password: string
  username?: string | null      // שם משתמש/מזהה (אופציונלי) — למשל שם בית ההחלמה
  usernameLabel?: string
}): BuiltEmail {
  const { title, intro, portalUrl, password, username, usernameLabel } = opts
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל"). {פורטל} = שם הפורטל,
  // שנקבע במקום השליחה (פורטל בתי החלמה / פורטל ביצוע הלוואות) ואינו נערך כאן.
  const t = (k: string) => textFor('portal_credentials', k).replace(/\{פורטל\}/g, title)
  const T = (k: string) => escapeHtml(t(k))
  const rows = [
    (usernameLabel && username) ? detailRow(usernameLabel, username) : '',
    detailRow(t('url_label'), portalUrl),
  ].join('')
  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:0.5px;">${T('kicker')}</p>
    <h2 style="margin:0 0 14px;color:#0f172a;font-size:22px;font-weight:900;">${escapeHtml(title)}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.8;">${escapeHtml(intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${rows}</table>
    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:16px;margin:0 0 22px;text-align:center;">
      <p style="margin:0 0 6px;color:#3730a3;font-size:13px;font-weight:600;">${T('password_label')}</p>
      <p style="margin:0;color:#1e1b4b;font-size:24px;font-weight:900;letter-spacing:3px;font-family:'Courier New',monospace;" dir="ltr">${escapeHtml(password)}</p>
    </div>
    ${btn(portalUrl, t('button'), '#4f46e5')}
    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px;line-height:1.7;">${T('security_note')}</p>
  `
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#4f46e5', title, subtitle: t('subtitle'), body }),
  }
}

// ─── התראה: יולדת מימשה זכאות החלמה (נשלח לכתובת פניות היולדות של בית ההחלמה) ──
export function recoveryRealizedEmail(opts: {
  home: string
  motherName: string
  amount: number
  nights: number | null
  receipt: string
}): { subject: string; html: string } {
  const rows =
    detailRow('בית החלמה', opts.home) +
    detailRow('יולדת', opts.motherName) +
    detailRow('סכום שמומש', '₪' + opts.amount.toLocaleString('he-IL')) +
    detailRow('מספר לילות', opts.nights != null ? String(opts.nights) : '—') +
    detailRow('מספר קבלה', opts.receipt)
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">יולדת סימנה מימוש זכאות החלמה בפורטל בית ההחלמה.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${rows}</table>
  `
  return {
    subject: `מימוש זכאות החלמה · ${opts.motherName} · ${opts.home}`,
    html: shell({ preheader: `${opts.motherName} מימשה זכאות החלמה`, accent: '#059669', title: 'מימוש זכאות החלמה', subtitle: 'היכל החתם סופר', body }),
  }
}

// ─── התראה: בית החלמה ביקש לתקן רשומה נעולה ─────────────────────────────────
export function recoveryEditRequestEmail(opts: {
  home: string
  motherName: string
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">בית החלמה <b>${escapeHtml(opts.home)}</b> ביקש לתקן את הרשומה של היולדת <b>${escapeHtml(opts.motherName)}</b>.</p>
    <p style="margin:0;color:#475569;font-size:15px;line-height:1.8;">הרשומה נעולה. ניתן לפתוח אותה לעריכה ממסך ההחלמה או מכרטסת הלידה.</p>
  `
  return {
    subject: `בקשת תיקון · ${opts.motherName} · ${opts.home}`,
    html: shell({ preheader: `בקשת תיקון מ${opts.home}`, accent: '#d97706', title: 'בקשת תיקון רשומה', subtitle: 'היכל החתם סופר', body }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// מכתבי ברכה לנדיב + משוב על בית ההחלמה
//
// ⚠️ חשוב: מול היולדת אין להשתמש במילה "סקר". הניסוח המאושר הוא
// "לצורך ייעול ושיפור השירות, נשמח לשמוע ממך על טיב השירות שקיבלת".
// ─────────────────────────────────────────────────────────────────────────────

// ─── בקשת דברי ברכה לנדיב (10 ימים אחרי אישור הלידה) ────────────────────────
export function gratitudeRequestEmail(opts: {
  familyName?: string | null
  motherName?: string | null
  formUrl: string
  /** תזכורת — נשלחת יומיים אחרי הבקשה, אם עדיין לא התקבל מכתב */
  isReminder?: boolean
}): BuiltEmail {
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const T = (k: string) => escapeHtml(textFor('gratitude_request', k))

  const body = `
    <p style="margin:0 0 18px;color:#0f172a;font-size:16px;font-weight:700;">${greetMrs(opts.familyName, opts.motherName)}</p>

    ${opts.isReminder ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#eef2ff;border-right:4px solid #6366f1;border-radius:8px;padding:12px 16px;">
        <p style="margin:0;color:#3730a3;font-size:14px;line-height:1.7;">${T('reminder_note')}</p>
      </td></tr>
    </table>` : `
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;">${T('mazal_tov')}</p>`}

    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;">${T('intro')}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#fefce8;border-right:4px solid #C69D2D;border-radius:8px;padding:12px 16px;">
        <p style="margin:0;color:#713f12;font-size:14px;line-height:1.7;">${T('highlight')}</p>
      </td></tr>
    </table>

    ${btn(opts.formUrl, textFor('gratitude_request', 'button'), '#C69D2D')}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
      <tr><td style="background:#f8fafc;border-radius:10px;padding:16px 20px;">
        <p style="margin:0 0 10px;color:#1B3256;font-size:14px;font-weight:700;">${T('other_ways_title')}</p>

        <p style="margin:0 0 10px;color:#475569;font-size:13.5px;line-height:1.8;">✉️ ${T('way_reply')}</p>

        <p style="margin:0 0 10px;color:#475569;font-size:13.5px;line-height:1.8;">✍️ ${T('way_print')}</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0;">
          <tr><td style="background:#fef3c7;border-right:3px solid #d97706;border-radius:6px;padding:10px 14px;">
            <p style="margin:0;color:#78350f;font-size:13px;line-height:1.7;">
              <strong>חשוב:</strong> כדי שהמערכת תזהה את המכתב שלכן ותשייך אותו אליכן,
              יש לשלוח אותו <strong>בתשובה למייל הזה</strong> (כפתור "השב") — ולא כמייל חדש.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>`
  return {
    subject: opts.isReminder
      ? textFor('gratitude_request', 'subject_reminder')
      : textFor('gratitude_request', 'subject'),
    html: shell({
      preheader: opts.isReminder
        ? 'עדיין נשמח לכמה מילות ברכה לנדיב שסייע לכם'
        : 'נשמח לכמה מילות ברכה לנדיב שסייע לכם',
      accent: '#C69D2D',
      title: 'דברי ברכה',
      subtitle: 'הכרת הטוב לנדיב',
      body,
    }),
  }
}

// ─── בקשת משוב על בית ההחלמה (5 ימים אחרי סימון ההגעה) ──────────────────────
// ⚠️ בלי המילה "סקר".
export function recoveryFeedbackEmail(opts: {
  familyName?: string | null
  motherName?: string | null
  recoveryHome?: string | null
  formUrl: string
  /** כתובת המענה (plus-addressing) — לבניית טיוטת המייל */
  replyTo: string
  questions: { position: number; text: string; type: string }[]
}): BuiltEmail {
  const scaleQs = opts.questions.filter(q => q.type === 'scale')
  const textQs = opts.questions.filter(q => q.type === 'text')

  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('recovery_feedback', k)
  const T = (k: string) => escapeHtml(t(k))
  const homeName = opts.recoveryHome ? escapeHtml(opts.recoveryHome) : 'בית ההחלמה'

  // ── טיוטת מייל מוכנה למילוי — אותו דפוס כמו הגשת בקשות במייל ──
  // הנמענת לוחצת, נפתחת טיוטה עם השאלות, היא ממלאת ציונים ושולחת.
  const draftLines: string[] = []
  draftLines.push(t('draft_intro'))
  draftLines.push('')
  for (const q of scaleQs) {
    draftLines.push(`${q.position}. ${q.text}: `)
  }
  if (textQs.length) {
    draftLines.push('')
    for (const q of textQs) {
      draftLines.push(`${q.text}: `)
    }
  }

  const draftSubject = `משוב · ${opts.recoveryHome ?? 'בית החלמה'}`
  const draftMailto =
    `mailto:${opts.replyTo}` +
    `?subject=${encodeURIComponent(draftSubject)}` +
    `&body=${encodeURIComponent(draftLines.join('\n'))}`

  const body = `
    <p style="margin:0 0 18px;color:#0f172a;font-size:16px;font-weight:700;">${greetMrs(opts.familyName, opts.motherName)}</p>

    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;">
      ${t('opening').replace(/\{בית_החלמה\}/g, homeName)}
    </p>

    <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.9;">
      ${t('intro')}
    </p>

    ${btn(opts.formUrl, t('button'), '#1B3256')}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 12px;">
      <tr><td style="text-align:center;">
        <p style="margin:0;color:#64748b;font-size:13.5px;line-height:1.7;">
          ${t('fallback_note')}
        </p>
      </td></tr>
    </table>

    ${btn(draftMailto, t('mail_button'), '#f1f5f9', '#334155')}

    <p style="margin:12px 0 0;color:#94a3b8;font-size:12px;line-height:1.7;text-align:center;">
      ${T('footnote')}
    </p>`
  return {
    subject: t('subject'),
    html: shell({
      preheader: t('preheader'),
      accent: '#1B3256',
      title: t('title'),
      subtitle: t('subtitle'),
      body,
    }),
  }
}

// ─── קוד אימות כתובת מייל ───────────────────────────────────────────────────
// מייל פשוט ועצמאי (לא דרך shell) — נשלח מ-lib/verifyChannel.ts. הוא יושב כאן
// כדי שכל תבניות המייל יהיו במקום אחד, ושהטקסטים יהיו ניתנים לעריכה כרגיל.
export function verifyCodeEmail(code: string): BuiltEmail {
  const t = (k: string) => textFor('verify_code_email', k)
  const T = (k: string) => escapeHtml(t(k))
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/></head>
  <body style="direction:rtl;text-align:right;font-family:Arial,sans-serif;background:#f1f5f9;padding:24px;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#4f46e5;color:#fff;padding:20px 24px;font-size:18px;font-weight:700;">${T('header')}</div>
      <div style="padding:24px;color:#1e293b;font-size:15px;line-height:1.7;">
        <p style="margin:0 0 12px;">${T('intro')}</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#4f46e5;text-align:center;background:#eef2ff;border-radius:12px;padding:16px 0;margin:8px 0 16px;">${escapeHtml(code)}</div>
        <p style="margin:0 0 8px;">${t('ttl_note')}</p>
        <p style="margin:0 0 12px;color:#64748b;font-size:13px;">${T('ignore_note')}</p>
      </div>
      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 24px;">
        <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;text-align:center;">${T('footer')}</p>
      </div>
    </div>
  </body></html>`
  return { subject: t('subject'), html }
}

// ─── אישור קבלת דברי הברכה ──────────────────────────────────────────────────
export function gratitudeReceivedEmail(opts: {
  familyName?: string | null
  motherName?: string | null
}): BuiltEmail {
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('gratitude_received', k)
  const T = (k: string) => escapeHtml(t(k))
  const body = `
    <p style="margin:0 0 18px;color:#0f172a;font-size:16px;font-weight:700;">${greetMrs(opts.familyName, opts.motherName)}</p>

    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;">
      ${T('intro')}
    </p>

    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;">
      ${T('thanks')}
    </p>

    <p style="margin:0;color:#64748b;font-size:14px;line-height:1.8;">
      ${T('attachment_note')}
    </p>`
  return {
    subject: t('subject'),
    html: shell({
      preheader: t('preheader'),
      accent: '#C69D2D',
      title: t('title'),
      subtitle: t('subtitle'),
      body,
    }),
  }
}
