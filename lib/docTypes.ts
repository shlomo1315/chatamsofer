// ─────────────────────────────────────────────────────────────
// מקור אמת יחיד לסוגי מסמכים — בשימוש בכל המערכת:
// כרטסת (מסמכים מצורפים), צ'קליסט השלמת מסמכים, מודאל שיוך מייל,
// פורטל ציבורי, ומיילים אוטומטיים.
// ─────────────────────────────────────────────────────────────

export interface DocTypeOption {
  value: string
  label: string
}

export const DOC_TYPES: DocTypeOption[] = [
  { value: 'id_husband', label: 'ת.ז. הבעל' },
  { value: 'id_wife',    label: 'ת.ז. האישה' },
  { value: 'id_child',   label: 'ת.ז. ילד' },
  { value: 'other',      label: 'מסמך אחר' },
]

export const DOC_LABELS: Record<string, string> =
  Object.fromEntries(DOC_TYPES.map(t => [t.value, t.label]))

export const docTypeLabel = (v: string) => DOC_LABELS[v] ?? v

// כל המפתחות שהפורטל מקבל להעלאה (כולל אישור לידה מזרימת היולדת)
export const UPLOADABLE_DOC_TYPES = [
  'id_husband', 'id_wife', 'id_child', 'marriage_cert', 'birth_cert', 'address_proof', 'other',
]
