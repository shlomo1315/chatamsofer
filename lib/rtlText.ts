// סידור טקסט עברי (RTL) לסדר ויזואלי, להדפסה ב-pdf-lib (שמצייר תווים משמאל לימין).
// קבצי PDF שומרים טקסט בסדר ויזואלי; מנוע ההצגה אינו מיישם bidi על גליפים ממוקמים,
// ולכן יש להמיר את הסדר הלוגי לסדר ויזואלי כאן.

// סיווג תו: R=עברית · L=לטינית/ספרה · N=ניטרלי (רווח/פיסוק)
function cls(c: string): 'R' | 'L' | 'N' {
  const n = c.codePointAt(0)!
  if ((n >= 0x0590 && n <= 0x05ff) || (n >= 0xfb1d && n <= 0xfb4f)) return 'R'
  if ((n >= 0x30 && n <= 0x39) || (n >= 0x41 && n <= 0x5a) || (n >= 0x61 && n <= 0x7a)) return 'L'
  return 'N'
}

// המרת שורה לוגית אחת לסדר ויזואלי (בסיס RTL).
export function visualRtl(line: string): string {
  const ch = [...line]
  if (ch.length === 0) return ''
  const t = ch.map(cls)
  // ניטרל בין שתי L (כמו 02-1234, 22/06/2026) → L, לשמירת מספרים/תאריכים שלמים
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== 'N') continue
    let l = i - 1; while (l >= 0 && t[l] === 'N') l--
    let r = i + 1; while (r < t.length && t[r] === 'N') r++
    t[i] = (l >= 0 && r < t.length && t[l] === 'L' && t[r] === 'L') ? 'L' : 'R'
  }
  // קיבוץ לריצות; בסיס RTL ⇒ היפוך סדר הריצות; ריצת R היפוך תווים; ריצת L נשמרת
  const runs: [string, string][] = []
  let cur = ch[0], ct = t[0]
  for (let i = 1; i < ch.length; i++) {
    if (t[i] === ct) cur += ch[i]
    else { runs.push([ct, cur]); cur = ch[i]; ct = t[i] }
  }
  runs.push([ct, cur])
  return runs.reverse().map(([ty, s]) => (ty === 'R' ? [...s].reverse().join('') : s)).join('')
}

// פיצול פסקה לשורות לפי רוחב מרבי (מילים לוגיות), והחזרת כל שורה בסדר ויזואלי.
export function wrapRtl(text: string, maxWidth: number, measure: (visual: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w
    if (line && measure(visualRtl(cand)) > maxWidth) {
      out.push(visualRtl(line))
      line = w
    } else {
      line = cand
    }
  }
  if (line) out.push(visualRtl(line))
  return out
}
