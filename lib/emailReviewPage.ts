// דף בקרה: מרכז את כל נוסחי המיילים (מרונדרים במלואם, בדיוק כפי שנשלחים) בדף אחד,
// כל מייל בעמוד נפרד. נפתח בדפדפן — Ctrl+P → "שמור כ-PDF" מפיק PDF מדויק לבקרת איכות.

export interface RenderedEmail { title: string; recipient?: string; trigger?: string; html: string }

// עוטף כל מייל בכרטיס עם כותרת-מטא (מי/מתי) ואז ה-HTML המלא שלו ב-iframe מבודד,
// כדי שה-CSS של כל מייל לא ידלוף/יתנגש עם השכנים. page-break אחרי כל מייל.
export function buildEmailReviewPage(emails: RenderedEmail[]): string {
  const cards = emails.map((e, i) => {
    // ה-HTML של המייל מוזרק ל-iframe דרך srcdoc (מבודד לחלוטין).
    const srcdoc = e.html.replace(/"/g, '&quot;')
    return `
    <section class="mail-page">
      <div class="meta">
        <span class="idx">${i + 1}</span>
        <div>
          <h2>${escapeHtml(e.title)}</h2>
          <p>${[e.trigger && `מתי: ${escapeHtml(e.trigger)}`, e.recipient && `נמען: ${escapeHtml(e.recipient)}`].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <iframe class="mail-frame" srcdoc="${srcdoc}" loading="lazy"></iframe>
    </section>`
  }).join('')

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8"/>
  <title>בקרת נוסחי המיילים — היכל החתם סופר</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef2f7; font-family: 'Heebo', Arial, sans-serif; direction: rtl; color: #1e293b; }
    .toolbar { position: sticky; top: 0; z-index: 10; background: #1b3256; color: #fff; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 10px rgba(0,0,0,.15); }
    .toolbar h1 { font-size: 17px; margin: 0; font-weight: 800; }
    .toolbar p { margin: 2px 0 0; font-size: 12px; opacity: .8; }
    .print-btn { background: #c69e2d; color: #1b3256; border: 0; border-radius: 8px; padding: 9px 20px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; }
    .wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 60px; }
    .mail-page { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 6px 24px -12px rgba(15,23,42,.25); margin-bottom: 28px; border: 1px solid #e2e8f0; }
    .meta { display: flex; align-items: center; gap: 12px; padding: 14px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .meta .idx { width: 28px; height: 28px; border-radius: 50%; background: #1b3256; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 13px; flex: none; }
    .meta h2 { margin: 0; font-size: 15px; font-weight: 800; color: #1b3256; }
    .meta p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
    .mail-frame { width: 100%; border: 0; display: block; height: 900px; background: #fff; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .wrap { max-width: none; padding: 0; }
      .mail-page { box-shadow: none; border: none; border-radius: 0; margin: 0; page-break-after: always; }
      .meta { background: #fff; }
      .mail-frame { height: 1180px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>בקרת נוסחי המיילים</h1>
      <p>${emails.length} מיילים · כל מייל בעמוד נפרד · בדיוק כפי שנשלח</p>
    </div>
    <button class="print-btn" onclick="window.print()">🖨️ הדפסה / שמירה כ-PDF</button>
  </div>
  <div class="wrap">
    ${cards}
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
