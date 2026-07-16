// ─────────────────────────────────────────────────────────────────────────────
// נירמול שמות בעברית — לצורך השוואת שמות ביוחסין.
//
// שני שירותים:
//   stripTitles(name)  — מסיר תארים/כינויי כבוד לפני ואחרי השם (הרב, רבי, זצ"ל,
//                        שליט"א וכו') ומנקה ניקוד/גרשיים, כך שנשאר "שם נקי".
//   phoneticKey(name)  — מפתח פונטי (סוג של סאונדקס עברי): אותיות בעלות צליל דומה
//                        מתמפות לאותה מחלקה, כך ש"פרידמן" ו"פרידמאן" מקבלים מפתח זהה.
//
// המטרה: כשמשווים "שם האב" בין נרשמים — להתעלם מתארים ומהבדלי כתיב/צליל,
// ולהתמקד בגרעין השם בלבד.
// ─────────────────────────────────────────────────────────────────────────────

// תארים/כינויים שמופיעים לפני או אחרי השם. מנוקים כטוקנים שלמים.
const TITLES = new Set([
  // לפני השם
  'הרב', 'רב', 'רבי', 'ר', 'מרן', 'מורנו', 'רבינו', 'רבנו', 'מו"ר', 'מוהר"ר', 'מוה"ר',
  'הגאון', 'הגה"צ', 'הגה"ק', 'הרה"ג', 'הרה"ק', 'הרה"צ', 'הגר', 'האדמו"ר', 'אדמו"ר',
  'כ"ק', 'הצדיק', 'המקובל', 'הרב הגאון', 'הרב הצדיק', 'הר"ר', 'הרה"ח', 'הרה"ח', 'החסיד',
  'מרת', 'הרבנית', 'מרנא',
  // אחרי השם
  'זצ"ל', 'זצוק"ל', 'זצוקללה"ה', 'זי"ע', 'זיע"א', 'שליט"א', 'נר"ו', 'הי"ד', 'ע"ה',
  'נ"ע', 'ז"ל', 'נ"י', 'הכ"מ', 'זללה"ה', 'זצללה"ה',
])

/** מאחד גרשיים/גרש לצורות אחידות (" ו-'). */
function unifyQuotes(s: string): string {
  return s
    .replace(/[״“”″]/g, '"')   // ״ “ ” ″ → "
    .replace(/[׳‘’′']/g, "'")   // ׳ ‘ ’ ′ → '
}

/** מסיר ניקוד/טעמים. */
function stripNiqqud(s: string): string {
  return s.replace(/[֑-ׇ]/g, '')
}

/**
 * מסיר תארים לפני/אחרי השם ומחזיר את גרעין השם, מנוקה מניקוד ומגרשיים מיותרים.
 * לדוגמה: 'הרב רבי שמעון סופר זצ"ל' → 'שמעון סופר'.
 */
export function stripTitles(raw: string): string {
  if (!raw) return ''
  const cleaned = stripNiqqud(unifyQuotes(String(raw)))
  const words = cleaned.split(/\s+/).map(w => w.trim()).filter(Boolean)
  const kept = words.filter(w => {
    const bare = w.replace(/["']/g, '') // "רבי," / ר' → השוואה מול הרשימה
    return !TITLES.has(w) && !TITLES.has(bare) && !(bare.length <= 1)
  })
  return kept.join(' ').trim()
}

// מחלקות צליל — אותיות באותה מחלקה נחשבות דומות פונטית.
const PHON_CLASS: Record<string, string> = {}
const addClass = (letters: string, code: string) => { for (const c of letters) PHON_CLASS[c] = code }
addClass('אעהיו', 'A')   // גרוניות/אימות קריאה — צליל תנועתי/חלש
addClass('בפ', 'B')      // שפתיות
addClass('גכקח', 'K')    // חכיות/גרוניות k/kh
addClass('דטת', 'T')     // שיניות
addClass('זסשצ', 'S')    // שורקות
addClass('ל', 'L'); addClass('ר', 'R'); addClass('מ', 'M'); addClass('נ', 'N')

/** מנרמל אותיות סופיות לצורתן הרגילה. */
function unfinal(s: string): string {
  return s.replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
}

/**
 * מפתח פונטי לשם (אחרי הסרת תארים). אותיות דומות-צליל מתמפות לאותה מחלקה,
 * רצפים כפולים מתכווצים. שמות בעלי צליל דומה → מפתח זהה.
 * לדוגמה: phoneticKey('פרידמן') === phoneticKey('פרידמאן').
 */
export function phoneticKey(raw: string): string {
  const bare = unfinal(stripTitles(raw)).replace(/[^א-ת]/g, '')
  let out = ''
  let started = false
  for (const ch of bare) {
    const code = PHON_CLASS[ch]
    if (!code) continue
    if (started && code === 'A') continue        // מדלגים על אימות קריאה פנימיות (א/ה/ו/י/ע)
    if (code !== out[out.length - 1]) out += code
    started = true
  }
  return out
}

/** נירמול בסיסי להשוואה מדויקת: ללא תארים, ללא ניקוד, אותיות סופיות רגילות, אותיות עברית בלבד + רווח יחיד. */
export function normalizeName(raw: string): string {
  return stripTitles(raw)
    .replace(/[^א-ת\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * האם שני שמות "אותו אדם" מבחינת השוואה — התאמה מדויקת (מנורמלת) או פונטית.
 * מתעלם מתארים, מהבדלי כתיב, ומצליל דומה.
 */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a), nb = normalizeName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const ka = phoneticKey(a), kb = phoneticKey(b)
  return !!ka && ka === kb
}
