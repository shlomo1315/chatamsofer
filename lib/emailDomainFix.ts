// ─────────────────────────────────────────────────────────────────────────────
// תיקון שגיאות כתיב בדומיין של כתובות מייל.
//
// הרקע: נרשמים רבים הגיעו דרך נדרים והקלידו את כתובתם ידנית. חלקם שגו
// בדומיין — gnail, gmial, gmail.con — וכל מייל אליהם (שובר חלוקה, קוד
// כניסה, אישור בקשה) פשוט לא מגיע.
//
// 🔴 הגבול המדויק של הכלי הזה — וזו כל התועלת שלו:
//
//   ✅ "yosi@gnail.com"  → yosi@gmail.com
//      הדומיין שגוי והחלק שלפני ה-@ תקין. יש דומיין אחד ויחיד שהתכוונו
//      אליו, ולכן זהו תיקון ולא ניחוש.
//
//   ❌ "yosi123@gmail.com" שאינו קיים
//      הדומיין מושלם והשם שגוי. אין שום דרך לדעת מה הכוונה — כל "תיקון"
//      כאן היה המצאה. אלה נשארים לטיפול ידני / SMS.
//
// ⚠️ התיקון **אינו** מסמן את הכתובת כמאומתת. gnail→gmail הוא הסקה מבוססת,
// לא הוכחה שהתיבה קיימת ושייכת לאדם. הכתובת המתוקנת עוברת את מסלול קוד
// האימות הרגיל כמו כל אחת אחרת.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * שגיאות כתיב מוכרות → הדומיין הנכון.
 *
 * ⚠️ הרשימה מפורשת ולא מרחק-עריכה מחושב: "gmail.co" הוא גם שגיאת כתיב
 * וגם דומיין קולומביאני אמיתי, ו-"hotmail.co.il" קיים. אלגוריתם דמיון היה
 * "מתקן" כתובות עובדות והורס אותן. רשימה שנכתבה ביד מתקנת רק את מה שידוע.
 */
const DOMAIN_FIXES: Record<string, string> = {
  // ── Gmail — הנפוץ ביותר, ולכן גם השגוי ביותר ──
  'gnail.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmails.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmeil.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'gmail.cpm': 'gmail.com',
  'gmail.cim': 'gmail.com',
  'gmail.ocm': 'gmail.com',
  'gmail.vom': 'gmail.com',
  'gmail.xom': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmailc.om': 'gmail.com',
  'gmail.clm': 'gmail.com',
  'gmail.con.il': 'gmail.com',
  'gmail.co.il': 'gmail.com',

  // ── Walla ──
  'wala.co.il': 'walla.co.il',
  'walla.com': 'walla.co.il',
  'walla.co': 'walla.co.il',
  'walla.con': 'walla.co.il',
  'wallla.co.il': 'walla.co.il',

  // ── Hotmail ──
  'hotmial.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',

  // ── Yahoo ──
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yhoo.com': 'yahoo.com',

  // ── Outlook ──
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.co': 'outlook.com',
}

export interface DomainFix {
  /** הכתובת כפי שהיא במסד. */
  original: string
  /** הכתובת אחרי התיקון. */
  fixed: string
  /** הדומיין השגוי שזוהה. */
  fromDomain: string
  /** הדומיין הנכון. */
  toDomain: string
}

/**
 * מציע תיקון לכתובת, או null כשאין תיקון ודאי.
 *
 * ⚠️ מחזיר null גם כשהכתובת כבר תקינה — "אין מה לתקן" ו"לא יודע לתקן" הם
 * אותה תשובה מבחינת הקורא: אל תיגע בשורה הזו.
 */
export function suggestDomainFix(email: string | null | undefined): DomainFix | null {
  const raw = (email ?? '').trim()
  if (!raw) return null

  const at = raw.lastIndexOf('@')
  if (at <= 0 || at === raw.length - 1) return null // אין @ תקין — לא תחום הכלי הזה

  const local = raw.slice(0, at)
  const domain = raw.slice(at + 1).toLowerCase()

  // ⚠️ החלק שלפני ה-@ חייב להיות שמיש בעצמו. אם גם הוא פגום (רווחים,
  // עברית) — התיקון היה יוצר כתובת שנראית תקינה אך עדיין לא ניתנת לשליחה,
  // וזה גרוע מלהשאיר אותה מסומנת כבעייתית.
  if (!/^[\x21-\x7E]+$/.test(local) || local.includes('..')) return null

  const target = DOMAIN_FIXES[domain]
  if (!target || target === domain) return null

  return { original: raw, fixed: `${local}@${target}`, fromDomain: domain, toDomain: target }
}

/** סיכום לפי סוג השגיאה — "gnail.com → gmail.com (23)" למסך האישור. */
export interface FixGroup {
  fromDomain: string
  toDomain: string
  count: number
}

export function groupFixes(fixes: DomainFix[]): FixGroup[] {
  const m = new Map<string, FixGroup>()
  for (const f of fixes) {
    const k = `${f.fromDomain}→${f.toDomain}`
    const g = m.get(k)
    if (g) g.count++
    else m.set(k, { fromDomain: f.fromDomain, toDomain: f.toDomain, count: 1 })
  }
  // הגדולות קודם — הן שמצדיקות את הלחיצה.
  return [...m.values()].sort((a, b) => b.count - a.count)
}
