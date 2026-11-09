// ─────────────────────────────────────────────────────────────────────────────
// עיצוב טקסט בנוסחי המייל — הדגשה וקישורים.
//
// 🔴 למה סימון ולא HTML: הטקסט נערך במסך ההגדרות ונשלח לאלפי נמענים.
// שמירת HTML גולמי הייתה פותחת הזרקה דרך שדה שכל מזכיר יכול לערוך.
// כאן נשמר טקסט רגיל עם סימון מצומצם, וההמרה ל-HTML נעשית פעם אחת,
// אחרי ניטרול מלא.
//
// התחביר:
//   **טקסט**            → מודגש
//   [טקסט](https://...)  → קישור
//   {i}..{/i} נטוי · {u}..{/u} קו תחתון · {s}..{/s} קו חוצה
//   {sup}..{/sup} כתב עילי · {sub}..{/sub} כתב תחתי
//   {color=#c00}..{/color} צבע · {bg=#ff0}..{/bg} סימון · {size=20}..{/size} גודל
//   תחילת שורה: {center} {right} {left} {justify} — יישור · {li} — תבליט · {ol} — פריט ממוספר
//
// 🔴 ערכי הצבע והגודל נבדקים בקפדנות (hex בלבד, מספר בטווח) לפני שהם
// נכנסים ל-style, כך שאי אפשר להזריק דרכם CSS או HTML.
//
// ⚠️ תאימות לאחור מוחלטת: טקסט בלי סימון מתנהג בדיוק כמו קודם. כל
// הנוסחים הקיימים ממשיכים להיראות זהה — ראו textToHtml.
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ ניטרול מקומי ולא מ-emailTemplates: הקובץ הזה נטען גם בדפדפן (תצוגת
// העורך), ו-emailTemplates גורר איתו קוד שרת.
function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * כתובות מותרות בקישור.
 *
 * 🔴 javascript: ו-data: חסומות. הן נראות ככתובת תקינה לחלוטין בשדה
 * הטקסט, ומריצות קוד אצל מי שלוחץ.
 */
function safeUrl(raw: string): string | null {
  const u = raw.trim()
  if (!u) return null
  // ⚠️ mailto מותר — הנוסחים משתמשים בו לפנייה לאגפים.
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u
  return null
}

/** עיצוב פעיל על קטע — צבע וגודל רק אחרי אימות. */
export type Fmt = {
  i?: boolean; u?: boolean; s?: boolean; sup?: boolean; sub?: boolean
  color?: string; bg?: string; size?: number
}

/** קטע טקסט אחרי הפירוק — לפני ההמרה ל-HTML. */
export type Token =
  | { kind: 'text'; value: string; fmt?: Fmt }
  | { kind: 'bold'; value: string; fmt?: Fmt }
  | { kind: 'link'; value: string; url: string; fmt?: Fmt }

const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i
const SIZE_MIN = 8
const SIZE_MAX = 48

type Open = { name: string; val?: string }

const TAG = /^\{(\/)?(i|u|s|sup|sub|color|bg|size)(?:=([^{}\s]{1,12}))?\}/

function fmtOf(stack: Open[]): Fmt | undefined {
  if (!stack.length) return undefined
  const f: Fmt = {}
  for (const o of stack) {
    if (o.name === 'color' || o.name === 'bg') {
      if (o.val && HEX.test(o.val)) f[o.name] = o.val
    } else if (o.name === 'size') {
      const n = Number(o.val)
      if (Number.isInteger(n) && n >= SIZE_MIN && n <= SIZE_MAX) f.size = n
    } else {
      f[o.name as 'i' | 'u' | 's' | 'sup' | 'sub'] = true
    }
  }
  return Object.keys(f).length ? f : undefined
}

/** תחילת שורה: יישור או פריט רשימה. */
export type Block = { align?: 'right' | 'left' | 'center' | 'justify'; li?: boolean; ol?: boolean }
const BLOCK = /^\{(center|right|left|justify|li|ol)\}/

export function splitBlock(line: string): { block: Block; rest: string } {
  const block: Block = {}
  let rest = line
  for (let n = 0; n < 3; n++) {
    const m = BLOCK.exec(rest)
    if (!m) break
    if (m[1] === 'li') block.li = true
    else if (m[1] === 'ol') block.ol = true
    else block.align = m[1] as Block['align']
    rest = rest.slice(m[0].length)
  }
  return { block, rest }
}

/** פירוק שורה אחת. עיצוב לא נסגר — חל עד סוף השורה בלבד. */
function parseLine(s: string): Token[] {
  const out: Token[] = []
  const stack: Open[] = []
  let buf = ''
  let i = 0

  const flush = () => { if (buf) { out.push({ kind: 'text', value: buf, fmt: fmtOf(stack) }); buf = '' } }

  while (i < s.length) {
    // {תגית} / {/תגית}
    if (s[i] === '{') {
      const m = TAG.exec(s.slice(i, i + 30))
      if (m) {
        const closing = !!m[1]
        const name = m[2]
        if (!closing) {
          flush()
          stack.push({ name, val: m[3] })
          i += m[0].length
          continue
        }
        // ⚠️ סגירה בלי פתיחה נשארת טקסט, ולא נבלעת בשקט.
        let at = -1
        for (let k = stack.length - 1; k >= 0; k--) if (stack[k].name === name) { at = k; break }
        if (at >= 0) {
          flush()
          stack.splice(at, 1)
          i += m[0].length
          continue
        }
      }
    }

    // [טקסט](כתובת)
    if (s[i] === '[') {
      const close = s.indexOf(']', i + 1)
      if (close > i && s[close + 1] === '(') {
        const end = s.indexOf(')', close + 2)
        if (end > close) {
          const label = s.slice(i + 1, close)
          const url = safeUrl(s.slice(close + 2, end))
          // ⚠️ כתובת פסולה → נשאר טקסט רגיל, ולא נעלם. מחיקה שקטה של
          // מה שהמזכיר הקליד גרועה יותר מהצגתו כטקסט.
          if (url && label) {
            flush()
            out.push({ kind: 'link', value: label, url, fmt: fmtOf(stack) })
            i = end + 1
            continue
          }
        }
      }
    }

    // **מודגש**
    if (s[i] === '*' && s[i + 1] === '*') {
      const end = s.indexOf('**', i + 2)
      if (end > i + 2) {
        flush()
        out.push({ kind: 'bold', value: s.slice(i + 2, end), fmt: fmtOf(stack) })
        i = end + 2
        continue
      }
    }

    buf += s[i]
    i++
  }
  flush()
  return out
}

/**
 * פירוק הסימון לקטעים (בלי קידומות יישור/רשימה).
 *
 * ⚠️ מעבר יחיד ולא replace משורשר: החלפה אחרי החלפה הייתה מאפשרת
 * לסימון שנוצר משלב קודם להתפרש בשלב הבא.
 * ⚠️ הפירוק לפי שורות: הדגשה ועיצוב אינם נבלעים על פני שורות, כך
 * שכוכביות שנותרו בטקסט ישן (רשימות, הדגשה ידנית) לא יבלעו פסקה שלמה.
 */
export function parseRich(input: string): Token[] {
  const lines = String(input ?? '').split(/\r?\n/)
  const out: Token[] = []
  lines.forEach((ln, idx) => {
    if (idx > 0) out.push({ kind: 'text', value: '\n' })
    out.push(...parseLine(splitBlock(ln).rest))
  })
  return out
}

function styleOf(f?: Fmt): string {
  if (!f) return ''
  const css: string[] = []
  const deco: string[] = []
  if (f.u) deco.push('underline')
  if (f.s) deco.push('line-through')
  if (deco.length) css.push(`text-decoration:${deco.join(' ')}`)
  if (f.i) css.push('font-style:italic')
  if (f.color) css.push(`color:${f.color}`)
  if (f.bg) css.push(`background-color:${f.bg}`)
  if (f.size) css.push(`font-size:${f.size}px`)
  return css.join(';')
}

/** עוטף HTML כבר מנוטרל בעיצוב. */
function wrapFmt(html: string, f?: Fmt, extraStyle = ''): string {
  if (!f && !extraStyle) return html
  let out = html
  const st = [extraStyle, styleOf(f)].filter(Boolean).join(';')
  if (f?.sup) out = `<sup>${out}</sup>`
  if (f?.sub) out = `<sub>${out}</sub>`
  return st ? `<span style="${st}">${out}</span>` : out
}

function tokenHtml(t: Token): string {
  const br = (v: string) => escapeHtml(v)
  if (t.kind === 'bold') return wrapFmt(`<strong>${br(t.value)}</strong>`, t.fmt)
  if (t.kind === 'link') {
    // ⚠️ target+rel: המייל נפתח בדפדפן, וקישור בלי noopener משאיר
    // לדף היעד גישה לחלון שממנו נפתח.
    const color = t.fmt?.color ? '' : 'color:#4f46e5;'
    return wrapFmt(`<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer" style="${color}text-decoration:underline">${br(t.value)}</a>`, t.fmt)
  }
  return wrapFmt(br(t.value), t.fmt)
}

/**
 * טקסט עם סימון → HTML בטוח, כולל שבירות שורה.
 *
 * ⚠️ הניטרול קודם להמרה — כמו ב-textToHtml המקורי. ההפך היה מאפשר
 * להזריק HTML דרך הנוסח שנערך במסך ההגדרות.
 */
export function richToHtml(input: string): string {
  const lines = String(input ?? '').trim().split(/\r?\n/)
  let out = ''
  let prevBlock = false
  let num = 0
  lines.forEach((ln, idx) => {
    const { block, rest } = splitBlock(ln)
    const inner = parseLine(rest).map(tokenHtml).join('')
    const isBlock = !!(block.align || block.li || block.ol)
    num = block.ol ? num + 1 : 0
    if (isBlock) {
      const st = [block.align ? `text-align:${block.align}` : '', block.li || block.ol ? 'padding-right:18px' : ''].filter(Boolean).join(';')
      const mark = block.li ? '• ' : block.ol ? `${num}. ` : ''
      out += `<div style="${st}">${mark}${inner || '&nbsp;'}</div>`
    } else {
      // ⚠️ אחרי בלוק אין <br/>: ה-div כבר שובר שורה.
      if (idx > 0 && !prevBlock) out += '<br/>'
      out += inner
    }
    prevBlock = isBlock
  })
  return out
}

/**
 * טקסט עם סימון → טקסט נקי, לגרסת ה-plain של המייל.
 *
 * ⚠️ הקישור מוצג כ"טקסט (כתובת)": בגרסת הטקסט אין מה ללחוץ, ובלי
 * הכתובת המפורשת הנמען מקבל הפניה למקום שאינו יכול להגיע אליו.
 */
export function richToPlain(input: string): string {
  let num = 0
  return String(input ?? '').split(/\r?\n/).map(ln => {
    const { block, rest } = splitBlock(ln)
    num = block.ol ? num + 1 : 0
    return (block.li ? '• ' : block.ol ? `${num}. ` : '') + parseLine(rest).map(t =>
      t.kind === 'link' ? `${t.value} (${t.url})` : t.value,
    ).join('')
  }).join('\n')
}

/** האם יש בטקסט סימון כלשהו — לתצוגת רמז בעורך. */
export function hasRichMarkup(input: string): boolean {
  return String(input ?? '').split(/\r?\n/).some(ln => {
    const { block, rest } = splitBlock(ln)
    return !!(block.align || block.li || block.ol) || parseLine(rest).some(t => t.kind !== 'text' || t.fmt)
  })
}
