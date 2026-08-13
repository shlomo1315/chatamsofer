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
      <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;font-family:'Heebo',Arial,sans-serif;">
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
         style="display:block;padding:15px 24px;font-family:'Heebo',Arial,sans-serif;font-size:15px;font-weight:700;color:${textColor};text-decoration:none;border-radius:14px;text-align:center;">
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
               style="display:block;padding:14px 12px;font-family:'Heebo',Arial,sans-serif;font-size:14px;font-weight:700;color:${text1};text-decoration:none;border-radius:14px;text-align:center;">
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
               style="display:block;padding:14px 12px;font-family:'Heebo',Arial,sans-serif;font-size:14px;font-weight:700;color:${text2};text-decoration:none;border-radius:14px;text-align:center;">
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
      <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.7;font-family:'Heebo',Arial,sans-serif;text-align:center;">
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
  draftLinks?: { label: string; href: string; open?: boolean }[],
  maritalStatus?: string | null,
  gates?: { maternity?: boolean; gemach?: boolean; financial_aid?: boolean; widows?: boolean },
  // ⚠️ חלוקת החגים אינה "שער מחלקה" אלא חלוקה קונקרטית שהרישום אליה פתוח או
  // סגור. לכן אין כאן מתג שני בהגדרות — הכפתור מופיע כשיש חלוקה פתוחה בפועל,
  // ונעלם מעצמו כשהרישום נסגר. מתג נפרד היה נפרד מהמציאות ביום שבו נסגר הרישום.
  holiday?: { open: boolean; name?: string | null } | null,
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
  // ⚠️ מחלקה סגורה (בהגדרות) לא מציגה כפתור בקשה כלל. אם gates לא הועבר —
  // מציגים הכל (תאימות לאחור). מחלקה שאינה מוגדרת נחשבת פתוחה.
  const deptOpen = (d: 'maternity' | 'gemach' | 'financial_aid' | 'widows') => !gates || gates[d] !== false
  const gap = '<div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>'
  const buttons = [
    (married && deptOpen('maternity')) ? btn(`${base}/?action=birth`, t('btn_birth'), '#fce7f3', '#9d174d') : '',
    deptOpen('gemach') ? btn(`${base}/?action=loan`, t('btn_loan'), '#e0f2fe', '#075985') : '',
    deptOpen('financial_aid') ? btn(`${base}/?action=aid`, t('btn_aid'), '#dcfce7', '#166534') : '',
    (widower && deptOpen('widows')) ? btn(`${base}/?action=aid`, t('btn_widow'), '#ede9fe', '#5b21b6') : '',
    // חלוקת חגים — רק כשהרישום פתוח בפועל. שם החלוקה נכנס לטקסט הכפתור אם יש.
    holiday?.open
      ? btn(`${base}/?action=holiday`,
          holiday.name ? `${t('btn_holiday')} (${holiday.name})` : t('btn_holiday'),
          '#ccfbf1', '#0f766e')
      : '',
    // עדכון פרטים אישיים — זמין תמיד, ללא תלות בשערי המחלקות: אינו בקשה
    // להטבה אלא תיקון הפרטים של המשפחה עצמה.
    btn(`${base}/?action=details`, t('btn_details'), '#f1f5f9', '#334155'),
  ].filter(Boolean).join(gap)
  const draftBlock = (draftLinks && draftLinks.length) ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
      <tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 10px;color:#9a3412;font-size:17px;font-weight:800;">${T('draft_title')}</p>
        <p style="margin:0 0 12px;color:#9a3412;font-size:14px;line-height:1.8;">${T('draft_note')}</p>
        ${draftLinks.map(l => l.open === false
          ? `<span style="display:inline-block;margin:0 0 8px;color:#94a3b8;font-size:15px;font-weight:700;">${l.label} — המערכת בפיתוח ואפשרות זו תיפתח בעזרת השם בימים הקרובים</span><br/>`
          : `<a href="${l.href}" style="display:inline-block;margin:0 0 8px;color:#c2410c;font-size:15px;font-weight:700;text-decoration:underline;">${l.label}</a><br/>`).join('')}
      </td></tr>
    </table>` : ''
  const detailsRows = (details ?? []).map(([l, v]) => detailRow(l, v != null && v !== '' ? String(v) : '')).join('')
  const detailsTable = detailsRows ? `
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;font-family:'Heebo',Arial,sans-serif;">${T('details_title')}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${detailsRows}</table>` : ''
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:'Heebo',Arial,sans-serif;">${greet}</p>
    ${detailsTable}
    <p style="margin:0 0 20px;color:#334155;font-size:14px;line-height:1.8;font-family:'Heebo',Arial,sans-serif;">
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
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:'Heebo',Arial,sans-serif;">${greet}</p>
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
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:'Heebo',Arial,sans-serif;">${greet}</p>
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
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:'Heebo',Arial,sans-serif;">${greet}</p>
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
// ת"ז והספח נדרשים כשני צילומים נפרדים — הספח הוא הדף הנלווה שבו מופיעים הילדים.
export function requiredDocLabels(maritalStatus?: string | null): string[] {
  if (maritalStatus === 'נשואים') {
    return [
      'תעודת זהות של הבעל',
      'ספח תעודת הזהות של הבעל',
      'תעודת זהות של האשה',
      'ספח תעודת הזהות של האשה',
    ]
  }
  return ['תעודת זהות', 'ספח תעודת הזהות']
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
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('registration_approved', k)
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

    <!-- הסטטוס אינו מוצג במיילים — מוצג רק בממשק הניהול. -->

    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">${escapeHtml(t('details_title'))}</p>
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
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#22c55e', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── מענה אוטומטי לצאצא קיים ──────────────────────────────────────────────────
// (תוויות הסטטוס בעברית הוסרו — הסטטוס אינו מוצג עוד במיילים.)

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
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('existing_contact', k)
  const base = portalBase.replace(/\/$/, '')
  // הסטטוס עצמו אינו מוצג במייל (ממשק הניהול בלבד), אך עדיין קובע את
  // ניסוח ההנחיה למטה — מאושר מפנה למערכת, אחרת לטיפול המשרד.
  const isApproved = b.eligibility_status === 'approved'

  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(t('kicker'))}</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(null, b.name, b.marital_status)}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">
      ${escapeHtml(t('intro'))}
    </p>

    <!-- Details card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;margin:0 0 24px;overflow:hidden;">
      ${detailRow('שם', b.name)}
      <!-- הסטטוס אינו מוצג במיילים — מוצג רק בממשק הניהול. -->
      ${detailRow('תעודת זהות', b.id_number)}
      ${detailRow('טלפון', b.phone)}
      ${detailRow('עיר', b.city)}
      ${detailRow('מצב משפחתי', b.marital_status)}
      ${b.children_count != null ? detailRow('מספר ילדים', String(b.children_count)) : ''}
    </table>

    <p style="margin:0 0 18px;color:#334155;font-size:15px;font-weight:700;text-align:center;">
      ${escapeHtml(isApproved ? t('next_approved') : t('next_pending'))}
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
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('registration_invite', k)
  const base = portalBase.replace(/\/$/, '')
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(t('kicker'))}</p>
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
      בלחיצה תגיעו למערכת הדיגיטלית שלנו — הזינו תעודת זהות לכניסה, או מלאו פרטים להרשמה חדשה.
    </p>
  `
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#6366f1', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── השלמת מסמכים ─────────────────────────────────────────────────────────────
export function docsPendingEmail(
  name: string,
  portalBase = PORTAL_BASE_DEFAULT,
  maritalStatus?: string | null,
  explicitDocs?: string[],
  extraNote?: string,
  lineageFixNote?: string | null,
): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('docs_pending', k)
  // כשהבקשה היא רק תיקון דורות (בלי מסמכים) — explicitDocs ריק במכוון ותיבת
  // המסמכים לא מוצגת; הנפילה לפי מצב משפחתי רלוונטית רק כשאין lineageFixNote.
  const docs = (explicitDocs && explicitDocs.length)
    ? explicitDocs
    : (lineageFixNote ? [] : requiredDocLabels(maritalStatus))
  const docsList = docs.map(d =>
    `<li style="margin:0 0 8px;color:#92400e;font-size:14px;font-weight:700;">${d}</li>`
  ).join('')

  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(t('kicker'))}</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(null, name, maritalStatus)}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">
      ${t('intro')}
    </p>

    ${docs.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#fffbeb;border-right:4px solid #f59e0b;border-radius:0 12px 12px 0;padding:18px 20px;">
        <p style="margin:0 0 10px;color:#92400e;font-size:14px;font-weight:800;">${escapeHtml(t('docs_title'))}</p>
        <ul style="margin:0;padding-right:20px;">${docsList}</ul>
      </td></tr>
    </table>` : ''}
    ${lineageFixNote && lineageFixNote.trim() ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#eef2ff;border-right:4px solid #6366f1;border-radius:0 12px 12px 0;padding:18px 20px;">
        <p style="margin:0 0 10px;color:#3730a3;font-size:14px;font-weight:800;">תיקון עץ הדורות</p>
        <p style="margin:0 0 10px;color:#4338ca;font-size:14px;line-height:1.7;">נמצא אי-דיוק בשרשרת הדורות שמסרת:</p>
        <p style="margin:0 0 10px;color:#312e81;font-size:14px;line-height:1.7;font-weight:700;">${escapeHtml(lineageFixNote.trim())}</p>
        <p style="margin:0;color:#4338ca;font-size:14px;line-height:1.7;">בכניסה לאזור האישי תתבקש/י לעדכן את שרשרת הדורות מחדש.</p>
      </td></tr>
    </table>` : ''}
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
  draftLinks?: { label: string; href: string; open?: boolean }[],
  // מצב הפתיחה/סגירה של המחלקות — כפתור של מחלקה סגורה מוצג אפור עם "בפיתוח".
  // לא הועבר → כל הכפתורים פעילים (התנהגות קיימת).
  gates?: { maternity?: boolean; gemach?: boolean; financial_aid?: boolean; widows?: boolean },
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
        ${draftLinks.map(l => l.open === false
          ? `<span style="display:inline-block;margin:0 0 8px;color:#94a3b8;font-size:15px;font-weight:700;">${escapeHtml(l.label)} — המערכת בפיתוח ואפשרות זו תיפתח בעזרת השם בימים הקרובים</span><br/>`
          : `<a href="${l.href}" style="display:inline-block;margin:0 0 8px;color:#c2410c;font-size:15px;font-weight:700;text-decoration:underline;">${escapeHtml(l.label)}</a><br/>`).join('')}
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
    ${(() => {
      // כפתור מחלקה: פעיל אם פתוחה (או שלא הועבר מצב שערים), אחרת אפור עם "בפיתוח".
      // ⚠️ מקור האמת: ההגדרות בדף הניהול (gates). מחלקה סגורה = לא מפנה לטופס.
      const grayBtn = (label: string) =>
        `<div style="display:block;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;border-radius:12px;padding:14px 20px;text-align:center;font-size:15px;font-weight:700;">${label}<br/><span style="font-size:12px;font-weight:600;">המערכת בפיתוח ואפשרות זו תיפתח בעזרת השם בימים הקרובים</span></div>`
      const gatedBtn = (open: boolean | undefined, href: string, label: string, bg: string, fg: string) =>
        (gates && open === false) ? grayBtn(label) : btn(href, label, bg, fg)
      return [
        married ? gatedBtn(gates?.maternity, `${base}/?action=birth`, t('btn_birth'), '#fce7f3', '#9d174d') : '',
        gatedBtn(gates?.gemach, `${base}/?action=loan`, t('btn_loan'), '#e0f2fe', '#075985'),
        gatedBtn(gates?.financial_aid, `${base}/?action=aid`, t('btn_aid'), '#dcfce7', '#166534'),
        widowerBen ? gatedBtn(gates?.widows, `${base}/?action=aid`, t('btn_widow'), '#ede9fe', '#5b21b6') : '',
        // עדכון פרטים אישיים — תמיד פעיל, אינו כפוף לשערי המחלקות
        btn(`${base}/?action=details`, t('btn_details'), '#f1f5f9', '#334155'),
      ].filter(Boolean).join('<div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>')
    })()}
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
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const tAid = (k: string) => textFor('financial_aid_inquiry', k)
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
    html: shell({ preheader: tAid('preheader'), accent: '#6366f1', title: tAid('title'), subtitle: tAid('subtitle'), body }),
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

export type FoodCardCenter = { name: string; city?: string | null; address?: string | null; pickup_days?: string | null; pickup_hours?: string | null }

export function birthApprovedEmail(
  b: RequestApprovedBeneficiary,
  birth: { baby_name?: string | null; baby_gender?: string | null; birth_date?: string | null; recovery_home?: string | null },
  opts: { centers?: FoodCardCenter[]; serial?: string | null; phones?: (string | null | undefined)[]; cardInStock?: boolean } = {},
): BuiltEmail {
  // כשאין מלאי כרטיסים — לא מצרפים שובר כרטיס ולא מציגים בלוק כרטיס/מוקדים. במקום זאת
  // מוצגת הודעה שהכרטיס יישלח כשיתחדש המלאי. ברירת מחדל true (תאימות אחורה).
  const cardInStock = opts.cardInStock !== false
  // כל המוקדים הפעילים — היולדת יכולה לגשת לכל אחד מהם (אין יותר בחירת מוקד/מלאי)
  const centers = (opts.centers ?? []).filter(c => c?.name)
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
  // בלוק כרטיס המזון — תמיד מוצג, עם רשימת כל המוקדים הפעילים.
  // היולדת יכולה לגשת לכל אחד מהם לקבלת הכרטיס.
  const centerRows = centers.map(c => {
    const place = [c.address, c.city].filter(Boolean).join(', ')
    const sched = [c.pickup_days, c.pickup_hours].filter(Boolean).join(' · ')
    const meta = [place, sched].filter(Boolean).join(' · ')
    return `<tr><td style="padding:10px 16px;border-top:1px solid #fef3c7;">
        <span style="color:#92400e;font-size:15px;font-weight:800;">${escapeHtml(c.name)}</span>
        ${meta ? `<br/><span style="color:#b45309;font-size:13px;">${escapeHtml(meta)}</span>` : ''}
      </td></tr>`
  }).join('')
  const centersTable = centers.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 0;border:1px solid #fcd34d;border-radius:10px;overflow:hidden;background:#ffffff;">${centerRows}</table>`
    : ''
  // בלוק כרטיס המזון — רק כשיש מלאי. אחרת מציגים הודעת "אין כרגע מלאי".
  const foodCardBlock = cardInStock ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#b45309;font-size:15px;font-weight:900;">${T('card_title')}</p>
        <p style="margin:0;color:#92400e;font-size:14px;line-height:1.7;">
          ${t('card_text')}
        </p>
        <p style="margin:12px 0 0;color:#92400e;font-size:14px;font-weight:800;line-height:1.7;">
          תוכלו לבחור בכל מוקד לקבלת הכרטיס:
        </p>
        ${centersTable}
      </td></tr>
    </table>
    ${cardActivationNotice(opts.phones)}` : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#b45309;font-size:15px;font-weight:900;">כרטיס מזון — יישלח בהמשך</p>
        <p style="margin:0;color:#92400e;font-size:14px;line-height:1.7;">
          כרטיס המזון עבורכם יישלח אליכם במייל נפרד בימים הקרובים. שובר הכרטיס אינו מצורף להודעה זו —
          מיד עם הכנתו תקבלו הודעת עדכון ובה שובר הכרטיס לאיסוף. תודה על הסבלנות.
        </p>
      </td></tr>
    </table>`
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px 18px;text-align:center;">
        <p style="margin:0;color:#3730a3;font-size:15px;font-weight:900;line-height:1.7;">${T('vouchers_title')}</p>
        <p style="margin:4px 0 0;color:#4338ca;font-size:13px;line-height:1.7;">${cardInStock ? T('vouchers_note') : T('vouchers_note_no_stock')}</p>
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

// ─── דחיית בקשת לידה — מייל ליולדת עם סיבת הדחייה ─────────────────────────────
// נשלח כשדוחים בקשת לידה (סטטוס 'cancelled'), בין אם מבקשה ממתינה ובין אם
// מבטלים לידה שכבר אושרה. הפנייה היא ליולדת (מרת), והסיבה שהוזנה מוצגת בבירור.
export function birthRejectedEmail(opts: {
  family_name?: string | null
  mother_name?: string | null   // שם האשה (spouse_name / full_name)
  reason?: string | null
}): BuiltEmail {
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('birth_rejected', k)
  const greet = greetMrs(opts.family_name, opts.mother_name)
  const reason = (opts.reason ?? '').trim()
  const officeLink = `<a href="mailto:${OFFICE_EMAIL}" style="color:#b91c1c;font-weight:700;text-decoration:none;">${OFFICE_EMAIL}</a>`
  const reasonBlock = reason ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 8px;color:#b91c1c;font-size:14px;font-weight:900;">${escapeHtml(t('reason_title'))}</p>
        <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.8;white-space:pre-wrap;">${escapeHtml(reason)}</p>
      </td></tr>
    </table>` : ''
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:'Heebo',Arial,sans-serif;">${greet}</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;">
      ${escapeHtml(t('body'))}
    </p>
    ${reasonBlock}
    <p style="margin:14px 0 0;color:#334155;font-size:13px;line-height:1.7;">
      ${escapeHtml(t('office_note')).replace(/\{מייל_משרד\}/g, officeLink)}
    </p>
    ${noReplyBox()}`
  return {
    subject: t('subject'),
    html: shell({
      preheader: t('preheader'),
      accent: '#dc2626',
      title: t('title'),
      subtitle: t('subtitle'),
      body,
    }),
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

// ─── תזכורת: הכרטיס נטען אך טרם שויך/נאסף ─────────────────────────────────────
// נשלחת יומיים אחרי הטענת הכרטיס (ושוב שבוע נוסף) אם היולדת עדיין לא ביצעה את
// השיוך הטלפוני בנדרים / לא אספה את הכרטיס. כוללת את רשימת כל המוקדים הפעילים.
export function cardPickupReminderEmail(opts: {
  familyName?: string | null
  motherName?: string | null
  isSecond?: boolean
  centers: { name?: string | null; city?: string | null; address?: string | null; pickup_days?: string | null; pickup_hours?: string | null }[]
}): BuiltEmail {
  const greet = greetMrs(opts.familyName, opts.motherName)
  const centerRows = opts.centers.length
    ? opts.centers.map(c => {
        const loc = [c.city, c.address].filter(Boolean).map(escapeHtml).join(', ')
        const when = [c.pickup_days, c.pickup_hours].filter(Boolean).map(escapeHtml).join(' · ')
        return `<tr><td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
          <p style="margin:0;color:#0f172a;font-size:15px;font-weight:800;">${escapeHtml(c.name)}</p>
          ${loc ? `<p style="margin:3px 0 0;color:#475569;font-size:13px;">${loc}</p>` : ''}
          ${when ? `<p style="margin:3px 0 0;color:#059669;font-size:12px;font-weight:600;">${when}</p>` : ''}
        </td></tr>`
      }).join('')
    : `<tr><td style="padding:12px 14px;color:#64748b;font-size:14px;">פרטי המוקדים יימסרו במשרד.</td></tr>`

  const body = `
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greet},</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#fffbeb;border-right:4px solid #f59e0b;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#92400e;font-size:16px;font-weight:800;">
          ${opts.isSecond ? 'תזכורת נוספת — ' : ''}המערכת מזהה שעדיין לא שויך כרטיס המזון שלכם.
        </p>
        <p style="margin:8px 0 0;color:#78350f;font-size:14px;line-height:1.7;">
          הכרטיס שלכם נטען ומוכן, אך טרם בוצע שיוך הכרטיס במערכת. במידה ועדיין לא לקחתם את
          הכרטיס במוקד — ניתן לגשת לאחד המוקדים הבאים לאיסוף.
        </p>
      </td></tr>
    </table>
    <p style="margin:0 0 10px;color:#0f172a;font-size:15px;font-weight:800;">מוקדי החלוקה:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${centerRows}</table>
    <p style="margin:0;color:#64748b;font-size:13px;">לבירורים ניתן לפנות למזכירות היכל החתם סופר.</p>
  `
  return {
    subject: opts.isSecond ? 'תזכורת נוספת — כרטיס המזון ממתין לאיסוף' : 'שימו לב — כרטיס המזון ממתין לאיסוף',
    html: shell({ preheader: 'כרטיס המזון שלכם נטען וממתין לאיסוף', accent: '#f59e0b', title: 'כרטיס המזון ממתין', subtitle: 'אגף עזר ליולדות · היכל החתם סופר', body }),
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
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const t = (k: string) => textFor('recovery_realized', k)
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">${escapeHtml(t('body'))}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${rows}</table>
  `
  return {
    subject: `מימוש זכאות החלמה · ${opts.motherName} · ${opts.home}`,
    html: shell({ preheader: `${opts.motherName} מימשה זכאות החלמה`, accent: '#059669', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── קישור אישי לתיקון סדר הדורות (נשלח לצאצא מהכרטסת) ──────────────────────
export function lineageOrderFixEmail(opts: {
  recipientName: string
  link: string
}): { subject: string; html: string } {
  // ⚠️ escapeHtml על שם הנמען: shell() אינו מנקה את body, ושם משפחה עם תו
  // מיוחד היה נשבר או נפתח להזרקה. (נתיב השיתוף הישן משרשר שם גולמי.)
  const body = `
    <p style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;">לכבוד משפחת ${escapeHtml(opts.recipientName)},</p>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">
      במסגרת עדכון מאגר צאצאי מרן החתם סופר זי"ע, נבקשכם לעבור על <strong>סדר הדורות</strong> הרשום אצלנו
      ולוודא שהוא מדויק. בקישור שלהלן יופיעו פרטיכם ושרשרת הדורות כפי שהיא במערכת,
      ותוכלו לתקן את הסדר במידת הצורך.
    </p>
    <div style="text-align:center;margin:0 0 18px;">
      <a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:16px;font-weight:800;text-decoration:none;border-radius:12px;padding:14px 32px;">
        לתיקון סדר הדורות
      </a>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;">הקישור אישי ותקף 7 ימים. לאחר התיקון יועבר לאישור המזכירות.</p>
    <!-- ⚠️ המשפט "אין להשיב" נכלל כאן בכוונה: sendMail מוסיף אוטומטית בלוק
         "הודעה זו נשלחה ממערכת אוטומטית" לכל מייל, ומדלג עליו כשהטקסט הזה
         כבר קיים. במייל אישי לצאצא הבלוק ההוא היה צורם, ודי בשורה אחת. -->
    <p style="margin:10px 0 0;color:#cbd5e1;font-size:11px;">אין להשיב למייל זה. לפניות: <a href="mailto:igud@chasamsofer.info" style="color:#a5b4fc;text-decoration:none;">igud@chasamsofer.info</a></p>
  `
  return {
    subject: 'תיקון סדר הדורות — איגוד צאצאי החתם סופר',
    html: shell({
      preheader: 'נא לעבור על סדר הדורות הרשום במאגר',
      accent: '#4f46e5',
      title: 'תיקון סדר הדורות',
      subtitle: 'איגוד צאצאי החתם סופר',
      body,
    }),
  }
}

// ─── התראה: תשלום משלים מבית ההחלמה (קבלה נוספת לרשומה שכבר הוגשה) ──────────
export function recoveryTopupEmail(opts: {
  home: string
  motherName: string
  amount: number
  total: number
  nights: number | null
  note: string
  receiptUrl: string
}): { subject: string; html: string } {
  const rows =
    detailRow('בית החלמה', opts.home) +
    detailRow('יולדת', opts.motherName) +
    detailRow('תוספת לגבייה', '₪' + opts.amount.toLocaleString('he-IL')) +
    detailRow('סה״כ מצטבר', '₪' + opts.total.toLocaleString('he-IL')) +
    detailRow('לילות נוספים', opts.nights != null ? String(opts.nights) : '—') +
    (opts.note ? detailRow('הערת בית ההחלמה', opts.note) : '')
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">בית החלמה <b>${escapeHtml(opts.home)}</b> הגיש תשלום משלים עבור <b>${escapeHtml(opts.motherName)}</b>. הסכום כבר נצבר לחשבון היולדת והקבלה נשמרה בכרטסת.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${rows}</table>
    <p style="margin:16px 0 0;"><a href="${escapeHtml(opts.receiptUrl)}" style="color:#0369a1;font-size:14px;">צפייה בקבלה המשלימה</a></p>
  `
  return {
    subject: `תשלום משלים · ${opts.motherName} · ${opts.home}`,
    html: shell({
      preheader: `תוספת ₪${opts.amount.toLocaleString('he-IL')} מ${opts.home}`,
      accent: '#0891b2',
      title: 'תשלום משלים מבית החלמה',
      subtitle: 'קבלה נוספת נקלטה והסכום עודכן',
      body,
    }),
  }
}

// ─── התראה: בית החלמה ביקש לתקן רשומה נעולה ─────────────────────────────────
export function recoveryEditRequestEmail(opts: {
  home: string
  motherName: string
}): { subject: string; html: string } {
  // הטקסטים ניתנים לעריכה במסך ההגדרות ("הודעות מייל").
  const tEdit = (k: string) => textFor('recovery_edit_request', k)
  const body = `
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">בית החלמה <b>${escapeHtml(opts.home)}</b> ביקש לתקן את הרשומה של היולדת <b>${escapeHtml(opts.motherName)}</b>.</p>
    <p style="margin:0;color:#475569;font-size:15px;line-height:1.8;">${escapeHtml(tEdit('locked_note'))}</p>
  `
  return {
    subject: `בקשת תיקון · ${opts.motherName} · ${opts.home}`,
    html: shell({ preheader: `בקשת תיקון מ${opts.home}`, accent: '#d97706', title: tEdit('title'), subtitle: tEdit('subtitle'), body }),
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
  <body style="direction:rtl;text-align:right;font-family:'Heebo',Arial,sans-serif;background:#f1f5f9;padding:24px;">
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

// ─────────────────────────────────────────────────────────────────────────────
// חזרה מאישור לידה — "המייל הקודם נשלח בטעות".
//
// ⚠️ למה זה נדרש: אישור לידה שולח מייל אישור וטוען כרטיס. כשמתברר שהאישור היה
// שגוי (הסטטוס מוחזר לממתין או שהבקשה נדחית) הטעינה נפרקת — אבל המשפחה נשארה
// עם מייל אישור ביד ועם ציפייה לכרטיס טעון. בלי הודעת תיקון מפורשת הפער הזה
// מתגלה רק בחנות, מול הקופה.
//
// הניסוח מכוון: אומר במפורש שהמייל הקודם נשלח בטעות, מה המצב עכשיו, ומה יקרה
// אם הבקשה תאושר בהמשך — בלי להיכנס לסיבת ההחלטה (היא נשלחת בנפרד בדחייה).
// ─────────────────────────────────────────────────────────────────────────────
export function birthApprovalRetractedEmail(
  name: string,
  opts: { rejected?: boolean } = {},
): BuiltEmail {
  const stateLine = opts.rejected
    ? 'בקשתכם <strong>נדחתה</strong>, ואינה מאושרת.'
    : 'בקשתכם <strong>אינה מאושרת בשלב זה</strong>, והיא ממתינה כעת לבדיקה ולאישור.'
  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:17px;font-weight:800;font-family:'Heebo',Arial,sans-serif;">שלום וברכה${name ? `, ${escapeHtml(name)}` : ''},</p>
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
      <p style="margin:0;color:#92400e;font-size:15px;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">
        המייל שקיבלתם מאיתנו על <strong>אישור בקשתכם</strong> נשלח אליכם <strong>בטעות</strong>.
        ${stateLine}
      </p>
    </div>
    <p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">
      אם בהמשך תאושר בקשתכם — תקבלו על כך הודעה נוספת במייל. עד אז אין צורך בפעולה מצדכם.
    </p>
    <p style="margin:0 0 6px;color:#334155;font-size:15px;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">
      אנו מתנצלים על הטעות ועל אי הנוחות.
    </p>
    <p style="margin:0;color:#0f172a;font-size:15px;font-weight:700;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">
      בברכה מרובה,<br/>היכל החתם סופר
    </p>`
  return {
    subject: 'עדכון בנוגע לבקשתכם — היכל החתם סופר',
    html: shell({
      preheader: 'המייל הקודם על אישור הבקשה נשלח בטעות — הבקשה אינה מאושרת בשלב זה.',
      accent: '#d97706',
      title: 'עדכון בנוגע לבקשתכם',
      subtitle: 'אגף עזר ליולדות · היכל החתם סופר',
      body,
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// חלוקות חגים — שני מיילים, בשני רגעים שונים.
//
// 1. holidayCallNoticeEmail — נשלח למי שנרשם *במערכת* (איגוד הצאצאים / נדרים):
//    הרישום לחלוקת החגים עצמה נעשה בשלוחה הטלפונית, וללא אותו רישום אין זכאות.
//    ⚠️ זו האזהרה הקריטית: משפחה שנרשמה לאיגוד בטוחה שסיימה, ובלי המייל הזה היא
//    מגלה רק בדיעבד שלא נרשמה לחלוקה. לכן מספר הטלפון והתאריך האחרון בולטים.
// 2. holidayRegisteredEmail — נשלח אחרי הרישום לחלוקה עצמה: אישור קליטה + מה
//    צפוי בהמשך (עדכון על אופן החלוקה).
//
// כל הטקסטים נקראים דרך textFor ולכן ניתנים לעריכה במסך "הודעות מייל" — מספר
// הטלפון והתאריך משתנים מחג לחג, ואין טעם שיהיו קבועים בקוד.
// ─────────────────────────────────────────────────────────────────────────────
export function holidayCallNoticeEmail(name: string, vars: { distribution?: string } = {}): BuiltEmail {
  const t = (k: string) => textFor('holiday_call_notice', k)
  const fill = (v: string) => v.replace(/\{חלוקה\}/g, vars.distribution ?? '')
  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:17px;font-weight:800;font-family:'Heebo',Arial,sans-serif;">שלום וברכה${name ? `, ${escapeHtml(name)}` : ''},</p>
    <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:14px 16px;margin:0 0 18px;">
      <p style="margin:0;color:#065f46;font-size:16px;font-weight:800;font-family:'Heebo',Arial,sans-serif;">${escapeHtml(fill(t('intro')))}</p>
    </div>
    <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
      <p style="margin:0 0 10px;color:#991b1b;font-size:15px;font-weight:800;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">${escapeHtml(fill(t('phone_title')))}</p>
      <p style="margin:0 0 12px;text-align:center;">
        <span style="display:inline-block;background:#dc2626;color:#fff;font-size:24px;font-weight:900;letter-spacing:2px;border-radius:12px;padding:12px 26px;direction:ltr;">${escapeHtml(t('phone'))}</span>
      </p>
      <p style="margin:0;color:#991b1b;font-size:14px;font-weight:700;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">${escapeHtml(fill(t('warning')))}</p>
    </div>
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:14px 16px;margin:0 0 18px;">
      <p style="margin:0;color:#92400e;font-size:15px;font-weight:800;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">${escapeHtml(fill(t('deadline')))}</p>
    </div>
    <p style="margin:0;color:#0f172a;font-size:15px;font-weight:700;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">בברכה מרובה,<br/>היכל החתם סופר</p>`
  return {
    subject: fill(t('subject')),
    html: shell({ preheader: fill(t('preheader')), accent: '#0f766e', title: fill(t('title')), subtitle: fill(t('subtitle')), body }),
  }
}

export function holidayRegisteredEmail(name: string, vars: { distribution?: string } = {}): BuiltEmail {
  const t = (k: string) => textFor('holiday_registered', k)
  const fill = (v: string) => v.replace(/\{חלוקה\}/g, vars.distribution ?? '')
  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:17px;font-weight:800;font-family:'Heebo',Arial,sans-serif;">שלום וברכה${name ? `, ${escapeHtml(name)}` : ''},</p>
    <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
      <p style="margin:0;color:#065f46;font-size:16px;font-weight:800;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">${escapeHtml(fill(t('intro')))}</p>
    </div>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">${escapeHtml(fill(t('next')))}</p>
    <p style="margin:0;color:#0f172a;font-size:15px;font-weight:700;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">בברכה מרובה,<br/>היכל החתם סופר</p>`
  return {
    subject: fill(t('subject')),
    html: shell({ preheader: fill(t('preheader')), accent: '#0f766e', title: fill(t('title')), subtitle: fill(t('subtitle')), body }),
  }
}

// holidayAlreadyRegisteredEmail — נשלח כשמישהו מנסה להירשם שוב לאותה חלוקה.
// ⚠️ אינו הודעת שגיאה: המשפחה כבר רשומה, ומטרת המייל להרגיע ("הרישום שלכם כבר
// נקלט") ולציין את *תאריך הרישום המקורי* — כדי שיהיה ברור שלא נוצר רישום כפול.
export function holidayAlreadyRegisteredEmail(
  name: string,
  vars: { distribution?: string; registeredAt?: string | null } = {},
): BuiltEmail {
  const distName = vars.distribution ?? 'חלוקת החגים'
  let dateStr = ''
  if (vars.registeredAt) {
    try { dateStr = new Date(vars.registeredAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { dateStr = '' }
  }
  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:17px;font-weight:800;font-family:'Heebo',Arial,sans-serif;">שלום וברכה${name ? `, ${escapeHtml(name)}` : ''},</p>
    <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
      <p style="margin:0 0 6px;color:#065f46;font-size:16px;font-weight:800;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">הבקשה שלכם ל${escapeHtml(distName)} כבר נקלטה במערכת, נשלח לכם הודעה מסודרת לגבי ההמשך.</p>
      ${dateStr ? `<p style="margin:0;color:#047857;font-size:14px;font-weight:700;font-family:'Heebo',Arial,sans-serif;">תאריך הרישום: ${escapeHtml(dateStr)}</p>` : ''}
    </div>
    <p style="margin:0;color:#0f172a;font-size:15px;font-weight:700;line-height:1.9;font-family:'Heebo',Arial,sans-serif;">בברכה מרובה,<br/>היכל החתם סופר</p>`
  return {
    subject: `רישומכם ל${distName} כבר נקלט`,
    html: shell({ preheader: 'הרישום שלכם כבר קיים במערכת', accent: '#0f766e', title: 'כבר רשומים', subtitle: distName, body }),
  }
}

// ─── חלוקת חגים — הודעת אישור לנרשם ─────────────────────────────────────────
// נשלחת אחרי שהצוות אישר את הבקשה. המטרה מעשית: להודיע שהבקשה אושרה, ומה
// לעשות עכשיו — לאסוף כרטיס ולשייך אותו (בטלפון או בממשק).
//
// ⚠️ מספר השלוחה מגיע כפרמטר ואינו קבוע בקוד: הוא נקבע מול ימות ומשתנה, וקידוד
// שלו כאן היה שולח משפחות לשלוחה שאינה קיימת.
export function holidayApprovedEmail(opts: {
  familyName?: string | null
  spouseName?: string | null
  distributionName: string
  amount?: number | null
  phoneExtension?: string | null
  portalBase?: string
}): BuiltEmail {
  const base = opts.portalBase || PORTAL_BASE_DEFAULT
  const name = [opts.familyName, opts.spouseName].filter(Boolean).join(' ')
  const dist = escapeHtml(opts.distributionName)
  const amount = Number(opts.amount ?? 0)
  const body = `
    <p style="margin:0 0 8px;color:#0d9488;font-size:13px;font-weight:700;letter-spacing:0.5px;">הבקשה אושרה</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetHe(name)}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#f0fdfa;border-right:4px solid #0d9488;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#0f766e;font-size:15px;font-weight:800;">
          בקשתכם לחלוקת ${dist} אושרה
        </p>
      </td></tr>
    </table>
    ${amount > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:18px 22px;text-align:center;">
        <p style="margin:0;color:#065f46;font-size:13px;font-weight:600;">הסכום לחלוקה</p>
        <p style="margin:6px 0 0;color:#047857;font-size:30px;font-weight:900;" dir="ltr">₪${amount.toLocaleString('he-IL')}</p>
      </td></tr>
    </table>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;">
        <p style="margin:0;color:#1e40af;font-size:15px;font-weight:800;">מה עושים עכשיו</p>
        <p style="margin:8px 0 0;color:#1e3a8a;font-size:14px;line-height:1.9;">
          לאחר קבלת הכרטיס במוקד יש <strong>לשייך אותו</strong> כדי שיהיה פעיל${
            opts.phoneExtension
              ? ` — בשלוחה <strong dir="ltr">${escapeHtml(opts.phoneExtension)}</strong> במוקד הטלפוני, בהקשה 2`
              : ' — בשלוחה הטלפונית של החלוקות, בהקשה 2'
          }, או בממשק האישי.
          <br />כרטיס שלא שויך אינו פעיל ולא ניתן להשתמש בו.
        </p>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr><td style="background:#0d9488;border-radius:12px;">
        <a href="${base}?action=holiday" style="display:inline-block;padding:13px 30px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;">
          לממשק האישי
        </a>
      </td></tr>
    </table>
  `
  return {
    subject: `בקשתכם לחלוקת ${opts.distributionName} אושרה — היכל החתם סופר`,
    html: shell({
      preheader: `בקשתכם לחלוקת ${opts.distributionName} אושרה. לאחר קבלת הכרטיס יש לשייך אותו כדי שיהיה פעיל.`,
      accent: '#0d9488', title: 'הבקשה אושרה', subtitle: `חלוקת ${opts.distributionName}`, body,
    }),
  }
}

// ─── בקשה לאמת את כתובת המייל ────────────────────────────────────────────────
// נשלחת יזומה ממסך ההגדרות לנרשמים שכתובתם טרם אומתה (email_verified_at ריק).
//
// ⚠️ אין כאן קוד ואין קישור אימות חד-פעמי, בכוונה: אימות מייל מחייב סשן פורטל
// תקף (ראו app/api/portal/verify-email) — אחרת מי שיודע ת"ז של אדם אחר היה
// משייך לרשומתו כתובת בשליטתו ומשם נכנס לחשבון. לכן הכפתור מוביל לכניסה
// רגילה לאזור האישי, וחלונית האימות נפתחת שם אוטומטית.
export function emailVerifyRequestEmail(
  familyName: string,
  portalBase = PORTAL_BASE_DEFAULT,
): BuiltEmail {
  const t = (k: string) => textFor('email_verify_request', k)
  const base = portalBase.replace(/\/$/, '')
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(t('kicker'))}</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${escapeHtml(t('greeting').replace(/\{שם\}/g, familyName || ''))}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">${t('intro')}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#fefce8;border-right:4px solid #eab308;border-radius:0 12px 12px 0;padding:18px 20px;">
        <p style="margin:0 0 6px;color:#854d0e;font-size:14px;font-weight:800;">${escapeHtml(t('why_title'))}</p>
        <p style="margin:0;color:#713f12;font-size:13px;line-height:1.7;">${t('why_text')}</p>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#eef2ff;border-right:4px solid #6366f1;border-radius:0 12px 12px 0;padding:18px 20px;">
        <p style="margin:0 0 6px;color:#3730a3;font-size:14px;font-weight:800;">${escapeHtml(t('how_title'))}</p>
        <p style="margin:0;color:#4338ca;font-size:13px;line-height:1.6;">${t('how_text')}</p>
      </td></tr>
    </table>

    <div style="margin:0 0 12px;">${btn(`${base}/`, t('button'), '#4f46e5')}</div>

    <p style="margin:28px 0 0;color:#94a3b8;font-size:13px;line-height:1.7;text-align:center;">${t('footnote')}</p>
  `
  return {
    subject: t('subject'),
    html: shell({ preheader: t('preheader'), accent: '#6366f1', title: t('title'), subtitle: t('subtitle'), body }),
  }
}

// ─── טופס חתימת רב — המייל שנושא את הטופס להחתמה ──────────────────────────────
//
// 🔴 המייל הזה נושא שתי הוראות שבלעדיהן הטופס חוזר ולא נקלט:
//   1. חובה להשיב *לאותה הודעה* — כך נשמרות כותרות השרשור, וזו הדרך
//      הנקייה לקשר את הטופס החוזר לבקשה.
//   2. הסריקה חייבת להיות ישרה וברורה — טופס עקום או מטושטש אינו קריא
//      ואינו יכול לשמש כאסמכתה חתומה.
//
// ⚠️ ההוראות מודגשות ויזואלית ולא נטמעות בפסקה: מי שמקבל מייל עם קובץ
// מצורף סורק אותו בעיניים ומחפש את הקובץ. הוראה שנקברת בטקסט רץ פשוט
// לא נקראת, והטופס חוזר בדרך הלא נכונה.
export function rabbiFormEmail(opts: {
  familyName?: string | null
  applicantName?: string | null
  amount?: number | null
  code: string
}): BuiltEmail {
  const who = [opts.familyName, opts.applicantName].filter(Boolean).join(' ')
  const greeting = who ? `לכבוד משפחת ${escapeHtml(who)},` : 'שלום וברכה,'
  const amountLine = opts.amount != null
    ? `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.9;">
         בקשתכם להלוואה על סך
         <strong style="color:#0f172a;">${Math.round(Number(opts.amount)).toLocaleString('en-US')}$</strong>
         נשמרה במערכת וממתינה לטופס חתימת הרב.
       </p>`
    : ''

  const body = `
    <p style="margin:0 0 18px;color:#0f172a;font-size:16px;font-weight:700;">${greeting}</p>
    ${amountLine}

    <p style="margin:0 0 22px;color:#334155;font-size:15px;line-height:1.9;">
      מצורף למייל זה טופס חתימת רב. יש להדפיס אותו, להחתים את הרב, ולהחזירו אלינו לפי ההוראות שלהלן.
    </p>

    <!-- 🔴 הוראה 1 — השבה לאותה הודעה -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td style="background:#fef2f2;border:2px solid #fecaca;border-radius:14px;padding:20px 22px;">
        <p style="margin:0 0 10px;color:#991b1b;font-size:16px;font-weight:900;">
          חובה להשיב לְהודעה זו בלבד
        </p>
        <p style="margin:0 0 12px;color:#7f1d1d;font-size:14px;line-height:1.85;">
          לאחר החתמת הרב, לחצו על <strong>"השב" (Reply)</strong> על המייל הזה עצמו, וצרפו את הטופס הסרוק.
        </p>
        <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.85;">
          <strong>אין לפתוח מייל חדש</strong> ואין לשלוח לכתובת אחרת — רק כך המערכת מזהה
          לאיזו בקשה הטופס שייך. טופס שיישלח בהודעה חדשה לא ישויך לבקשתכם.
        </p>
      </td></tr>
    </table>

    <!-- מזהה הבקשה — עוגן גיבוי לזיהוי -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;text-align:center;">
        <p style="margin:0 0 6px;color:#64748b;font-size:13px;">מספר הבקשה שלכם</p>
        <p style="margin:0;color:#0f172a;font-size:22px;font-weight:900;letter-spacing:2px;" dir="ltr">#${escapeHtml(opts.code)}</p>
        <p style="margin:8px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
          המספר מופיע בשורת הנושא — אין למחוק אותו כאשר משיבים.
        </p>
      </td></tr>
    </table>

    <!-- 🔴 הוראה 2 — איכות הסריקה -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr><td style="background:#fffbeb;border:2px solid #fde68a;border-radius:14px;padding:20px 22px;">
        <p style="margin:0 0 10px;color:#92400e;font-size:16px;font-weight:900;">
          הסריקה חייבת להיות ישרה וברורה
        </p>
        <p style="margin:0 0 10px;color:#78350f;font-size:14px;line-height:1.85;">
          סרקו את הטופס <strong>ישר, ללא הטיה וללא עיוות</strong>, בתאורה טובה ובאיכות גבוהה.
          יש לוודא שכל הפרטים <strong>וחתימת הרב</strong> נראים בבירור.
        </p>
        <p style="margin:0;color:#78350f;font-size:14px;line-height:1.85;">
          <strong>טופס עקום, חתוך, מטושטש או חלקי — לא ייקלט,</strong> והבקשה תעוכב עד לקבלת סריקה תקינה.
        </p>
      </td></tr>
    </table>

    <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.7;">
      הבקשה תיכנס לטיפול רק לאחר קבלת הטופס החתום. בכל שאלה — ניתן להשיב להודעה זו.
    </p>`

  return {
    subject: `טופס חתימת רב · בקשת הלוואה #${opts.code}`,
    html: shell({
      preheader: 'חובה להשיב להודעה זו בלבד, עם הטופס החתום סרוק ישר וברור',
      accent: '#4f46e5',
      title: 'טופס חתימת רב',
      subtitle: 'גמ״ח היכל החתם סופר',
      body,
    }),
  }
}
