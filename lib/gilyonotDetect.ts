// זיהוי אוטומטי של עמודות בטופס נדרים (בטוח לשימוש גם בדפדפן).
export const DETECT_FIELDS = Array.from({ length: 15 }, (_, i) => `Field${i + 1}`)

/** עמודת המייל: זו שרוב הערכים בה נראים כמייל. השם: העמודה הראשונה עם אותיות ובלי ספרות. */
export function detectColumns(rows: Record<string, string>[]): { emailField: string; nameField: string } {
  let emailField = '', best = 0
  for (const f of DETECT_FIELDS) {
    const n = rows.filter(r => /\S+@\S+\.\S+/.test(r[f] ?? '')).length
    if (n > best) { best = n; emailField = f }
  }
  const nameField = DETECT_FIELDS.find(f => f !== emailField && rows.some(r => r[f]) &&
    rows.filter(r => r[f]).every(r => /[א-תa-zA-Z]/.test(r[f]) && !/\d|@/.test(r[f]))) ?? ''
  return { emailField, nameField }
}
