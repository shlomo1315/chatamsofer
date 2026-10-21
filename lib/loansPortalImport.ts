// ─────────────────────────────────────────────────────────────────────────────
// ייבוא הלוואות שכבר בוצעו — פורטל הביצוע.
//
// הרשימה מודבקת כת"ז (אחת בכל שורה, או מופרדות ברווח/פסיק). כל ת"ז
// מותאמת להלוואה המאושרת שטרם בוצעה של אותו אדם, ומסומנת כ"בוצעה".
//
// ⚠️ ת"ז עם יותר מהלוואה ממתינה אחת *לא* מסומנת: אי אפשר לדעת איזו בוצעה,
// והסימון הלא נכון היה מעלים הלוואה שעוד צריך לבצע. היא מדווחת בנפרד.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportCandidate {
  id: string
  status?: string | null
  disbursed_at?: string | null
  beneficiary?: { id_number?: string | null } | null
}

/** ת"ז להשוואה: ספרות בלבד, בלי אפסים מובילים. */
export const normalizeIdNumber = (v: string | null | undefined): string =>
  String(v ?? '').replace(/\D/g, '').replace(/^0+/, '')

/** מפרק טקסט מודבק לרשימת ת"ז ייחודית (בלי כפילויות ובלי ריקים). */
export function parseIdList(text: string): string[] {
  const seen = new Set<string>()
  for (const part of String(text ?? '').split(/[\s,;]+/)) {
    const n = normalizeIdNumber(part)
    if (n) seen.add(n)
  }
  return [...seen]
}

export interface ImportPlan {
  /** מזהי הלוואות לסימון כבוצעו. */
  loanIds: string[]
  /** ת"ז שלא נמצאה להן הלוואה ממתינה. */
  notFound: string[]
  /** ת"ז עם כמה הלוואות ממתינות — לא סומנו. */
  ambiguous: string[]
}

export function planLoanImport(ids: string[], loans: ImportCandidate[]): ImportPlan {
  const byId = new Map<string, string[]>()
  for (const l of loans) {
    if (l.status !== 'approved' || l.disbursed_at) continue
    const n = normalizeIdNumber(l.beneficiary?.id_number)
    if (!n) continue
    byId.set(n, [...(byId.get(n) ?? []), l.id])
  }
  const plan: ImportPlan = { loanIds: [], notFound: [], ambiguous: [] }
  for (const id of ids) {
    const found = byId.get(id) ?? []
    if (found.length === 0) plan.notFound.push(id)
    else if (found.length > 1) plan.ambiguous.push(id)
    else plan.loanIds.push(found[0])
  }
  return plan
}
