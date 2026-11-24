// ─── הודעה למשפחות בבדיקה מעמיקה: התגלתה תקלה בסדר הדורות ─────────────────
// נשלח במרוכז מ-/api/admin/beneficiaries/lineage-fault-notice. הקישור זהה לזה
// של lineageOrderFixEmail (mode='order', 30 יום), רק הנוסח שונה.
//
// הנוסח נערך במסך (LineageFaultTemplate). אותה פונקציה בונה גם את התצוגה
// המקדימה וגם כל מייל שנשלח, כך שמה שרואים במסך הוא מה שיוצא.
// צד שרת בלבד (sanitize-html).

import { escapeHtml, shell } from './emailTemplates'
import { sanitizeMailHtml } from './gilyonotRichHtml'
import { DEFAULT_LINEAGE_FAULT_TEMPLATE, NAME_TOKEN, normalizeLineageFaultTemplate, type LineageFaultTemplate } from './lineageFaultNotice'

export function lineageFaultEmail(opts: {
  recipientName: string
  link: string
  template?: LineageFaultTemplate
}): { subject: string; html: string } {
  const t = normalizeLineageFaultTemplate(opts.template ?? DEFAULT_LINEAGE_FAULT_TEMPLATE)
  // ⚠️ קודם מנקים את ה-HTML מהעורך ורק אחר כך מציבים את השם (מנוטרל),
  // כדי ששם משפחה לא יוכל להכניס HTML.
  const body = sanitizeMailHtml(t.bodyHtml).split(NAME_TOKEN).join(escapeHtml(opts.recipientName))
  const html = `
    ${body}
    <div style="text-align:center;margin:4px 0 18px;">
      <a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:16px;font-weight:800;text-decoration:none;border-radius:12px;padding:14px 32px;">
        ${escapeHtml(t.buttonLabel)}
      </a>
    </div>
    ${t.note ? `<p style="margin:0;color:#94a3b8;font-size:12px;">${escapeHtml(t.note).replace(/\n/g, '<br>')}</p>` : ''}
    <p style="margin:10px 0 0;color:#cbd5e1;font-size:11px;">אין להשיב למייל זה. לפניות: <a href="mailto:igud@chasamsofer.info" style="color:#a5b4fc;text-decoration:none;">igud@chasamsofer.info</a></p>
  `
  return {
    subject: t.subject.split(NAME_TOKEN).join(opts.recipientName),
    html: shell({
      preheader: t.title,
      accent: '#4f46e5',
      title: t.title,
      subtitle: 'איגוד צאצאי החתם סופר',
      body: html,
    }),
  }
}
