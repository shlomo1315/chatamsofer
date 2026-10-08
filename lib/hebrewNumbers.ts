// ─────────────────────────────────────────────────────────────────────────────
// מספרים במילים ← ספרות, בכתובות שתומללו מהקלטה (בקשת המשתמש 08.10).
//
//   "רחוב מלכי ישראל עשרים ושתיים"  →  "מלכי ישראל 22"
//   "דירה חמש"                        →  "דירה 5"
//
// 🔴 שמות מקומות שמכילים מספר נשמרים: "באר שבע", "קריית שמונה", "מאה
// שערים", "ארבע ארצות". המרה עיוורת הייתה שולחת חבילה ל"באר 7".
//
// ⚠️ טהור ובלי תלויות — רץ גם בסקריפט התיקון החד-פעמי וגם בשלוחה.
// ─────────────────────────────────────────────────────────────────────────────

const UNITS: Record<string, number> = {
  'אחד': 1, 'אחת': 1,
  'שתיים': 2, 'שתים': 2, 'שניים': 2, 'שנים': 2, 'שני': 2, 'שתי': 2,
  'שלוש': 3, 'שלושה': 3, 'שלש': 3, 'שלשה': 3,
  'ארבע': 4, 'ארבעה': 4,
  'חמש': 5, 'חמישה': 5, 'חמשה': 5,
  'שש': 6, 'שישה': 6, 'ששה': 6,
  'שבע': 7, 'שבעה': 7,
  'שמונה': 8,
  'תשע': 9, 'תשעה': 9,
}

const TENS: Record<string, number> = {
  'עשר': 10, 'עשרה': 10,
  'עשרים': 20, 'שלושים': 30, 'שלשים': 30, 'ארבעים': 40, 'חמישים': 50,
  'שישים': 60, 'ששים': 60, 'שבעים': 70, 'שמונים': 80, 'תשעים': 90,
}

const HUNDREDS: Record<string, number> = { 'מאה': 100, 'מאתיים': 200, 'מאות': 100 }

/** מילה שמשמשת כחלק משם מקום — המספר שלידה אינו מספר בית. */
const PROTECT_BEFORE = new Set(['באר', 'קרית', 'קריית'])
const PROTECT_AFTER = new Set(['שערים', 'ארצות', 'הכוכבים', 'העם'])

/** מילה בודדת (בלי ו' החיבור) ← ערך ומעמד. */
function wordValue(w: string): { v: number; kind: 'unit' | 'ten' | 'hundred' } | null {
  if (w in UNITS) return { v: UNITS[w], kind: 'unit' }
  if (w in TENS) return { v: TENS[w], kind: 'ten' }
  if (w in HUNDREDS) return { v: HUNDREDS[w], kind: 'hundred' }
  return null
}

/** הסרת ו' החיבור — רק אם מה שנשאר הוא מילת מספר. */
function stripVav(w: string): string {
  return w.startsWith('ו') && wordValue(w.slice(1)) ? w.slice(1) : w
}

/**
 * פענוח רצף מילות מספר שמתחיל ב-tokens[i].
 * @returns הערך ומספר המילים שנצרכו, או null אם אין שם מספר.
 */
function parseNumber(tokens: string[], i: number): { value: number; used: number } | null {
  let total = 0
  let current = 0
  let used = 0
  let sawAny = false

  for (let k = i; k < tokens.length; k++) {
    const raw = tokens[k]
    const w = sawAny ? stripVav(raw) : raw
    const wv = wordValue(w)
    if (!wv) break

    if (wv.kind === 'hundred') {
      // "שלוש מאות" — היחידה שלפני מוכפלת; "מאה"/"מאתיים" לבדן
      if (w === 'מאות') { current = (current || 1) * 100; total += current; current = 0 }
      else { total += current + wv.v; current = 0 }
    } else if (wv.kind === 'ten') {
      // "אחת עשרה" / "שלוש עשרה" — יחידה ואחריה עשר/עשרה
      if ((w === 'עשר' || w === 'עשרה') && current > 0 && current < 10) current += 10
      else current += wv.v
    } else {
      // יחידה אחרי יחידה ("שתיים שלוש") — שני מספרים נפרדים; עוצרים
      if (current % 10 !== 0 && current < 10 && sawAny && !raw.startsWith('ו')) break
      current += wv.v
    }
    sawAny = true
    used = k - i + 1
  }

  if (!sawAny) return null
  return { value: total + current, used }
}

/**
 * המרת כל רצפי המספרים בטקסט לספרות, והסרת "רחוב" בתחילת הכתובת.
 *
 * ⚠️ פיסוק נשמר: "עשרים ושתיים," → "22,".
 */
export function hebrewNumbersToDigits(text: string): string {
  if (!text) return text
  // "רחוב" / "ברחוב" בתחילת הכתובת או אחרי פסיק — אינו חלק מהשם.
  const cleaned = text.replace(/(^|,\s*)ב?רחוב\s+/g, '$1')

  // פיצול לאסימונים תוך שמירת הפיסוק הצמוד
  const parts = cleaned.split(/(\s+)/)
  const words: { core: string; pre: string; post: string; idx: number }[] = []
  parts.forEach((p, idx) => {
    if (!p.trim()) return
    const m = p.match(/^([^א-ת\d]*)(.*?)([^א-ת\d]*)$/)
    words.push({ pre: m?.[1] ?? '', core: m?.[2] ?? p, post: m?.[3] ?? '', idx })
  })

  const out = [...parts]
  const tokens = words.map(w => w.core)
  for (let i = 0; i < words.length; i++) {
    const prev = i > 0 ? tokens[i - 1] : ''
    if (PROTECT_BEFORE.has(prev)) continue
    // ⚠️ פיסוק (פסיק, נקודה) אחרי מילה סוגר את הרצף: "עשרים, שתיים" הם
    // שני מספרים ולא 22.
    let end = i
    while (end < words.length - 1 && !words[end].post) end++
    const parsed = parseNumber(tokens.slice(0, end + 1), i)
    if (!parsed) continue
    const next = tokens[i + parsed.used] ?? ''
    if (PROTECT_AFTER.has(next)) { i += parsed.used - 1; continue }

    const first = words[i], last = words[i + parsed.used - 1]
    out[first.idx] = `${first.pre}${parsed.value}${last.post}`
    for (let k = i + 1; k < i + parsed.used; k++) {
      out[words[k].idx] = ''
      // הרווח שלפני מילה שנמחקה
      if (words[k].idx > 0) out[words[k].idx - 1] = ''
    }
    i += parsed.used - 1
  }
  return out.join('').replace(/\s{2,}/g, ' ').trim()
}
