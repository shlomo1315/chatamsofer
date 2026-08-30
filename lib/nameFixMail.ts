// ─────────────────────────────────────────────────────────────────────────────
// מייל השלמת שם התינוק — נוסח אחד לשליחה הידנית ולתזכורת השבועית.
//
// 🔴 מרוכז כאן כדי ששני המסלולים ישלחו את *אותו* מייל. נוסח משוכפל היה
// מתפצל בתיקון הראשון, והמשפחה הייתה מקבלת בתזכורת מייל אחר מזה שראתה
// בפעם הראשונה — עם קישור שנבנה אחרת.
// ─────────────────────────────────────────────────────────────────────────────
import { signPublicToken } from './publicToken'
import { shell } from './emailTemplates'

export interface NameFixMailInput {
  aidId: string
  motherName: string
  /** מספר התזכורת (1 = ראשונה). null/0 = שליחה ידנית ראשונה, לא תזכורת. */
  reminderNumber?: number | null
  /** כמה תינוקות בתיק — הנוסח מדבר ברבים כשיש תאומים. */
  babyCount?: number
}

export const NAME_FIX_SUBJECT = 'השלמת שם התינוק — היכל החתם סופר'
export const NAME_FIX_REMINDER_SUBJECT = 'תזכורת: השלמת שם התינוק — היכל החתם סופר'

/** קישור התיקון האישי (טוקן HMAC חתום, תקף 7 ימים). */
export function nameFixLink(aidId: string): string {
  const token = signPublicToken('n', aidId)
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il'
  return `${base.replace(/\/$/, '')}/fix-name/${token}`
}

export function buildNameFixMail(input: NameFixMailInput): { subject: string; html: string; link: string } {
  const link = nameFixLink(input.aidId)
  const isReminder = (input.reminderNumber ?? 0) > 0
  const twins = (input.babyCount ?? 1) > 1

  const noun = twins ? 'שמות התינוקות' : 'שם התינוק'
  const opening = isReminder
    ? `זוהי תזכורת ידידותית — ${twins ? 'שמות התינוקות עדיין חסרים' : 'שם התינוק עדיין חסר'} במערכת.`
    : `במערכת חסר ${twins ? 'שם תקין לתינוקות שלכם' : 'שם תקין לתינוק שלכם'}.`

  const bodyHtml = `
    <p style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;">שלום ${input.motherName},</p>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">
      ${opening} על מנת שנוכל להעביר את הבקשה שלכם לטיפול,
      עליכם להשלים את ${twins ? 'השמות המדויקים' : 'השם המדויק'} בלחיצה על הכפתור:
    </p>
    ${twins ? `<p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.8;">
      בעמוד יופיע שדה נפרד לכל תינוק, לצד מספר הזהות שלו — כך תוכלו לוודא איזה שם שייך למי.
    </p>` : ''}
    <div style="text-align:center;margin:0 0 18px;">
      <a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:16px;font-weight:800;text-decoration:none;border-radius:12px;padding:14px 32px;">
        הזנת ${noun}
      </a>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;">הקישור אישי ותקף 7 ימים. אם לא ביקשתם — ניתן להתעלם.</p>
  `

  return {
    subject: isReminder ? NAME_FIX_REMINDER_SUBJECT : NAME_FIX_SUBJECT,
    html: shell({
      preheader: `השלמת ${noun} — היכל החתם סופר`,
      accent: '#4f46e5',
      title: `השלמת ${noun}`,
      subtitle: 'אגף עזר ליולדות · היכל החתם סופר',
      body: bodyHtml,
    }),
    link,
  }
}
