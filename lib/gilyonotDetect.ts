// זיהוי אוטומטי של עמודות בטופס נדרים (בטוח לשימוש גם בדפדפן).
// בנדרים העמודות נקראות Field1..Field100, אז מזהים לפי התוכן ולא לפי השם.
export const DETECT_FIELDS = Array.from({ length: 100 }, (_, i) => `Field${i + 1}`)

const FIELD_RE = /^Field\d{1,3}$/
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+$/.test(v)
const fieldNum = (f: string) => Number(f.slice(5))

/**
 * עמודת המייל: זו שהכי הרבה ערכים בה נראים כמייל (שדות ריקים לא נספרים).
 * השם: העמודה הראשונה עם אותיות ובלי ספרות או @.
 */
export function detectColumns(rows: Record<string, string>[]): { emailField: string; nameField: string } {
  const fields = [...new Set(rows.flatMap(r => Object.keys(r)).filter(k => FIELD_RE.test(k)))].sort((a, b) => fieldNum(a) - fieldNum(b))
  const val = (r: Record<string, string>, f: string) => String(r[f] ?? '').trim()
  let emailField = '', best = 0
  for (const f of fields) {
    const n = rows.filter(r => looksLikeEmail(val(r, f))).length
    if (n > best) { best = n; emailField = f }
  }
  const nameField = fields.find(f => {
    if (f === emailField) return false
    const vals = rows.map(r => val(r, f)).filter(Boolean)
    return vals.length > 0 && vals.every(v => /[א-תa-zA-Z]/.test(v) && !/\d|@/.test(v))
  }) ?? ''
  return { emailField, nameField }
}
