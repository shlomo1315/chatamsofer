// חודשים (YYYY-MM) מהחודש הנוכחי אחורה עד הטעינה הראשונה. חודש בלי טעינה = דולג.
export function monthRange(months: string[], cur: string): string[] {
  const first = [...months].sort()[0]
  if (!first) return []
  const out: string[] = []
  let [y, m] = cur.split('-').map(Number)
  for (let i = 0; i < 240; i++) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    if (k < first) break
    out.push(k)
    if (--m === 0) { m = 12; y-- }
  }
  return out
}
