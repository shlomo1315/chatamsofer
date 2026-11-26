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

export type CardWalletInput = {
  card_load_amount?: number | string | null
  card_balance?: number | string | null
  live_balance?: number | string | null
}

export type CardWalletView = {
  loadedAmount: number | null
  balance: number | null
  // סכום הטעינה פחות היתרה; null כשאחד מהם לא ידוע
  used: number | null
}

// כרטיס טעון: "נוצל" ו"נותרו בארנק".
// 🔴 card_balance נכתב פעם אחת בטעינה ואינו מתעדכן מקניות, ולכן היתרה
// נלקחת לפי סדר עדכניות: מנדרים עכשיו (fresh) → live_balance מהרענון
// השעתי → card_balance רק כשאין שום יתרה חיה.
export function getCardWalletView(x: CardWalletInput, fresh?: number | null): CardWalletView {
  const loadedAmount = toNum(x.card_load_amount)
  const balance = (fresh != null && Number.isFinite(fresh) ? fresh : null)
    ?? toNum(x.live_balance) ?? toNum(x.card_balance)
  return {
    loadedAmount,
    balance,
    used: loadedAmount != null && balance != null ? Math.max(0, loadedAmount - balance) : null,
  }
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
