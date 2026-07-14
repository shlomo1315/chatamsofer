// ─────────────────────────────────────────────────────────────
// מקור אמת לסוגי מסמכים. ברירת המחדל כאן; ניתן להוסיף סוגים נוספים
// מדף ההגדרות (נשמרים ב-app_settings תחת המפתח 'doc_types') וזה
// משפיע על כל המערכת: כרטסת, צ'קליסט, מודאל שיוך מייל, פורטל ומיילים.
// ─────────────────────────────────────────────────────────────

export interface DocTypeOption {
  value: string
  label: string
}

export const DEFAULT_DOC_TYPES: DocTypeOption[] = [
  { value: 'id_husband',      label: 'ת.ז. הבעל' },
  { value: 'id_husband_appx', label: 'ספח ת.ז. הבעל' },
  { value: 'id_wife',         label: 'ת.ז. האישה' },
  { value: 'id_wife_appx',    label: 'ספח ת.ז. האישה' },
  { value: 'id_child',        label: 'ת.ז. ילד (כולל ספח)' },
  { value: 'other',           label: 'מסמך אחר' },
]

// alias תאימות-לאחור (משמש כ-fallback סטטי)
export const DOC_TYPES = DEFAULT_DOC_TYPES

export const DOC_LABELS: Record<string, string> =
  Object.fromEntries(DEFAULT_DOC_TYPES.map(t => [t.value, t.label]))

export const docTypeLabel = (v: string, types: DocTypeOption[] = DEFAULT_DOC_TYPES) =>
  types.find(t => t.value === v)?.label ?? DOC_LABELS[v] ?? v

// מפתח חדש ייחודי לסוג מסמך שנוסף ידנית (תוויות בעברית אינן תקפות כ-slug)
export const newDocTypeValue = () => `doc_${Math.random().toString(36).slice(2, 8)}`

// מפתחות שאסור למחוק (ליבת המערכת)
export const PROTECTED_DOC_TYPES = [
  'id_husband', 'id_husband_appx',
  'id_wife', 'id_wife_appx',
  'id_child', 'other',
]
