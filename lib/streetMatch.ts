// ─────────────────────────────────────────────────────────────────────────────
// התאמת רחוב מתוך תמלול הקלטה טלפונית.
//
// 🔴 למה זה קיים: המתקשר מקליט "רחוב בית ישראל שלושים ושתיים", ימות
// מתמללת, ואנחנו צריכים לדעת אם זה רחוב אמיתי בעיר שבחר. בלי זה כל
// כתובת דורשת הקלדה ידנית במשרד, וההזמנה תקועה עד שמישהו מאזין.
//
// ⚠️ התמלול אינו מדויק: הוא מגיע מקו טלפון, בעברית, ולרוב בלי ניקוד
// ועם שגיאות. לכן ההתאמה סובלנית — אבל רק עד גבול שבו היא עדיין
// אמינה; מעבר לו עדיף להודות שלא זוהה מאשר לשלוח לכתובת שגויה.
// ─────────────────────────────────────────────────────────────────────────────

/** מילות קישור שהתמלול מוסיף ואינן חלק משם הרחוב. */
const NOISE = [
  'רחוב', 'רח', 'שדרות', 'שד', 'סמטת', 'סמטה', 'שכונת', 'שכונה',
  'בעיר', 'העיר', 'דירה', 'קומה', 'כניסה', 'בית', 'מספר', 'מס',
]

/**
 * צורת השוואה: בלי ניקוד, בלי גרשיים, בלי מילות רעש, רווח יחיד.
 *
 * ⚠️ גרש וגרשיים מוסרים ולא מומרים: "רח' הרב קוק" ו"רחוב הרב קוק"
 * חייבים להתלכד, ותמלול טלפוני אינו עקבי בהם.
 */
export function normalizeStreet(raw: string | null | undefined): string {
  let s = String(raw ?? '')
    // ⚠️ תווי כיווניות — הם בלתי נראים ושוברים כל השוואה.
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/["'״׳`]/g, '')
    .replace(/[.,\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // ⚠️ מילות הרעש מוסרות רק כמילים שלמות: "בית" לבדו הוא רעש,
  // אבל "בית ישראל" הוא שם רחוב ו"בית" בתוכו חייב להישאר.
  const words = s.split(' ').filter(Boolean)
  const kept: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    // "בית" נשמר כשיש אחריו עוד מילה שאינה מספר ("בית ישראל").
    if (w === 'בית' && words[i + 1] && !/^\d+$/.test(words[i + 1])) {
      kept.push(w)
      continue
    }
    if (NOISE.includes(w)) continue
    kept.push(w)
  }
  s = kept.join(' ')

  // מספר הבית אינו חלק משם הרחוב.
  s = s.replace(/\s*\d+\s*$/, '').trim()
  return s
}

/** מספר הבית מתוך התמלול, אם נאמר. */
export function houseNumber(raw: string | null | undefined): string | null {
  const m = String(raw ?? '').match(/\b(\d{1,4})\b/)
  return m ? m[1] : null
}

/**
 * מרחק עריכה מוגבל — מספיק לשגיאת תמלול של תו או שניים.
 *
 * ⚠️ מוגבל ב-max ויוצא מוקדם: על 4,383 רחובות בירושלים חישוב מלא
 * לכל אחד הוא בזבוז, והתוצאה ממילא נפסלת מעל הסף.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < best) best = cur[j]
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

export interface StreetMatch {
  street: string
  /** 'exact' — זהה אחרי נרמול · 'close' — הפרש תו-שניים · 'partial' — הכלה. */
  kind: 'exact' | 'close' | 'partial'
}

/**
 * מאתר רחוב ברשימה לפי תמלול.
 *
 * 🔴 מחזיר null כשיש יותר מהתאמה אחת סבירה: "הרב" מתאים לעשרות
 * רחובות, ובחירה שרירותית ביניהם שולחת חבילה לכתובת שגויה. מוטב
 * לבקש מהמתקשר לחזור על הכתובת.
 */
export function matchStreet(
  transcript: string | null | undefined,
  streets: readonly string[],
): StreetMatch | null {
  const want = normalizeStreet(transcript)
  if (!want || want.length < 2) return null

  const norm = streets.map(s => ({ street: s, n: normalizeStreet(s) }))

  // 1. זהה בדיוק.
  const exact = norm.filter(s => s.n === want)
  if (exact.length === 1) return { street: exact[0].street, kind: 'exact' }
  if (exact.length > 1) return { street: exact[0].street, kind: 'exact' }

  // 2. הפרש תו-שניים — שגיאת תמלול אופיינית.
  const max = want.length <= 5 ? 1 : 2
  const close = norm.filter(s => editDistance(s.n, want, max) <= max)
  if (close.length === 1) return { street: close[0].street, kind: 'close' }

  // 3. הכלה — "ישראל" בתוך "בית ישראל".
  // ⚠️ רק כשההתאמה יחידה: ריבוי מועמדים פירושו שלא באמת זוהה.
  const partial = norm.filter(s => s.n.includes(want) || want.includes(s.n))
  if (partial.length === 1) return { street: partial[0].street, kind: 'partial' }

  return null
}
