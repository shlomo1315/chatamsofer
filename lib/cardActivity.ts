// תנועות כרטיס מזון מתוך תשובת נדרים (GetClientCard).
// מבנה History אומת בעבר (ראו backfill-unload-amounts): קנייה = שורה עם StoreName,
// פריקה = שורה בלי חנות והערה "פריקת תלוש".
import { parseNedarimAmount } from './nedarimAmount'

export interface CardPurchaseRow {
  id: string
  date: string
  store: string
  amount: number | null
}

export interface CardActivity {
  purchases: CardPurchaseRow[]
  /** היתרה הנוכחית בנדרים; null = לא ידוע */
  balance: number | null
}

export function parseCardActivity(payload: unknown): CardActivity {
  const p = (payload ?? {}) as { History?: unknown; TotalFreeAmount?: unknown }
  const history = Array.isArray(p.History) ? p.History : []
  const purchases: CardPurchaseRow[] = []
  history.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return
    const r = raw as Record<string, unknown>
    const store = String(r.StoreName ?? r.Store ?? '').trim()
    if (!store) return
    purchases.push({
      id: String(r.HistoryId ?? i),
      date: String(r.Date ?? ''),
      store,
      amount: parseNedarimAmount(r.Amount),
    })
  })
  return { purchases, balance: parseNedarimAmount(p.TotalFreeAmount) }
}
