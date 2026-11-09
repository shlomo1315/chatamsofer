// מחיקה עצמית מהאיגוד: ניסוח ת"ז לרשימת החסומים ותנאי האישור.

export const DELETE_CONFIRM_WORD = 'מחיקה'

// צורות ת"ז לבדיקה/רישום: כפי שהוזנה וגם בלי אפסים מובילים (רשומות ישנות).
export function idNumberVariants(raw: unknown): string[] {
  const clean = String(raw ?? '').trim()
  if (!clean) return []
  const digits = /^\d+$/.test(clean)
  return Array.from(new Set(digits ? [clean, clean.replace(/^0+/, '')].filter(Boolean) : [clean]))
}

export function isDeleteConfirmed(body: { confirm?: unknown; understood?: unknown }): boolean {
  return body.understood === true && String(body.confirm ?? '').trim() === DELETE_CONFIRM_WORD
}
