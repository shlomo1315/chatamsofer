// ─────────────────────────────────────────────────────────────────────────────
// פעולות עיצוב על טקסט מסומן — לסרגל הצף של העורך.
// פונקציות טהורות: (טקסט, בחירה) → (טקסט, בחירה). התחביר מוגדר ב-richText.
// ─────────────────────────────────────────────────────────────────────────────
export type Sel = { value: string; start: number; end: number }

export const DEFAULT_SIZE = 15
export const SIZE_STEPS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36]

const ANY_TAG = /\{\/?(?:i|u|s|sup|sub|color|bg|size)(?:=[^{}\s]{1,12})?\}/g
const BLOCK_PREFIX = /^(?:\{(?:center|right|left|justify|li|ol)\})+/

const open = (name: string, val?: string) => `{${name}${val ? `=${val}` : ''}}`
const close = (name: string) => `{/${name}}`

/** עוטף כל שורה לא ריקה בבחירה בנפרד — העיצוב לא חוצה שורות. */
function wrapLines(text: string, name: string, val?: string): string {
  return text.split('\n').map(l => (l.trim() ? `${open(name, val)}${l}${close(name)}` : l)).join('\n')
}

/** תג עוטף מיד מחוץ לבחירה: {name=..}[בחירה]{/name}. */
function outerWrap(s: Sel, name: string): { val?: string; openLen: number } | null {
  const before = s.value.slice(0, s.start)
  const m = new RegExp(`\\{${name}(?:=([^{}\\s]{1,12}))?\\}$`).exec(before)
  if (!m) return null
  if (!s.value.slice(s.end).startsWith(close(name))) return null
  return { val: m[1], openLen: m[0].length }
}

/** האם הבחירה כבר מעוצבת בתג הזה (בתוכה או מסביבה). */
export function hasFormat(s: Sel, name: string): boolean {
  if (outerWrap(s, name)) return true
  const sel = s.value.slice(s.start, s.end)
  return new RegExp(`^\\{${name}(?:=[^{}\\s]{1,12})?\\}[^\\n]*\\{/${name}\\}$`).test(sel)
}

/** הערך הנוכחי של תג עם פרמטר (גודל/צבע) סביב הבחירה. */
export function currentValue(s: Sel, name: string): string | undefined {
  const o = outerWrap(s, name)
  if (o?.val) return o.val
  const m = new RegExp(`^\\{${name}=([^{}\\s]{1,12})\\}`).exec(s.value.slice(s.start, s.end))
  return m?.[1]
}

/** הדלקה/כיבוי של תג פשוט (נטוי, קו תחתון...). */
export function toggleTag(s: Sel, name: string): Sel {
  const o = outerWrap(s, name)
  if (o) {
    const closeLen = close(name).length
    const sel = s.value.slice(s.start, s.end)
    return {
      value: s.value.slice(0, s.start - o.openLen) + sel + s.value.slice(s.end + closeLen),
      start: s.start - o.openLen, end: s.end - o.openLen,
    }
  }
  const sel = s.value.slice(s.start, s.end)
  const inner = new RegExp(`\\{/?${name}\\}`, 'g')
  if (hasFormat(s, name)) {
    const plain = sel.replace(inner, '')
    return { value: s.value.slice(0, s.start) + plain + s.value.slice(s.end), start: s.start, end: s.start + plain.length }
  }
  const wrapped = wrapLines(sel, name)
  return { value: s.value.slice(0, s.start) + wrapped + s.value.slice(s.end), start: s.start, end: s.start + wrapped.length }
}

/** קביעת ערך לתג עם פרמטר (צבע/סימון/גודל) — מחליף ערך קיים. */
export function setValueTag(s: Sel, name: string, val: string): Sel {
  const o = outerWrap(s, name)
  if (o) {
    const prefix = s.value.slice(0, s.start - o.openLen)
    const sel = s.value.slice(s.start, s.end)
    const o2 = open(name, val)
    return {
      value: prefix + o2 + sel + s.value.slice(s.end),
      start: prefix.length + o2.length, end: prefix.length + o2.length + sel.length,
    }
  }
  const sel = s.value.slice(s.start, s.end).replace(new RegExp(`\\{/?${name}(?:=[^{}\\s]{1,12})?\\}`, 'g'), '')
  const wrapped = wrapLines(sel, name, val)
  return { value: s.value.slice(0, s.start) + wrapped + s.value.slice(s.end), start: s.start, end: s.start + wrapped.length }
}

/** הגדלה/הקטנה בצעד אחד. */
export function stepSize(s: Sel, dir: 1 | -1): Sel {
  const cur = Number(currentValue(s, 'size')) || DEFAULT_SIZE
  const next = dir > 0
    ? SIZE_STEPS.find(n => n > cur) ?? SIZE_STEPS[SIZE_STEPS.length - 1]
    : [...SIZE_STEPS].reverse().find(n => n < cur) ?? SIZE_STEPS[0]
  return setValueTag(s, 'size', String(next))
}

/** הדגשה — בתחביר ** (קיים מראש). */
export function toggleBold(s: Sel): Sel {
  const sel = s.value.slice(s.start, s.end)
  if (s.value.slice(s.start - 2, s.start) === '**' && s.value.slice(s.end, s.end + 2) === '**') {
    return { value: s.value.slice(0, s.start - 2) + sel + s.value.slice(s.end + 2), start: s.start - 2, end: s.end - 2 }
  }
  if (/^\*\*[^\n]+\*\*$/.test(sel)) {
    const plain = sel.slice(2, -2)
    return { value: s.value.slice(0, s.start) + plain + s.value.slice(s.end), start: s.start, end: s.start + plain.length }
  }
  const wrapped = sel.split('\n').map(l => (l.trim() ? `**${l}**` : l)).join('\n')
  return { value: s.value.slice(0, s.start) + wrapped + s.value.slice(s.end), start: s.start, end: s.start + wrapped.length }
}

/** ניקוי כל העיצוב מהבחירה: תגיות, הדגשה, קישורים וקידומות שורה. */
export function clearFormat(s: Sel): Sel {
  // מרחיבים לשורות שלמות כדי לתפוס גם יישור/רשימה בתחילתן.
  const ls = s.value.lastIndexOf('\n', s.start - 1) + 1
  let le = s.value.indexOf('\n', s.end)
  if (le < 0) le = s.value.length
  let seg = s.value.slice(ls, le)
  seg = seg.split('\n').map(l => l.replace(BLOCK_PREFIX, '')).join('\n')
  seg = seg.replace(ANY_TAG, '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
  return { value: s.value.slice(0, ls) + seg + s.value.slice(le), start: ls, end: ls + seg.length }
}

/** יישור/רשימה לשורות שהבחירה נוגעת בהן. align=null מבטל יישור. */
export function setBlock(s: Sel, kind: 'right' | 'center' | 'left' | 'justify' | 'li' | 'ol'): Sel {
  const ls = s.value.lastIndexOf('\n', s.start - 1) + 1
  let le = s.value.indexOf('\n', s.end)
  if (le < 0) le = s.value.length
  const lines = s.value.slice(ls, le).split('\n')
  const allHave = lines.every(l => l.includes(`{${kind}}`) && BLOCK_PREFIX.test(l))
  const out = lines.map(l => {
    const m = BLOCK_PREFIX.exec(l)
    const prefix = m ? m[0] : ''
    const rest = l.slice(prefix.length)
    const isLi = prefix.includes('{li}')
    const isOl = prefix.includes('{ol}')
    let align: string | undefined = (/\{(center|right|left|justify)\}/.exec(prefix) ?? [])[1]
    let li = isLi
    let ol = isOl
    if (kind === 'li') { li = !allHave; if (li) ol = false }
    else if (kind === 'ol') { ol = !allHave; if (ol) li = false }
    else align = allHave ? undefined : kind
    return (align ? `{${align}}` : '') + (li ? '{li}' : '') + (ol ? '{ol}' : '') + rest
  })
  const seg = out.join('\n')
  return { value: s.value.slice(0, ls) + seg + s.value.slice(le), start: ls, end: ls + seg.length }
}

/** קישור סביב הבחירה (הכתובת כבר אומתה בקריאה). */
export function applyLinkTo(s: Sel, url: string, fallbackLabel = 'טקסט הקישור'): Sel {
  const picked = s.value.slice(s.start, s.end) || fallbackLabel
  const link = `[${picked}](${url})`
  return { value: s.value.slice(0, s.start) + link + s.value.slice(s.end), start: s.start + 1, end: s.start + 1 + picked.length }
}

/** פלטת 12 צבעי המותג — היחידה שמוצעת בעורך (ערך hex בלבד). */
export const BRAND_COLORS = [
  '#14213D', '#C0912F', '#8A6A1F', '#F6EBCB', '#FFFFFF', '#6B7280',
  '#B42318', '#D9622B', '#2E7D32', '#1565C0', '#6A1B9A', '#E3DED3',
] as const
