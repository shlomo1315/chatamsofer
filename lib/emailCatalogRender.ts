import { shell } from './emailTemplates'
import { DEPARTMENTS } from './departments'
import { specById, textOf, type EmailTexts } from './emailCatalog'

// ─────────────────────────────────────────────────────────────────────────────
// רינדור מייל מהקטלוג — לתצוגה המקדימה במסך ההגדרות.
//
// משתמש ב-shell() האמיתי, אותו אחד שכל המיילים במערכת עוברים דרכו — כך
// שהתצוגה נאמנה למה שיישלח בפועל (לוגו, צבעים, כותרת תחתונה).
// ─────────────────────────────────────────────────────────────────────────────

/** נתוני דוגמה — כדי שהתצוגה תיראה כמו מייל אמיתי, לא כמו שלד ריק. */
const SAMPLE = {
  family: 'ויסברג',
  husband: 'שלמה',
  wife: 'גיטי',
  city: 'עמנואל',
  center: 'מוקד ירושלים - אזור נווה צבי',
  home: 'אם וילד',
  amount: '20,000 ₪',
  code: '4821',
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** טקסט חופשי -> פסקאות HTML, עם שמירת שבירות שורה. */
function paras(text: string): string {
  return String(text ?? '')
    .split(/\n{2,}/)
    .filter(p => p.trim())
    .map(p => `<p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

function button(label: string, accent: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr><td style="background:${accent};border-radius:12px;">
      <a href="#" style="display:block;padding:14px 28px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;">${esc(label)}</a>
    </td></tr></table>`
}

function notice(text: string, accent: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
    <tr><td style="background:#f8fafc;border-right:4px solid ${accent};border-radius:0 10px 10px 0;padding:12px 16px;color:#475569;font-size:14px;line-height:1.7;">
      ${esc(text).replace(/\n/g, '<br/>')}
    </td></tr></table>`
}

export function renderCatalogEmail(id: string, texts: EmailTexts): { subject: string; html: string } {
  const spec = specById(id)
  if (!spec) return { subject: '', html: '' }

  const t = (key: string) => textOf(texts, id, key)
  const has = (key: string) => spec.fields.some(f => f.key === key)

  const dept = DEPARTMENTS[spec.department as keyof typeof DEPARTMENTS] ?? DEPARTMENTS.main
  const accent = dept.color

  // הפתיח — כמו במיילים האמיתיים, לפי סוג הנמען
  const greet = spec.group === 'maternity' || spec.group === 'gratitude'
    ? `שלום וברכה, מרת ${SAMPLE.family} ${SAMPLE.wife} תחי׳,`
    : `שלום וברכה, הרב ${SAMPLE.family} ${SAMPLE.husband} הי״ו,`

  const parts: string[] = []

  // כותרת ראשית
  const title = has('title') ? t('title') : (has('title_approved') ? t('title_approved') : spec.title)
  parts.push(`<h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:900;">${esc(title)}</h2>`)
  parts.push(`<p style="margin:0 0 16px;color:#0f172a;font-size:15px;font-weight:700;">${esc(greet)}</p>`)

  // גוף
  const intro = has('intro') ? t('intro') : (has('intro_approved') ? t('intro_approved') : '')
  if (intro) parts.push(paras(intro))
  if (has('body')) parts.push(paras(t('body')))

  // רשימת שגיאות — רק במייל הדחייה
  if (has('errors_intro')) {
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 8px;color:#b91c1c;font-size:14px;">${esc(t('errors_intro'))}</p>
        <ul style="margin:0;padding-right:18px;color:#b91c1c;font-size:14px;line-height:1.8;">
          <li>לא נמצא קובץ בשם "אישור-לידה". שנו את שם הקובץ בדיוק לכך וצרפו שוב</li>
          <li>ניתן להגיש בקשה עד 30 יום מתאריך הלידה</li>
        </ul>
      </td></tr></table>`)
  }

  if (has('digital_note')) parts.push(paras(t('digital_note')))
  if (has('digital_button')) parts.push(button(t('digital_button'), accent))
  if (has('draft_note')) parts.push(paras(t('draft_note')))
  if (has('draft_button')) {
    parts.push(`<p style="margin:0 0 20px;"><a href="#" style="color:${accent};font-weight:700;font-size:15px;">${esc(t('draft_button'))}</a></p>`)
  }

  if (has('first_time_note')) parts.push(notice(t('first_time_note'), '#f59e0b'))
  if (has('print_note')) parts.push(notice(t('print_note'), accent))
  if (has('notice')) parts.push(notice(t('notice'), accent))

  if (has('button')) parts.push(button(t('button'), accent))

  // קוד אימות — תצוגה ייעודית
  if (id === 'verify_code_email') {
    parts.push(`<div style="text-align:center;margin:0 0 20px;">
      <span style="display:inline-block;background:#f1f5f9;border-radius:12px;padding:16px 32px;font-size:32px;font-weight:900;letter-spacing:8px;color:#0f172a;">${SAMPLE.code}</span>
    </div>`)
  }

  const subject = has('subject') ? t('subject')
    : has('subject_approved') ? t('subject_approved')
    : spec.title

  const html = shell({
    preheader: subject,
    accent,
    title,
    subtitle: `היכל החתם סופר · ${dept.label}`,
    body: parts.join(''),
  })

  return { subject, html }
}
