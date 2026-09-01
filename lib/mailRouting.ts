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
  /**
   * 🔴 כתובות התיבות שהמנהל הוסיף בהגדרות.
   *
   * ⚠️ departmentByEmail מכיר רק את המחלקות הקבועות. בלי הרשימה הזו
   * מייל ל-m@chasamsofer.info לא זוהה כתיבה, נפל לכלל "הגיע דרך
   * ה-copy" — ונענה מ-office@. הפונה שלח לתיבה אחת וקיבל מענה מאחרת.
   */
  customEmails?: string[]
}

/** האם הכתובת היא תיבה מוכרת — קבועה או מותאמת. */
function knownBox(addr: string, custom?: string[]): string | null {
  const dep = departmentByEmail(addr)
  if (dep) return dep.email
  const a = addr.toLowerCase().trim()
  return (custom ?? []).some(c => c.toLowerCase().trim() === a) ? a : null
}

const ORG_DOMAIN = '@chasamsofer.info'
const COPY_SUBDOMAIN = '.chasamsofer.info'   // כתובת ה-copy של Google dual-delivery

/**
 * כל התיבות המוכרות שהמייל הופנה אליהן — לפי סדר עדיפות.
 *
 * 🔴 נדרש כי מייל אחד יכול להיות מופנה לכמה אגפים בבת אחת. resolveMailbox
 * מחזיר אחת בלבד (התיבה שבה ההודעה תישמר), אבל **המענה האוטומטי חייב
 * לצאת מכל אחת מהן**: מי ששלח ל-office ול-igud יחד קיבל את מענה האופיס
 * פעמיים — פעם לכל עותק של dual-delivery — במקום מענה מכל אגף.
 *
 * ⚠️ ישירים לפני Cc, ובלי כפילויות.
 */
export function resolveAllMailboxes(input: RouteInput): string[] {
  const direct = (input.direct ?? []).filter(Boolean)
  const cc = (input.cc ?? []).filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of [...direct, ...cc]) {
    const box = knownBox(a, input.customEmails)
    if (!box) continue
    const key = box.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(box)
  }
  return out
}

export function resolveMailbox(input: RouteInput): string {
  const direct = (input.direct ?? []).filter(Boolean)
  const cc = (input.cc ?? []).filter(Boolean)
  const all = [...direct, ...cc]

  // (1) תיבה מוכרת בנמען ישיר — הקובע. Cc נבדק רק אם אין אף נמען ישיר מוכר.
  //
  // 🔴 תיבה *ייעודית* גוברת על office, גם כשהיא מופיעה אחריה ברשימה.
  //
  // ⚠️ office היא יעד ההעברה של שאר התיבות, ולכן היא נספחת ל-envelope
  // כמעט תמיד — גם כשהפונה כתב לאגף אחד בלבד. הסדר ב-received_for
  // שרירותי, וכשהיא הופיעה ראשונה היא "בלעה" את הפנייה: מייל שנשלח
  // ל-c@ בלבד נשמר תחת office, והמענה האוטומטי יצא ממשרד ראשי במקום
  // מעזר לחגים. לפונה זה נראה כאילו ההגדרות של האגף אינן עובדות.
  //
  // ⚠️ office עדיין נבחרת כשהיא התיבה המוכרת היחידה — ראו הבדיקה
  // ב-mailRouting.test.ts.
  const isGeneric = (a: string) => /^office@/i.test(a.trim())
  const pick = (list: string[]) =>
    list.find(a => knownBox(a, input.customEmails) && !isGeneric(a)) ??
    list.find(a => knownBox(a, input.customEmails))
  const knownDept = pick(direct) ?? pick(cc)
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
