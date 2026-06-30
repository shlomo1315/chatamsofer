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
const LOGO_URL = `${PORTAL_BASE_DEFAULT.replace(/\/$/, '')}/logo.png`

// פתיח מכובד אחיד לכל המיילים: "שלום וברכה, הרב <שם> הי״ו,"
export function greetHe(name?: string | null): string {
  const n = (name ?? '').trim()
  return n ? `שלום וברכה, הרב ${n} הי״ו,` : 'שלום וברכה,'
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
  return female ? `שלום וברכה, הרבנית ${nm} תחי׳,` : `שלום וברכה, הרב ${nm} הי״ו,`
}

// פתיח למיילי יולדות — הפנייה ליולדת (האשה): "שלום וברכה, מרת <משפחה> <שם האשה> תחי׳,"
export function greetMrs(familyName?: string | null, motherName?: string | null): string {
  const nm = [familyName, motherName].filter(Boolean).join(' ').trim()
  return nm ? `שלום וברכה, מרת ${nm} תחי׳,` : 'שלום וברכה,'
}

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
export function shell(opts: {
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
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&display=swap" rel="stylesheet"/>
  <style>* { font-family: 'Heebo', Arial, sans-serif !important; }</style>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Heebo',Arial,sans-serif;direction:rtl;">
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

// ─── הודעת "אל תשיבו" מודגשת (לתחתית מיילים אוטומטיים מהאיגוד) ───────────────
function noReplyBox(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
    <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 18px;">
      <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.7;font-family:Arial,sans-serif;text-align:center;">
        ⚠️ מייל זה נשלח <strong>באופן אוטומטי</strong> ואין להשיב אליו —
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
): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  const accent = '#4f46e5'
  const greet = greetHe(name)
  const draftBlock = (draftLinks && draftLinks.length) ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
      <tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 10px;color:#9a3412;font-size:17px;font-weight:800;">להגשה גם דרך האימייל:</p>
        <p style="margin:0 0 12px;color:#9a3412;font-size:14px;line-height:1.8;">רק באם אינכם מצליחים להיכנס למערכת הדיגיטלית שלנו, פיתחנו עבורכם אפשרות לשליחת טפסים גם דרך האימייל. עם זאת שימו לב! היות וגם הקליטה דרך המייל הינה במערכת אוטומטית — ייתכנו בה שיבושים, וככל שמתאפשר לכם מומלץ מאוד להגיש ישירות דרך המערכת הממוחשבת שלנו בהקשה על הלחצנים לעיל.</p>
        ${draftLinks.map(l => `<a href="${l.href}" style="display:inline-block;margin:0 0 8px;color:#c2410c;font-size:15px;font-weight:700;text-decoration:underline;">📝 ${l.label} »</a><br/>`).join('')}
      </td></tr>
    </table>` : ''
  const detailsRows = (details ?? []).map(([l, v]) => detailRow(l, v != null && v !== '' ? String(v) : '')).join('')
  const detailsTable = detailsRows ? `
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;font-family:Arial,sans-serif;">הפרטים הרשומים אצלנו:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${detailsRows}</table>` : ''
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:Arial,sans-serif;">${greet}</p>
    ${detailsTable}
    <p style="margin:0 0 20px;color:#334155;font-size:14px;line-height:1.8;font-family:Arial,sans-serif;">
      אתם נמנים עם רשומי <strong>"איגוד הצאצאים"</strong>. כדי להגיש בקשה לאחת מההטבות,
      לחצו על הכפתור המתאים — תועברו להתחברות מאובטחת ולאחריה ייפתח טופס הבקשה שבחרתם:
    </p>
    ${btn(`${base}/?action=birth`, '🍼 להגשת בקשה לימי החלמה ומזון מוכן לאחר לידה — לחצו כאן', '#fce7f3', '#9d174d')}
    <div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>
    ${btn(`${base}/?action=loan`, '💳 להגשת בקשת הלוואה (גמ״ח) — לחצו כאן', '#e0f2fe', '#075985')}
    <div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>
    ${btn(`${base}/?action=aid`, '🩺 להגשת בקשת סיוע רפואי — לחצו כאן', '#dcfce7', '#166534')}
    ${draftBlock}
    ${noReplyBox()}`
  return {
    subject: 'הגשת בקשות והטבות — איגוד הצאצאים',
    html: shell({ preheader: 'קישורים להגשת בקשות לאיגוד הצאצאים', accent, title: 'איגוד הצאצאים', subtitle: 'הגשת בקשות והטבות', body }),
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
        <p style="margin:0;color:#15803d;font-size:15px;font-weight:800;">✅ ${typeLabel} שלך נקלטה במערכת ומועברת לטיפול המזכירות.</p>
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
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:Arial,sans-serif;">${greet}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 8px;color:#b91c1c;font-size:15px;font-weight:900;">לא ניתן לטפל בבקשתך</p>
        <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.8;">
          הבקשה שהגשת התקבלה, אך לא ניתן לטפל בה כיוון שהרישום שלך לאיגוד הצאצאים <strong>לא אושר</strong>${reason ? ` — ${reason}` : ''}.
        </p>
      </td></tr>
    </table>
    <p style="margin:14px 0 0;color:#334155;font-size:13px;line-height:1.7;">לבירורים ניתן לפנות למשרד: <a href="mailto:${OFFICE_EMAIL}" style="color:#b91c1c;font-weight:700;text-decoration:none;">${OFFICE_EMAIL}</a></p>
    ${noReplyBox()}`
  return {
    subject: 'בנוגע לבקשתך — היכל החתם סופר',
    html: shell({ preheader: 'לא ניתן לטפל בבקשה — הרישום לא אושר.', accent: '#dc2626', title: 'בנוגע לבקשתך', subtitle: 'איגוד הצאצאים', body }),
  }
}

// ─── הגשת בקשה במייל: דחייה + טמפלט למילוי מחדש ─────────────────────────────
export function emailIntakeRejectedEmail(opts: {
  name: string; typeLabel: string; errors: string[]; draftText?: string | null; portalUrl?: string
}): BuiltEmail {
  const { name, typeLabel, errors, draftText, portalUrl = PORTAL_BASE_DEFAULT } = opts
  const greet = greetHe(name)
  const errorList = errors.map(e => `<li style="margin:0 0 4px;">${e}</li>`).join('')
  const draftBlock = draftText ? `
    <p style="margin:18px 0 8px;color:#334155;font-size:14px;font-weight:700;">להגשה חוזרת — העתיקו את הטופס הבא למייל חדש, מלאו ושלחו (אותו נושא):</p>
    <pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:12px;color:#0f172a;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;direction:rtl;">${draftText.replace(/</g, '&lt;')}</pre>` : ''
  const body = `
    ${autoReplyNote()}
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;font-family:Arial,sans-serif;">${greet}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
      <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 8px;color:#b91c1c;font-size:15px;font-weight:900;">⚠️ ${typeLabel} שלך לא נקלטה</p>
        <p style="margin:0 0 8px;color:#991b1b;font-size:13px;">הסיבות:</p>
        <ul style="margin:0;padding-inline-start:18px;color:#991b1b;font-size:13px;line-height:1.7;">${errorList}</ul>
      </td></tr>
    </table>
    <p style="margin:0 0 6px;color:#334155;font-size:14px;line-height:1.7;">
      💡 <strong>מומלץ להגיש דרך המערכת הדיגיטלית שלנו</strong> (אם אינכם חסומים) — פשוט ומהיר:
    </p>
    ${btn(`${portalUrl.replace(/\/$/, '')}/`, 'הגשת בקשה במערכת הדיגיטלית', '#4f46e5')}
    ${draftBlock}
    ${noReplyBox()}`
  return {
    subject: `${typeLabel} לא נקלטה — היכל החתם סופר`,
    html: shell({ preheader: 'הבקשה לא נקלטה — נא לתקן ולשלוח שוב.', accent: '#dc2626', title: 'הבקשה לא נקלטה', subtitle: 'איגוד הצאצאים', body }),
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

  // טבלת ההלוואות שאושרו מאז הדוח הקודם
  const newLoansSection = newLoans.length > 0
    ? `
    <h2 style="margin:30px 0 12px;color:#0f172a;font-size:16px;font-weight:800;">
      הלוואות מאושרות מאז הדוח הקודם${sinceLabel ? ` (${sinceLabel})` : ''} — ${newLoans.length}
    </h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr style="background:#f1f5f9;">
        <td style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-align:right;">משפחה</td>
        <td style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-align:right;">סכום</td>
        <td style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-align:right;">סטטוס</td>
        <td style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569;text-align:right;">תאריך</td>
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
        <p style="margin:0;color:#94a3b8;font-size:13px;">אין הלוואות מאושרות מאז הדוח הקודם${sinceLabel ? ` (${sinceLabel})` : ''}</p>
      </td></tr>
    </table>`

  const body = `
    <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.7;text-align:center;">
      ריכוז בקשות ההלוואה במערכת.<br/>
      להלן מצב ההלוואות נכון להיום:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr>
        ${statBox(stats.awaitingDisbursement, 'מאושרות וממתינות לביצוע', '#6366f1')}
        ${statBox(stats.pending, 'ממתינות לאישור', '#d97706')}
        ${statBox(stats.disbursedThisWeek, 'בוצעו השבוע', '#059669')}
      </tr>
    </table>

    ${newLoansSection}

    <div style="margin:28px 0 0;">${btn(portalUrl, 'לחץ כאן לכניסה לאישור ההלוואות ←', accent)}</div>

    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;text-align:center;">
      במערכת ניתן לצפות בפרטי כל הלוואה ולסמן את ביצועה.
    </p>`

  return {
    subject: `דוח הלוואות — ${stats.pending} ממתינות לאישור`,
    html: shell({
      preheader: `${stats.pending} הלוואות ממתינות לאישור`,
      accent,
      title: 'דוח הלוואות',
      subtitle: 'היכל החתם סופר',
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
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(details.family_name, name, details.marital_status)} הרישום אושר 🎉</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">
      אנו שמחים לבשר לך כי הרישום שלך ל<strong>איגוד הצאצאים</strong> של היכל החתם סופר התקבל במערכת ואושר.
      מעתה ניתן להגיש בקשות לאחת מההטבות ישירות מכאן — לחצו על הכפתור המתאים:
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
    ${btn(`${base}/?action=aid`, '🩺  בקשת סיוע רפואי', '#dcfce7', '#166534')}

    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.7;text-align:center;">
      להגשת בקשה תתבקש/י להזין את מספר תעודת הזהות שלך לאימות.
    </p>
  `
  return {
    subject: '✅ הרישום לאיגוד הצאצאים אושר — היכל החתם סופר',
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
          ניתן לכתוב לנו ב<strong>מייל חדש</strong> לכתובת
          <a href="mailto:igud@chasamsofer.info" style="color:#854d0e;font-weight:700;text-decoration:none;">igud@chasamsofer.info</a>,
          וב<strong>שורת הנושא</strong> לכתוב את <strong>מספר תעודת הזהות שלך במלואו (כולל ספרת ביקורת)</strong> —
          והמערכת תשלח אליך אוטומטית מייל עם הפרטים שלך וקישורים להגשת בקשות.
        </p>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:#eef2ff;border-right:4px solid #6366f1;border-radius:0 12px 12px 0;padding:18px 20px;">
        <p style="margin:0 0 6px;color:#3730a3;font-size:14px;font-weight:800;">📋 אם עדיין לא נרשמת:</p>
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
  const docs = (explicitDocs && explicitDocs.length) ? explicitDocs : requiredDocLabels(maritalStatus)
  const docsList = docs.map(d =>
    `<li style="margin:0 0 8px;color:#92400e;font-size:14px;font-weight:700;">${d}</li>`
  ).join('')

  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">פעולה נדרשת</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(null, name, maritalStatus)}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.8;">
      כדי להמשיך בטיפול בבקשתך, עליך <strong>להשלים את המסמכים הבאים</strong>.
      ניתן להעלות אותם ישירות דרך המערכת הדיגיטלית שלנו — מהמחשב או מהנייד.
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

  const firstTimeNote = firstTime ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr><td style="background:#fffbeb;border-right:4px solid #f59e0b;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#92400e;font-size:14px;font-weight:800;">⏳ שים/י לב — טרם אושרת סופית</p>
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.7;">
          הבקשה שלך וצילומי תעודת הזהות שצירפת התקבלו והועברו לבדיקת המזכירות.
          לאחר אישור ראשוני של המשפחה תטופל גם הבקשה עצמה. נעדכן אותך בהמשך.
        </p>
      </td></tr>
    </table>` : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr><td style="background:#f0fdf4;border-right:4px solid #22c55e;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#15803d;font-size:14px;font-weight:700;">✅ הבקשה התקבלה והועברה לטיפול המזכירות.</p>
      </td></tr>
    </table>`

  const reqRowsHtml = requestRows.map(([l, v]) => detailRow(l, v != null && v !== '' ? String(v) : '')).join('')
  const docsHtml = documents.length ? `
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">מסמכים מצורפים:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;color:#334155;font-size:14px;line-height:2;">
        ${documents.map(d => d.url
          ? `📎 <a href="${d.url}" target="_blank" download style="color:#4f46e5;font-weight:600;text-decoration:underline;">${d.name}</a>`
          : `📎 ${d.name}`).join('<br/>')}
      </td></tr>
    </table>` : ''

  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:0.5px;">אישור קבלה</p>
    <h2 style="margin:0 0 14px;color:#0f172a;font-size:22px;font-weight:900;">${type === 'birth' ? greetMrs(beneficiary.family_name, beneficiary.spouse_name || beneficiary.full_name) : greetByStatus(beneficiary.family_name, beneficiary.full_name, beneficiary.marital_status)}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.8;">
      <strong>${reqLabel}</strong> שלך התקבלה במערכת היכל החתם סופר ומועברת לטיפול המזכירות.
    </p>
    ${firstTimeNote}
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">פרטי המבקש:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${beneficiaryDetailRows(beneficiary)}</table>
    ${reqRowsHtml ? `
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">פרטי הבקשה:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${reqRowsHtml}</table>` : ''}
    ${docsHtml}
    <p style="margin:0 0 4px;color:#94a3b8;font-size:13px;line-height:1.7;">תקבל/י עדכון על המשך הטיפול בהמשך.</p>
    ${noReplyBox()}
  `
  return {
    subject: `התקבלה ${reqLabel} — היכל החתם סופר`,
    html: shell({ preheader: `${reqLabel} התקבלה ומועברת לטיפול.`, accent, title: 'הבקשה התקבלה', subtitle: reqLabel, body }),
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
): BuiltEmail {
  const base = portalBase.replace(/\/$/, '')
  const fullName = [d.family_name, d.full_name].filter(Boolean).join(' ') || (d.full_name ?? '')
  const married = (d.marital_status ?? '').startsWith('נשו')
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
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:0.5px;">אישור קבלה</p>
    <h2 style="margin:0 0 14px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(d.family_name, d.full_name, d.marital_status)}</h2>
    <p style="margin:0 0 22px;color:#475569;font-size:15px;line-height:1.8;">
      תודה על פנייתך! בקשתך להירשם ל<strong>איגוד הצאצאים</strong> של היכל החתם סופר התקבלה.
    </p>
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">פרטי הרישום שלך:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${rows}</table>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;font-weight:700;text-align:center;">להגשת בקשה לאחת מההטבות, לחצו על הכפתור המתאים:</p>
    ${btn(`${base}/?action=birth`, '🍼 להגשת בקשה לימי החלמה ומזון מוכן לאחר לידה — לחצו כאן', '#fce7f3', '#9d174d')}
    <div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>
    ${btn(`${base}/?action=loan`, '💳 להגשת בקשת הלוואה (גמ״ח) — לחצו כאן', '#e0f2fe', '#075985')}
    <div style="height:10px;font-size:0;line-height:0;">&nbsp;</div>
    ${btn(`${base}/?action=aid`, '🩺 להגשת בקשת סיוע רפואי — לחצו כאן', '#dcfce7', '#166534')}
  `
  return {
    subject: 'קיבלנו את בקשתך — היכל החתם סופר',
    html: shell({ preheader: 'בקשת ההרשמה שלך התקבלה. ניתן כבר להיכנס ולהגיש בקשות.', accent: '#4f46e5', title: 'בקשתך התקבלה', subtitle: 'היכל החתם סופר', body }),
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
  const body = approved ? `
    <p style="margin:0 0 8px;color:#059669;font-size:13px;font-weight:700;letter-spacing:0.5px;">בשורה משמחת</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetHe(name)}</h2>
    <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.8;">
      שמחים לבשר כי בקשתך לסיוע רפואי <strong>אושרה</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:18px 22px;text-align:center;">
        <p style="margin:0;color:#065f46;font-size:13px;font-weight:600;">הסכום שאושר</p>
        <p style="margin:6px 0 0;color:#047857;font-size:30px;font-weight:900;" dir="ltr">₪${Number(amount ?? 0).toLocaleString('he-IL')}</p>
      </td></tr>
    </table>
    <p style="margin:0;color:#334155;font-size:14px;line-height:1.8;">צוות המזכירות יצור עמך קשר להמשך התהליך. בברכה, היכל החתם סופר.</p>
  ` : `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:0.5px;">עדכון בנוגע לבקשתך</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetHe(name)}</h2>
    <p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.8;">
      בקשתך לסיוע רפואי נבדקה, ולצערנו לא אושרה בשלב זה.
    </p>
    <p style="margin:0;color:#334155;font-size:14px;line-height:1.8;">לפרטים נוספים ניתן לפנות למזכירות. בברכה, היכל החתם סופר.</p>
  `
  return {
    subject: approved ? 'בקשת הסיוע הרפואי אושרה — היכל החתם סופר' : 'עדכון בנוגע לבקשת הסיוע הרפואי',
    html: shell({ preheader: approved ? `בקשתך אושרה על סך ₪${Number(amount ?? 0).toLocaleString('he-IL')}` : 'עדכון בנוגע לבקשתך', accent: approved ? '#10b981' : '#64748b', title: approved ? 'הבקשה אושרה' : 'עדכון בקשה', subtitle: 'סיוע רפואי', body }),
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
  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">בשורה טובה!</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetByStatus(b.family_name, b.full_name, b.marital_status)} בקשת ההלוואה שלך אושרה</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#f0fdf4;border-right:4px solid #22c55e;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#15803d;font-size:15px;font-weight:800;">✅ בקשת ההלוואה שלך טופלה ואושרה.</p>
      </td></tr>
    </table>
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">פרטי ההלוואה:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${loanRows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#eef2ff;border-right:4px solid #4f46e5;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#3730a3;font-size:14px;font-weight:700;line-height:1.7;">
          בקשתכם הועברה לטיפול במזכירות של הרב אברהם סלונים שליט"א, ויצרו עמכם קשר בימים הקרובים.
        </p>
      </td></tr>
    </table>
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">הפרטים שלך:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${benRows}</table>
  `
  return {
    subject: '✅ בקשת ההלוואה אושרה — היכל החתם סופר',
    html: shell({ preheader: 'בקשת ההלוואה שלך אושרה.', accent: '#4f46e5', title: 'בקשת ההלוואה אושרה', subtitle: 'היכל החתם סופר', body }),
  }
}

export type FoodCardCenter = { name: string; city?: string | null; address?: string | null }

export function birthApprovedEmail(
  b: RequestApprovedBeneficiary,
  birth: { baby_name?: string | null; baby_gender?: string | null; birth_date?: string | null; recovery_home?: string | null },
  opts: { center?: FoodCardCenter | null; stockAvailable?: boolean; serial?: string | null } = {},
): BuiltEmail {
  const center = opts.center ?? null
  const stockAvailable = !!opts.stockAvailable
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
        <p style="margin:0 0 6px;color:#b45309;font-size:15px;font-weight:900;">🍞 כרטיס מזון על סך 600 ₪</p>
        <p style="margin:0;color:#92400e;font-size:14px;line-height:1.7;">
          מצורף שובר לאיסוף כרטיס המזון. יש להדפיס את השובר ולהביאו ל<strong>מוקד שבחרתם</strong>:
        </p>
        ${center ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 0;border:1px solid #fcd34d;border-radius:10px;overflow:hidden;background:#ffffff;">
          <tr><td style="padding:10px 16px;color:#92400e;font-size:15px;font-weight:800;">${center.name}</td>
              <td style="padding:10px 16px;color:#b45309;font-size:13px;text-align:left;">${centerPlace || '—'}</td></tr>
        </table>` : ''}
      </td></tr>
    </table>`
    : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 6px;color:#b91c1c;font-size:15px;font-weight:900;">🍞 כרטיס מזון על סך 600 ₪ — ממתין למלאי</p>
        <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.7;">
          שימו לב: במוקד שבחרתם${center ? ` (<strong>${center.name}</strong>)` : ''} אין כרגע כרטיסים זמינים.
          ברגע שהמלאי יתחדש נשלח אליכם עדכון במייל עם שובר הכרטיס לאיסוף. (שובר ההבראה לבית ההחלמה מצורף כבר עכשיו.)
        </p>
      </td></tr>
    </table>`
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px 18px;text-align:center;">
        <p style="margin:0;color:#3730a3;font-size:15px;font-weight:900;line-height:1.7;">📎 מצורפים למייל זה שוברים למימוש ההטבה!</p>
        <p style="margin:4px 0 0;color:#4338ca;font-size:13px;line-height:1.7;">הדפיסו את השוברים והביאו אותם לבית החלמה ו/או למוקדים לצורך מימוש ההטבה.</p>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">בשורה טובה!</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetMrs(b.family_name, b.spouse_name || b.full_name)} בקשת ההבראה ליולדת אושרה 🎉</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#fdf2f8;border-right:4px solid #db2777;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#be185d;font-size:15px;font-weight:800;">✅ הבקשה שלכם טופלה ואושרה, מזל טוב!</p>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;">
        <p style="margin:0;color:#1e40af;font-size:15px;font-weight:800;">להמשך התהליך:</p>
        <p style="margin:6px 0 0;color:#1e3a8a;font-size:14px;line-height:1.7;">
          עליכם לפנות אל בית ההחלמה שנרשמתם${birth.recovery_home ? ` — <strong>${birth.recovery_home}</strong>` : ''} ולהשלים מולם את הרישום ושאר הפרטים.
        </p>
      </td></tr>
    </table>
    ${foodCardBlock}
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">פרטי הלידה:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${birthRows}</table>
    <p style="margin:0 0 10px;color:#334155;font-size:14px;font-weight:700;">הפרטים שלך:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${benRows}</table>
  `
  return {
    subject: '✅ בקשת ההבראה ליולדת אושרה — היכל החתם סופר',
    html: shell({ preheader: 'בקשת ההבראה ליולדת שלך אושרה.', accent: '#db2777', title: 'הבקשה אושרה', subtitle: 'היכל החתם סופר', body }),
  }
}

// ─── אישור כרטיס מזון ליולדת (שובר) ───────────────────────────────────────────
export function maternityCardEmail(
  b: { full_name?: string | null; family_name?: string | null; spouse_name?: string | null },
  opts: { centerName?: string | null } = {},
): BuiltEmail {
  const rows = [
    detailRow('שם המשפחה', [b.family_name, b.full_name].filter(Boolean).join(' ')),
    detailRow('מוקד החלוקה', opts.centerName),
  ].join('')
  const body = `
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">בשורה טובה!</p>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greetMrs(b.family_name, b.spouse_name || b.full_name)} כרטיס המזון אושר 🎉</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#ecfdf5;border-right:4px solid #059669;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#047857;font-size:15px;font-weight:800;">✅ כרטיס המזון שלך אושר וזמין לאיסוף.</p>
      </td></tr>
    </table>
    ${opts.centerName ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;">
        <p style="margin:0;color:#1e40af;font-size:15px;font-weight:800;">להמשך התהליך:</p>
        <p style="margin:6px 0 0;color:#1e3a8a;font-size:14px;line-height:1.7;">
          ניתן לאסוף את כרטיס המזון / השובר במוקד <strong>${opts.centerName}</strong>.
        </p>
      </td></tr>
    </table>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${rows}</table>
  `
  return {
    subject: '✅ כרטיס המזון אושר — היכל החתם סופר',
    html: shell({ preheader: 'כרטיס המזון שלך אושר וזמין לאיסוף.', accent: '#059669', title: 'כרטיס המזון אושר', subtitle: 'היכל החתם סופר', body }),
  }
}

// ─── עדכון: המלאי במוקד התחדש — מצורף שובר הכרטיס לאיסוף ──────────────────────
export function cardStockReplenishedEmail(name: string, centerName?: string | null): BuiltEmail {
  const greet = greetMrs(null, name)
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px 18px;text-align:center;">
        <p style="margin:0;color:#3730a3;font-size:15px;font-weight:900;line-height:1.7;">📎 מצורף שובר לאיסוף כרטיס המזון!</p>
        <p style="margin:4px 0 0;color:#4338ca;font-size:13px;line-height:1.7;">הדפיסו את השובר והביאו אותו למוקד לצורך קבלת הכרטיס.</p>
      </td></tr>
    </table>
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${greet} המלאי במוקד התחדש 🎉</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr><td style="background:#ecfdf5;border-right:4px solid #059669;border-radius:0 12px 12px 0;padding:16px 20px;">
        <p style="margin:0;color:#047857;font-size:15px;font-weight:800;">
          שימו לב — המלאי במוקד${centerName ? ` <strong>${centerName}</strong>` : ' שבחרתם'} התחדש, וכעת ניתן לאסוף את כרטיס המזון.
        </p>
        <p style="margin:6px 0 0;color:#065f46;font-size:14px;line-height:1.7;">הדפיסו את השובר המצורף והביאו אותו למוקד לקבלת הכרטיס.</p>
      </td></tr>
    </table>
  `
  return {
    subject: '🍞 המלאי התחדש — שובר כרטיס המזון מצורף — היכל החתם סופר',
    html: shell({ preheader: 'המלאי במוקד התחדש — שובר כרטיס המזון מצורף לאיסוף.', accent: '#059669', title: 'המלאי התחדש', subtitle: 'היכל החתם סופר', body }),
  }
}
