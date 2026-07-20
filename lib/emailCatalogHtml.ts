// מסמך HTML מרוכז של כל נוסחי המיילים במערכת — לעריכה "מול העיניים".
// מעוצב באותה שפה של מיילי המערכת (lib/emailTemplates shell): רקע אפור, כרטיס
// לבן מעוגל, לוגו, פונט Heebo. נפתח בטאב חדש; ניתן להדפיס / לשמור כ-PDF מהדפדפן.
import { EMAIL_CATALOG, GROUP_LABELS, type EmailGroup, type EmailTexts, textOf } from './emailCatalog'
import { DEPARTMENTS, type DepartmentKey } from './departments'

const LOGO_URL = 'https://chasamsofer.co.il/logo.png'
const NAVY = '#1b3256'
const GOLD = '#c69e2d'

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// הנוסח האפקטיבי מוצג כפי שהוא נשלח: <br> נשמר, שאר תגיות ה-HTML הפשוטות מוסרות,
// והטקסט עצמו עובר escape כדי שלא יישבר הפריסה.
function renderBody(raw: string): string {
  const withoutTags = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  return esc(withoutTags).replace(/\n/g, '<br/>')
}

/** בונה את מסמך ה-HTML של קטלוג המיילים. מחזיר מחרוזת HTML שלמה. */
export function buildEmailCatalogHtml(texts: EmailTexts): string {
  const wired = EMAIL_CATALOG.filter(e => e.wired !== false)
  const groups = [...new Set(wired.map(e => e.group))] as EmailGroup[]
  const today = new Date().toLocaleDateString('he-IL')

  const groupsHtml = groups.map(g => {
    const emails = wired.filter(e => e.group === g)
    const cards = emails.map(email => {
      const deptLabel = DEPARTMENTS[email.department as DepartmentKey]?.label ?? email.department
      const fields = email.fields.map(f => {
        const labelExtra = f.vars?.length
          ? `<span style="color:#94a3b8;font-weight:400;font-size:12px;">   ·  משתנים: ${esc(f.vars.join(' '))}</span>`
          : ''
        const hint = f.hint
          ? `<p style="margin:6px 2px 0;color:#94a3b8;font-size:12px;">הערה: ${esc(f.hint)}</p>`
          : ''
        return `
          <div style="margin:0 0 16px;">
            <div style="background:#eef2f7;border-radius:8px 8px 0 0;padding:7px 12px;">
              <span style="color:${NAVY};font-weight:700;font-size:13px;">${esc(f.label)}</span>${labelExtra}
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 8px 8px;
                        padding:12px 14px;color:#1e293b;font-size:14px;line-height:1.8;">
              ${renderBody(textOf(texts, email.id, f.key))}
            </div>
            ${hint}
          </div>`
      }).join('')

      return `
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin:0 0 20px;
                    box-shadow:0 1px 3px rgba(15,23,42,0.06);">
          <div style="background:${GOLD};height:4px;font-size:0;line-height:0;">&nbsp;</div>
          <div style="padding:20px 22px;">
            <h3 style="margin:0 0 6px;color:${NAVY};font-size:18px;font-weight:800;">${esc(email.title)}</h3>
            <p style="margin:0 0 16px;color:#64748b;font-size:12.5px;">
              מתי: ${esc(email.trigger)}  ·  נמען: ${esc(email.recipient)}  ·  מחלקה: ${esc(deptLabel)}
            </p>
            ${fields}
          </div>
        </div>`
    }).join('')

    return `
      <div style="margin:0 0 8px;">
        <div style="background:${NAVY};border-radius:10px;padding:12px 18px;margin:0 0 18px;">
          <h2 style="margin:0;color:#ffffff;font-size:17px;font-weight:800;">${esc(GROUP_LABELS[g] ?? g)}</h2>
        </div>
        ${cards}
      </div>`
  }).join('')

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>נוסחי המיילים במערכת · היכל החתם סופר</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap" rel="stylesheet"/>
  <style>
    * { font-family: 'Heebo', Arial, sans-serif; box-sizing: border-box; }
    body { margin:0; padding:0; background:#eef2f7; direction:rtl; }
    @media print { body { background:#ffffff; } .doc-actions { display:none !important; } }
  </style>
</head>
<body>
  <div style="max-width:820px;margin:0 auto;padding:32px 16px 60px;">

    <!-- כותרת ראשית -->
    <div style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.10);margin:0 0 28px;">
      <div style="background:${NAVY};height:6px;font-size:0;line-height:0;">&nbsp;</div>
      <div style="padding:32px 40px;text-align:center;">
        <img src="${LOGO_URL}" alt="היכל החתם סופר" width="72" height="72" style="display:inline-block;margin-bottom:16px;"/>
        <h1 style="margin:0 0 6px;color:#0f172a;font-size:24px;font-weight:900;">נוסחי המיילים במערכת</h1>
        <p style="margin:0;color:#64748b;font-size:14px;">היכל החתם סופר · מסמך מרוכז לעריכת נוסחי המיילים</p>
        <p style="margin:10px 0 0;color:#94a3b8;font-size:12px;">הופק: ${today} · כל מייל בכרטיס נפרד</p>
      </div>
    </div>

    <div class="doc-actions" style="text-align:center;margin:0 0 24px;">
      <button onclick="window.print()"
        style="background:${NAVY};color:#fff;border:0;border-radius:10px;padding:10px 22px;font-size:14px;
               font-weight:700;cursor:pointer;font-family:'Heebo',sans-serif;">
        🖨️ הדפסה / שמירה כ-PDF
      </button>
    </div>

    ${groupsHtml}

    <p style="text-align:center;color:#cbd5e1;font-size:11px;margin:32px 0 0;">
      © ${new Date().getFullYear()} היכל החתם סופר — כל הזכויות שמורות
    </p>
  </div>
</body>
</html>`
}
