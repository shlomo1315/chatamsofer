// ─────────────────────────────────────────────────────────────────────────────
// השוואת שמות בעץ הדורות — הבסיס לזיהוי כפילויות.
//
// ⚠️ למה לא די בהשוואת מחרוזות: אותו אדם נרשם על ידי צאצאים שונים, וכל אחד
// כותב אחרת. מהנתונים האמיתיים:
//     "רבי מרדכי ושרה שטרלינג"   מול   "ר' מרדכי צבי ושרה שטרלינג"
// שני הבדלים בזוג אחד — תואר שונה (רבי / ר') ושם אמצעי שקיים רק באחד.
// השוואה מדויקת הייתה מפספסת את רוב הכפילויות האמיתיות.
//
// ⚠️ ומצד שני — הכלי הזה *מציע בלבד*. מיזוג של שני אנשים שאינם אותו אדם הוא
// הרסני, ולכן רק התאמה ברמת 'exact' (זהות מלאה אחרי נרמול) מותרת למיזוג
// אוטומטי. כל השאר מוצג לאדם להכרעה, עם הסיבה כתובה במפורש.
// ─────────────────────────────────────────────────────────────────────────────

/** תארים שלפני השם — אינם חלק מהזהות. אחרי הסרת גרשיים. */
const HONORIFICS = new Set([
  'רבי', 'ר', 'הרב', 'הרר', 'הרהג', 'הרהח', 'מוהר', 'מוהרר', 'אדמור', 'האדמור',
  'הגאון', 'הגהצ', 'רמ', 'הגר', 'מרן', 'הצדיק', 'הרהק', 'רהק',
])

/** סיומות כבוד שאחרי השם — אינן חלק מהזהות. אחרי הסרת גרשיים. */
const SUFFIXES = new Set([
  'זל', 'זצל', 'זצוקל', 'זצוקללהה', 'שליטא', 'עה', 'היד', 'זיע', 'ני',
  'שיחי', 'תחי', 'הי', 'זכרונו', 'לברכה', 'נבג', 'זצללהה',
])

const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }

/**
 * נרמול בסיסי: מסיר גרשיים/מקפים/פיסוק, מאחד רווחים, ומאחד אותיות סופיות.
 * ⚠️ אותיות סופיות מאוחדות רק לצורך *השוואה* — לא לתצוגה. הן אינן משנות
 * זהות ("אברהם"/"אברהמ"), ואיחודן מונע פספוס בגלל הקלדה.
 */
export function normalizeHebrewName(raw: string): string {
  return String(raw ?? '')
    .replace(/[֑-ׇ]/g, '')            // ניקוד וטעמים
    .replace(/[׳״'"`.,\-–—_()[\]{}]/g, '')      // גרש, גרשיים ופיסוק
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.split('').map(c => FINALS[c] ?? c).join(''))
    .join(' ')
}

export interface ParsedName {
  /** שמות פרטיים של האיש (בלי תארים, בלי בת הזוג, בלי שם המשפחה) */
  given: string[]
  /** שם בת הזוג אם צוין ("ושרה" → "שרה"), אחרת null */
  spouse: string | null
  /** שם המשפחה — המילה האחרונה */
  family: string
  /** כל המילים המשמעותיות, לצורך השוואת גיבוי */
  words: string[]
}

/**
 * פירוק שם למבנה. התבנית הרווחת בעץ:
 *     [תואר] <שם/שמות האיש> [ו<שם האשה>] <שם משפחה>
 * למשל: "רבי מרדכי צבי ושרה שטרלינג"
 */
export function parseHebrewName(raw: string): ParsedName {
  const words = normalizeHebrewName(raw)
    .split(' ')
    .filter(Boolean)
    .filter(w => !HONORIFICS.has(w) && !SUFFIXES.has(w))

  if (!words.length) return { given: [], spouse: null, family: '', words: [] }

  // ⚠️ שם המשפחה הוא המילה האחרונה — אך רק אם נותר יותר משם אחד. לשם בודד
  // ("יעקב") אין שם משפחה, וקביעתו כשם משפחה הייתה מייצרת התאמות שגויות
  // בין כל שני אנשים ששמם הפרטי זהה.
  const family = words.length > 1 ? words[words.length - 1] : ''
  const rest = words.length > 1 ? words.slice(0, -1) : words

  // בת הזוג — המילה הראשונה שמתחילה ב-ו' החיבור (ואינה המילה הראשונה בכלל)
  const spouseIdx = rest.findIndex((w, i) => i > 0 && w.startsWith('ו') && w.length > 2)
  const spouse = spouseIdx >= 0 ? rest[spouseIdx].slice(1) : null
  const given = spouseIdx >= 0 ? rest.slice(0, spouseIdx) : rest

  return { given, spouse, family, words }
}

export type MatchLevel = 'exact' | 'strong' | 'possible' | 'none'

export interface NameMatch {
  level: MatchLevel
  /** הסבר בעברית — מוצג למשתמש כדי שיוכל לשפוט, במקום ציון דמיון אטום */
  reason: string
}

const eq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
const isSubset = (small: string[], big: string[]) => small.every(w => big.includes(w))
/** כתיב מלא/חסר — "דוד"/"דויד", "משה"/"מושה" */
const skeleton = (w: string) => w.replace(/[וי]/g, '')

/**
 * משווה שני שמות ומחזיר רמת ודאות + נימוק.
 *
 * exact    — זהים לחלוטין אחרי נרמול. מותר למיזוג אוטומטי.
 * strong   — שם משפחה ובת זוג תואמים, והשמות הפרטיים של האחד מוכלים בשני
 *            (שם אמצעי עודף). הצעה חזקה — דורשת אישור אדם.
 * possible — חפיפה חלקית או הבדלי כתיב מלא/חסר. לעיון בלבד.
 * none     — אין קשר.
 */
export function compareHebrewNames(a: string, b: string): NameMatch {
  const na = normalizeHebrewName(a)
  const nb = normalizeHebrewName(b)
  if (!na || !nb) return { level: 'none', reason: 'שם ריק' }
  if (na === nb) return { level: 'exact', reason: 'השמות זהים' }

  const pa = parseHebrewName(a)
  const pb = parseHebrewName(b)

  // ⚠️ בלי שם משפחה תואם אין התאמה כלל. זה העוגן היחיד שמונע חיבור בין
  // "מרדכי שטרלינג" ל"מרדכי מנדלוביץ" רק בגלל השם הפרטי המשותף.
  if (!pa.family || !pb.family) return { level: 'none', reason: 'אין שם משפחה להשוואה' }

  const sameFamily = pa.family === pb.family
  const familySkeleton = skeleton(pa.family) === skeleton(pb.family)
  if (!sameFamily && !familySkeleton) return { level: 'none', reason: 'שם משפחה שונה' }

  // אותו שם משפחה, אך אחרי הסרת תארים בלבד השאר זהה
  if (eq(pa.words, pb.words)) {
    return { level: 'exact', reason: 'זהים אחרי הסרת תארים וסימני כבוד' }
  }

  const spouseSame = pa.spouse === pb.spouse
  const spouseMissing = pa.spouse === null || pb.spouse === null

  if (sameFamily && spouseSame && (isSubset(pa.given, pb.given) || isSubset(pb.given, pa.given))) {
    const extra = pa.given.length > pb.given.length
      ? pa.given.filter(w => !pb.given.includes(w))
      : pb.given.filter(w => !pa.given.includes(w))
    return {
      level: 'strong',
      reason: extra.length
        ? `שם משפחה ובת הזוג זהים · הפרש: שם אמצעי «${extra.join(' ')}»`
        : 'שם משפחה ובת הזוג זהים',
    }
  }

  if (sameFamily && spouseMissing && (isSubset(pa.given, pb.given) || isSubset(pb.given, pa.given))) {
    return { level: 'strong', reason: 'שם משפחה ושם פרטי תואמים · בת הזוג צוינה רק באחד מהם' }
  }

  // כתיב מלא/חסר
  if (eq(pa.words.map(skeleton), pb.words.map(skeleton))) {
    return { level: 'possible', reason: 'הבדל בכתיב מלא/חסר בלבד' }
  }

  if (sameFamily && pa.given[0] && pa.given[0] === pb.given[0]) {
    return { level: 'possible', reason: 'שם משפחה ושם פרטי ראשון זהים · שאר השמות שונים' }
  }

  return { level: 'none', reason: 'השמות שונים' }
}
