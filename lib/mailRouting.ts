import { departmentByEmail } from './departments'

// ─────────────────────────────────────────────────────────────────────────────
// לאיזו תיבה שייך מייל נכנס.
//
// הכלל המרכזי: התיבה נקבעת לפי נמען *ישיר* (To / Delivered-To), לא לפי Cc.
// בלי זה, מייל שנשלח לתיבה 10 ובו office ב-Cc — או אפילו office שנשרך
// משרשור תגובות קודם — היה נכנס ל-office, ומשתמשים ראו דואר של מחלקה אחרת.
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteInput {
  /** נמענים ישירים, לפי סדר אמינות: Delivered-To, X-Original-To, envelope, To */
  direct: string[]
  /** נמענים ב-Cc — נחשבים רק אם אין אף נמען ישיר מוכר */
  cc?: string[]
  /** האם הנושא זוהה כבקשה (לידה/הלוואה/סיוע) */
  isRequest?: boolean
  /** נפילה-לאחור אחרונה: ה-to של ה-envelope */
  envelopeTo?: string
}

const ORG_DOMAIN = '@chasamsofer.info'
const COPY_SUBDOMAIN = '.chasamsofer.info'   // כתובת ה-copy של Google dual-delivery

export function resolveMailbox(input: RouteInput): string {
  const direct = (input.direct ?? []).filter(Boolean)
  const cc = (input.cc ?? []).filter(Boolean)
  const all = [...direct, ...cc]

  // (1) תיבה מוכרת בנמען ישיר — הקובע. Cc נבדק רק אם אין אף נמען ישיר מוכר.
  const knownDept =
    direct.find(a => departmentByEmail(a)) ??
    cc.find(a => departmentByEmail(a))
  if (knownDept) return knownDept

  // (2) בקשה — תמיד לאיגוד, גם כשהגיעה דרך כתובת ה-copy.
  //     בלי זה היא נופלת ל"משרד ראשי" ומייל הדחייה לא נשלח.
  if (input.isRequest) return 'igud@chasamsofer.info'

  // (3) כתובת ארגונית אמיתית שטרם הוגדרה כתיבה — נשמרת תחת עצמה,
  //     ולא נזרקת ל-office.
  const orgRecipient = all.find(a => a.endsWith(ORG_DOMAIN))
  if (orgRecipient) return orgRecipient

  // (4) הגיע רק דרך כתובת ה-copy של ה-subdomain, בלי נמען מקורי מזוהה —
  //     "משרד ראשי" כדי שלא יישאר יתום מחוץ לכל התיבות.
  if (all.some(a => a.endsWith(COPY_SUBDOMAIN))) return 'office@chasamsofer.info'

  return input.envelopeTo ?? ''
}
