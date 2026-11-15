import { deliverMail } from '@/lib/sendMail'
import { loadFlyer } from './flyer'

// מיילים של פורטל השדכנים: קוד כניסה, אישור קבלה, אישור/דחייה.
// הכול תפעולי (בלי מעקב ובלי כותרות הסרה); הקוד בעדיפות גבוהה.

const FROM = { fromName: 'מלגות לשדכנים – היכל החתם סופר', transactional: true as const }

function shell(title: string, body: string): string {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="margin:0;background:#FBF8F1;font-family:Heebo,Arial,sans-serif;direction:rtl;color:#1B2338">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFDF8;border:1px solid #E6DFCF;border-radius:14px;overflow:hidden">
<tr><td style="background:#14213D;padding:22px 28px;color:#fff;font-size:18px;font-weight:700;border-bottom:3px solid #C0912F">${title}</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.7">${body}</td></tr>
<tr><td style="padding:14px 28px;background:#FBF8F1;border-top:1px solid #E6DFCF;font-size:12px;color:#6B6352">הודעה אוטומטית מפורטל מלגות לשדכנים. אם לא ביקשתם אותה, אפשר להתעלם ממנה.</td></tr>
</table></td></tr></table></body></html>`
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

export function sendLoginCode(to: string, name: string, code: string) {
  return deliverMail(to, 'קוד כניסה לפורטל השדכנים', shell('קוד הכניסה שלך', `
    <p>שלום ${esc(name)},</p><p>קוד הכניסה שלך:</p>
    <p style="font-size:34px;font-weight:800;letter-spacing:8px;color:#14213D;margin:12px 0" dir="ltr">${code}</p>
    <p>הקוד תקף ל-10 דקות ומשמש פעם אחת בלבד.</p>`), undefined, { ...FROM, gmailPriority: 'high' })
}

export function sendClaimReceived(to: string, name: string, groom: string, bride: string) {
  return deliverMail(to, 'קיבלנו את בקשת המלגה שלך', shell('הבקשה התקבלה', `
    <p>שלום ${esc(name)},</p><p>בקשת המלגה על השידוך ${esc(groom)} ו${esc(bride)} התקבלה ותיבדק. נעדכן במייל כשתהיה החלטה.</p>`), undefined, FROM)
}

export function sendClaimDecision(to: string, name: string, groom: string, bride: string, approved: boolean, amount: number | null, reason: string | null) {
  const body = approved
    ? `<p>שלום ${esc(name)},</p><p>בקשת המלגה על השידוך ${esc(groom)} ו${esc(bride)} אושרה${amount != null ? ` בסכום של ₪${amount.toLocaleString('he-IL')}` : ''}.</p>`
    : `<p>שלום ${esc(name)},</p><p>בקשת המלגה על השידוך ${esc(groom)} ו${esc(bride)} לא אושרה.${reason ? `<br/>סיבה: ${esc(reason)}` : ''}</p>`
  return deliverMail(to, approved ? 'בקשת המלגה אושרה' : 'עדכון לגבי בקשת המלגה', shell(approved ? 'המלגה אושרה' : 'עדכון בקשה', body), undefined, FROM)
}

export async function sendWelcomeRegistered(to: string, name: string) {
  const flyer = await loadFlyer()
  return deliverMail(to, 'נרשמתם בהצלחה לפרויקט המלגות', shell('נרשמתם בהצלחה', `
    <p>שלום ${esc(name)},</p>
    <p>נרשמתם בהצלחה לפרויקט המלגות של הגפן בשיתוף איגוד צאצאי מרן החת"ס זיע"א.</p>
    ${flyer ? '<p>דף הפרסום של הפרויקט מצורף למייל זה.</p>' : ''}
    <p>אפשר להגיש בקשת מלגה שבוע אחרי ההרשמה, ולא לפני ה' בטבת. המועד המדויק מופיע באזור האישי.</p>`),
  flyer ? [flyer] : undefined, FROM)
}
