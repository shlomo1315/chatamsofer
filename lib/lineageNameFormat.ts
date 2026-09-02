// ─────────────────────────────────────────────────────────────────────────────
// ניסוח אחיד לשמות בעץ הדורות: «רבי משה ומרת חיה כהן».
//
// ⚠️ למה זה חשוב: הנרשמים כותבים כל אחד אחרת — "רבי", "ר'", "הרב", "מוהר"ר",
// ועם סיומות כבוד בסוף ("שליט"א", "הי"ו", "ז"ל"). התוצאה היא אותו אדם שמופיע
// בעץ בארבעה ניסוחים שונים, וכל אחד מהם נראה כמו אדם אחר.
//
// הפתרון: הנרשם מזין *רק את השמות הפרטיים* ואת שם המשפחה, והמערכת מרכיבה את
// הניסוח. כך כל השמות נכנסים באותה צורה מלכתחילה, ואין מה למזג אחר כך.
// ─────────────────────────────────────────────────────────────────────────────

export const HUSBAND_TITLE = 'רבי'
// ⚠️ תואר האישה — "מרת" (לא "הרבנית"): הפורמט הרצוי הוא «רבי משה ומרת חיה כהן».
export const WIFE_TITLE = 'מרת'

/** תארים שלפני השם — אין להזין אותם, המערכת מוסיפה בעצמה. */
const PREFIX_TITLES = [
  'רבי', 'רב', 'הרב', 'הרה"ג', 'הרהג', 'הרה"ח', 'הרהח', 'מוה"ר', 'מוהר', 'מוהר"ר', 'מוהרר',
  'האדמו"ר', 'האדמור', 'אדמו"ר', 'אדמור', 'הר"ר', 'הרר', 'הגאון', 'הגה"צ', 'הגהצ',
  'מרן', 'הצדיק', 'ר', 'הרבנית', 'מרת', 'הגברת',
]

/** סיומות כבוד — אין להזין אותן. */
const SUFFIX_TITLES = [
  'שליט"א', 'שליטא', 'זצ"ל', 'זצל', 'ז"ל', 'זל', 'זצוק"ל', 'זצוקל', 'ע"ה', 'עה',
  'הי"ו', 'היו', 'הי"ד', 'היד', 'נ"י', 'ני', 'זי"ע', 'זיע', 'שיחי\'', 'שיחי', 'תחי\'', 'תחי',
  // ⚠️ צורת הרבים חסרה כאן וזו הצורה שמופיעה בפועל על זוג ("יוסף ושפרה … שיחיו"),
  // שהיא רוב הצמתים בעץ. בלעדיה נוצר עותק נפרד לאותו אדם עם ובלי הברכה.
  'שיחיו', 'תחיו', 'שיחיו\'',
]

const bare = (w: string) => w.replace(/["'׳״]/g, '')

/**
 * מנקה תארים וסיומות כבוד משם פרטי, ומחזיר את השם בלבד.
 * "הרב משה שליט\"א" → "משה"
 */
export function stripTitles(raw: string): string {
  const words = String(raw ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const pre = new Set(PREFIX_TITLES.map(bare))
  const suf = new Set(SUFFIX_TITLES.map(bare))
  let start = 0
  let end = words.length
  while (start < end && pre.has(bare(words[start]))) start++
  while (end > start && suf.has(bare(words[end - 1]))) end--
  return words.slice(start, end).join(' ')
}

/** האם הוזן תואר או סיומת כבוד — לצורך הודעה למשתמש. */
export function findTitles(raw: string): string[] {
  const words = String(raw ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const pre = new Set(PREFIX_TITLES.map(bare))
  const suf = new Set(SUFFIX_TITLES.map(bare))
  const found: string[] = []
  if (words.length && pre.has(bare(words[0]))) found.push(words[0])
  if (words.length > 1 && suf.has(bare(words[words.length - 1]))) found.push(words[words.length - 1])
  return found
}

export interface LineageNameParts {
  /** שם פרטי של הבעל — בלי תארים */
  husband: string
  /** שם פרטי של האישה — בלי תארים. אופציונלי. */
  wife?: string | null
  /** שם המשפחה */
  family: string
}

/**
 * מרכיב את הניסוח האחיד.
 *   { husband:'משה', wife:'חיה', family:'כהן' } → «רבי משה ומרת חיה כהן»
 *   { husband:'משה', family:'כהן' }             → «רבי משה כהן»
 *
 * ⚠️ מנקה תארים גם כאן ולא רק בטופס: אותה פונקציה משרתת את הרישום הציבורי
 * ואת טופס נדרים פלוס, ובטופס חיצוני אי אפשר לסמוך על ולידציה בצד הלקוח.
 */
export function composeLineageName(parts: LineageNameParts): string {
  const h = stripTitles(parts.husband ?? '')
  const w = stripTitles(parts.wife ?? '')
  const f = String(parts.family ?? '').replace(/\s+/g, ' ').trim()
  if (!h && !w) return f
  const people = w
    ? `${HUSBAND_TITLE} ${h} ו${WIFE_TITLE} ${w}`
    : `${HUSBAND_TITLE} ${h}`
  return [people, f].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * האם הערך כבר בניסוח האחיד — כדי לא להוסיף תואר פעמיים לשם שהגיע מוכן.
 */
export function alreadyFormatted(name: string): boolean {
  return new RegExp(`^\\s*${HUSBAND_TITLE}\\s`).test(String(name ?? ''))
}

/**
 * ממיר את תואר האישה הישן לניסוח הנוכחי: « והרבנית » → « ומרת ».
 *
 * ⚠️ נדרש גם אחרי המיגרציה הרטרואקטיבית (20260805) שהמירה את כל העץ. שם
 * שמגיע *כבר מנוסח* — מטופס נדרים פלוס או מייבוא חוזר — עוקף את ההרכבה
 * ב-alreadyFormatted ונשמר מילה במילה, ולכן "והרבנית" היה ממשיך להיכנס לעץ
 * אחרי שכל השאר כבר הומר, ואותו אדם היה מופיע בשני ניסוחים.
 *
 * מחליף רק את הצירוף עם רווחים משני הצדדים, כדי לא לפגוע בשם שמתחיל
 * ב"הרבנית" או בשם משפחה שמכיל את המילה.
 */
export function normalizeWifeTitle(name: string): string {
  return String(name ?? '').replace(/ והרבנית /g, ` ו${WIFE_TITLE} `)
}

/**
 * נרמול שם דור שהתקבל מהרשת — לרישום הציבורי ולטופס נדרים פלוס כאחד.
 *
 * מקבל או שדות מופרדים (husband/wife/family) או שם מוכן (name), ומחזיר תמיד
 * את הניסוח האחיד. שם שכבר בפורמט מוחזר כמות שהוא, כדי לא להוסיף תואר פעמיים.
 *
 * ⚠️ קיים בשרת ולא רק בטופס: טופס נדרים פלוס הוא חיצוני, ואי אפשר לסמוך שם
 * על ולידציה בצד הלקוח.
 */
export function normalizeLineageNodeName(
  n: { name?: string | null; husband?: string | null; wife?: string | null; family?: string | null } | null | undefined,
): string {
  if (!n) return ''
  if (n.husband || n.family) {
    return composeLineageName({ husband: n.husband ?? '', wife: n.wife ?? '', family: n.family ?? '' })
  }
  const raw = String(n.name ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  if (alreadyFormatted(raw)) return normalizeWifeTitle(raw)

  // שם חופשי שהגיע בלי פירוק: מסירים תארים בקצוות ומרכיבים מחדש. המילה
  // האחרונה היא שם המשפחה, והחלק שאחרי ו' החיבור הוא שם האישה.
  const cleaned = stripTitles(raw)
  const words = cleaned.split(' ').filter(Boolean)
  if (words.length < 2) return cleaned || raw
  const family = words[words.length - 1]
  const rest = words.slice(0, -1)
  const wIdx = rest.findIndex((w, i) => i > 0 && w.startsWith('ו') && w.length > 2)
  const husband = (wIdx >= 0 ? rest.slice(0, wIdx) : rest).join(' ')
  const wife = wIdx >= 0 ? stripTitles(rest.slice(wIdx).join(' ').replace(/^ו/, '')) : ''
  return composeLineageName({ husband, wife, family })
}

// ─────────────────────────────────────────────────────────────────────────────
// מפתח זהות לצומת בעץ — לזיהוי "אותו אדם" בלבד, לא לתצוגה.
//
// 🔴 למה זה נדרש: הרישום הציבורי בדק קיום עם `ilike(name)` על השם המלא, וכל
// הפרש ניסוח יצר אדם חדש. כך נולדו ארבעה עותקים של "רבי יהודה ומרת גיטל
// ברנדייס" תחת אותו אב — שניים בניסוח "ומרת גיטל" ושניים "וגיטל" — ומתחת
// לכל אחד מהם עותק נוסף של אותו בן.
//
// מסיר את מה שאינו מזהה אדם: תארים ("רבי", "מרת"), סיומות כבוד ("שליט\"א",
// "שיחיו"), גרשיים, ו' החיבור שלפני שם האישה, וכפל רווחים.
//
// ⚠️ אינו מוחזר למשתמש ואינו נשמר — הוא ארעי ולהשוואה בלבד. השם המוצג נשאר
// כפי שהוזן, כי הניסוח המלא הוא מידע אמיתי שאין למחוק.
//
// ⚠️ שמרני במכוון: מפתח אגרסיבי מדי ימזג שני אנשים *שונים* בעלי שם דומה,
// וזו טעות הרבה יותר יקרה מכפילות — היא מוחקת אדם מהעץ. מקרי הגבול נשארים
// לסורק הכפילויות ולהכרעת אדם.
// ─────────────────────────────────────────────────────────────────────────────
export function lineageIdentityKey(name: string | null | undefined): string {
  const words = String(name ?? '')
    .replace(/["'׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

  const titles = new Set([...PREFIX_TITLES, ...SUFFIX_TITLES].map(bare))
  const out: string[] = []
  for (const w of words) {
    // ו' חיבור שלפני שם האישה — "וגיטל" ו-"ומרת גיטל" חייבים להצטמצם לאותו דבר.
    const noVav = w.length > 2 && w.startsWith('ו') ? w.slice(1) : w
    if (titles.has(bare(noVav))) continue   // "ומרת" → "מרת" → מושמט
    if (titles.has(bare(w))) continue
    out.push(bare(noVav))
  }
  return out.join(' ').toLowerCase()
}
