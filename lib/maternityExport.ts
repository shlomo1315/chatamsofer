// עזרי ייצוא יולדות לאקסל: תרגום סטטוס ופירוט כספי של הכרטיס.

// אותם מונחים כמו במסך היולדות (STATUS_PILL ב-app/admin/maternity/maternityStatus.tsx).
export const MATERNITY_STATUS_HE: Record<string, string> = {
  pending: 'ממתין לאישור',
  active: 'מאושר',
  cancelled: 'לא מאושר',
  completed: 'הושלם',
  deep_review: 'בבדיקה מעמיקה',
}

export const maternityStatusHe = (s?: string | null) => (s ? (MATERNITY_STATUS_HE[s] ?? s) : '')

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * [נטען בכרטיס, נוצל בפועל, הוחזר בפריקה].
 * ⚠️ card_balance לא משמש: הוא נכתב פעם אחת בטעינה ואינו מתעדכן מקניות.
 * נוצל = נטען פחות מה שהוחזר, ורק כשהכרטיס נפרק והסכום שהוחזר נשמר.
 * "נוצל במלואו" ב-card_load_error = הוחזר 0. פריקות היסטוריות בלי סכום שמור: נשאר ריק.
 */
export function cardMoneyCells(aid: {
  card_load_amount?: unknown
  card_unloaded_amount?: unknown
  card_unloaded_at?: string | null
  card_load_error?: string | null
}): [number | null, number | null, number | null] {
  const loaded = num(aid.card_load_amount)
  let returned = num(aid.card_unloaded_amount)
  if (returned == null && aid.card_unloaded_at && /נוצל במלואו/.test(aid.card_load_error ?? '')) returned = 0
  const used = loaded != null && returned != null ? Math.max(0, loaded - returned) : null
  return [loaded, used, returned]
}
