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
  // שגיאות מקלדת — אות סמוכה במקום הנכונה (דווחו מהמאגר בפועל):
  // t↔i, q↔a, s↔a, k↔l, n↔m — כולן שכנות בפריסת QWERTY.
  'gmatl.com': 'gmail.com',
  'mqil.com': 'gmail.com',
  'gmqil.com': 'gmail.com',
  'gmsil.com': 'gmail.com',
  'gmaik.com': 'gmail.com',
  'gmaul.com': 'gmail.com',
  'gmaol.com': 'gmail.com',
  'gmaill.co.il': 'gmail.com',
  'gmial.co.il': 'gmail.com',
  'gnail.co.il': 'gmail.com',
  'gmail.som': 'gmail.com',
  'gmail.cok': 'gmail.com',
  'gmail.con.': 'gmail.com',
  'gmail.comn': 'gmail.com',
  'gmail.copm': 'gmail.com',
  'gmail.cmo': 'gmail.com',
  'gmail.coma': 'gmail.com',
  'gmail.comil': 'gmail.com',
  'gmail.c0m': 'gmail.com',
  'gmail.cam': 'gmail.com',
  'gmail.cin': 'gmail.com',
  'gmail.cpom': 'gmail.com',
  'gmail.ccom': 'gmail.com',
  'gmail.comm.il': 'gmail.com',
  'gmail.con1': 'gmail.com',
  'gemail.com': 'gmail.com',
  'gmmail.com': 'gmail.com',
  'ggmail.com': 'gmail.com',
  'gmaii.com': 'gmail.com',
  'gmaiil.com': 'gmail.com',
  'gmailcom.com': 'gmail.com',
  'gmail.email': 'gmail.com',
  // ⚠️ בלי ה-g לגמרי — "mail.com" הוא דומיין אמיתי וקיים ולכן *אינו* כאן.
  // רק צורות שאינן קיימות כדומיין עצמאי.
  'maill.com': 'gmail.com',
  'gmali.co.il': 'gmail.com',

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

  const target = DOMAIN_FIXES[domain] ?? nearMissDomain(domain)
  if (!target || target === domain) return null

  return { original: raw, fixed: `${local}@${target}`, fromDomain: domain, toDomain: target }
}

/**
 * דומיינים אמיתיים שאין לגעת בהם לעולם.
 *
 * ⚠️ זו רשימת ההגנה של nearMissDomain. "gmail.co" נראה כמו שגיאה אבל
 * הוא דומיין קולומביאני אמיתי; "mail.com" ו-"mail.ru" הם ספקים פעילים.
 * בלי הרשימה הזו האלגוריתם היה "מתקן" כתובות עובדות והורס אותן.
 */
const REAL_DOMAINS = new Set([
  'gmail.com', 'walla.co.il', 'walla.com', 'hotmail.com', 'yahoo.com',
  'outlook.com', 'mail.com', 'mail.ru', 'icloud.com', 'me.com',
  'live.com', 'msn.com', 'aol.com', 'proton.me', 'protonmail.com',
  'bezeqint.net', 'netvision.net.il', '013net.net', 'zahav.net.il',
  'barak.net.il', 'inter.net.il', 'actcom.net.il', 'neto.net.il',
  'kd.co.il', 'nana.co.il', 'nana10.co.il', 'gmx.com', 'yandex.com',
])

/** הדומיינים שאליהם מותר "לתקן" — הנפוצים בלבד. */
const COMMON_TARGETS = ['gmail.com', 'walla.co.il', 'hotmail.com', 'yahoo.com', 'outlook.com']

/** מרחק עריכה (Levenshtein), עם עצירה מוקדמת כשעברנו את הסף. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1   // כל השורה כבר מעבר לסף
    prev = cur
  }
  return prev[b.length]
}

/**
 * תופס שגיאות כתיב שאינן ברשימה הידנית.
 *
 * 🔴 למה זה נדרש: הרשימה הידנית מדויקת אך תמיד מפגרת אחרי המציאות —
 * gmatl / mqil / gmail.cam הגיעו כולם מהשטח אחרי שהרשימה נכתבה. כל
 * שגיאת הקלדה חדשה חייבה עדכון קוד.
 *
 * ⚠️ הריסון הוא כל העניין, ושלושה תנאים מצטברים:
 *   1. הדומיין אינו ברשימת הדומיינים האמיתיים — לא נוגעים במה שעובד.
 *   2. מרחק עריכה 1 בלבד מדומיין נפוץ. מרחק 2 כבר מייצר התנגשויות
 *      (hotmail.co.il האמיתי מול hotmail.com), ומרחק 1 הוא בדיוק
 *      "החליק אות אחת" — שזו שגיאת ההקלדה האופיינית.
 *   3. התאמה יחידה. אם שני דומיינים נפוצים במרחק 1 — אי אפשר לדעת
 *      לאיזה התכוונו, וניחוש כאן היה המצאה.
 *
 * ⚠️ אורך מזערי 6: מחרוזות קצרות קרובות זו לזו במקרה.
 */
function nearMissDomain(domain: string): string | null {
  if (domain.length < 6) return null
  if (REAL_DOMAINS.has(domain)) return null

  const hits = COMMON_TARGETS.filter(t => editDistance(domain, t, 1) === 1)
  return hits.length === 1 ? hits[0] : null
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
