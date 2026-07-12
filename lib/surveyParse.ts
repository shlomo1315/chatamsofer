// ─────────────────────────────────────────────────────────────────────────────
// פרסור תשובות משוב שנשלחו כטקסט בגוף מייל חוזר.
// גמיש בכוונה — היולדת לא אמורה לזכור פורמט מדויק.
// ─────────────────────────────────────────────────────────────────────────────

// סימנים לתחילת ציטוט של המייל המקורי. בלי חיתוך כאן, המייל שלנו
// היה נכנס לתוך השובר במקום הטקסט שהיא כתבה.
const QUOTE_MARKERS: RegExp[] = [
  /^On .+ wrote:/im,
  /^בתאריך .+ כתב/im,
  /^ב.{0,40}‏?, .{0,40} כתב/im,
  /^-{2,}\s*Original Message/im,
  /^_{5,}$/m,
  /^-{5,}$/m,
  /^From:\s/im,
  /^מאת:\s/im,
  /^Sent from my /im,
  /^נשלח מ/im,
]

/** מסיר את הציטוט של המייל המקורי מתוך תשובה. */
export function stripQuotedReply(raw: string): string {
  let text = String(raw ?? '').replace(/\r\n/g, '\n')

  // חיתוך בנקודת הציטוט המוקדמת ביותר
  let cut = text.length
  for (const re of QUOTE_MARKERS) {
    const m = text.match(re)
    if (m?.index !== undefined && m.index < cut) cut = m.index
  }
  text = text.slice(0, cut)

  // הסרת שורות ציטוט (">")
  text = text
    .split('\n')
    .filter(line => !/^\s*>/.test(line))
    .join('\n')

  return text.trim()
}

const MIN_SCORE = 1
const MAX_SCORE = 10

export interface ParsedSurvey {
  scores: Record<number, number> // מספר השאלה → ציון
  freeText: string
}

/**
 * מחלץ ציונים 1–10 מטקסט חופשי.
 * תומך: "1-8 2-9" · "1. 8" · "1: 8" · "8 9 7 10" (רק אם הכמות תואמת בדיוק).
 * שורות שאינן ציונים נאספות ל-freeText.
 */
export function parseScores(text: string, count: number): ParsedSurvey {
  const clean = stripQuotedReply(text)
  const scores: Record<number, number> = {}

  // דפוס מפורש: <מספר שאלה><מפריד><ציון>
  const explicit = /(?:^|[\s,;])([1-9])\s*[-–.:)]\s*(10|[1-9])(?=$|[\s,;])/g
  let m: RegExpExecArray | null
  while ((m = explicit.exec(clean)) !== null) {
    const q = Number(m[1])
    const v = Number(m[2])
    if (q >= 1 && q <= count && v >= MIN_SCORE && v <= MAX_SCORE) scores[q] = v
  }

  // נפילה אחורה: רשימת מספרים בלבד, בכמות שתואמת בדיוק את מספר השאלות.
  // הבדיקה המדויקת חיונית — אחרת מספר טלפון ייקרא בטעות כציונים.
  if (Object.keys(scores).length === 0) {
    const hasOtherContent = clean.replace(/[\d\s,.\-–:)]/g, '').length > 0
    if (!hasOtherContent) {
      const nums = clean.match(/\b(10|[1-9])\b/g)
      if (nums && nums.length === count) {
        nums.forEach((n, i) => { scores[i + 1] = Number(n) })
      }
    }
  }

  // טקסט חופשי: שורות שאינן ציונים בלבד
  const freeText = clean
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (!t) return false
      return !/^[\d\s\-–.:,)]+$/.test(t)
    })
    .join('\n')
    .trim()

  return { scores, freeText }
}
