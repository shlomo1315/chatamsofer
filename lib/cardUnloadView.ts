// תצוגת מצב פריקה בכרטיס מזון (מסך התיק).
// אחרי פריקה card_balance מתאפס, ולכן "נוצלו" חייב להתבסס על הסכום שנפרק.

export type CardUnloadInput = {
  card_load_status?: string | null
  card_load_amount?: number | string | null
  card_unloaded_at?: string | null
  card_unloaded_amount?: number | string | null
}

export type CardUnloadView = {
  unloadedAt: string | null
  // null = הסכום לא ידוע (השליפה מנדרים נכשלה)
  unloadedAmount: number | null
  // נוצל במלואו ונסגר ללא פריקה (סכום שנפרק 0)
  fullySpent: boolean
  loadedAmount: number | null
  // סכום הטעינה פחות הסכום שנפרק; null כשאחד מהם לא ידוע
  used: number | null
}

const toNum = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function getCardUnloadView(x: CardUnloadInput): CardUnloadView | null {
  const unloaded = x.card_load_status === 'unloaded'
    || (!!x.card_unloaded_at && x.card_load_status !== 'loaded')
  if (!unloaded) return null
  const unloadedAmount = toNum(x.card_unloaded_amount)
  const loadedAmount = toNum(x.card_load_amount)
  return {
    unloadedAt: x.card_unloaded_at ?? null,
    unloadedAmount,
    fullySpent: unloadedAmount === 0,
    loadedAmount,
    used: loadedAmount != null && unloadedAmount != null ? Math.max(0, loadedAmount - unloadedAmount) : null,
  }
}
