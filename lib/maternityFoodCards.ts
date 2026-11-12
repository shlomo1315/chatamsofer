import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'

// ─────────────────────────────────────────────────────────────────────────────
// סיכום כרטיסי המזון של מחלקת היולדות, לטאב "כרטיסי מזון" בניהול היריד.
//
// 🔴 מספרים בלבד: אין שם, ת.ז., טלפון או מספר כרטיס. הסיכום נבנה מהמסד
// (maternity_aids) ולא מנדרים: בלי קריאות לנדרים בכלל. "יתרה" היא הערך
// האחרון ששמור בתיק, ולא יתרה חיה.
// ⚠️ נספרות יולדות בסטטוס active או completed בלבד (לא ממתינות ולא מבוטלות).
// ─────────────────────────────────────────────────────────────────────────────

export type CardStatusKey = 'loaded' | 'pending' | 'failed' | 'unloaded' | 'idle'

export const CARD_STATUS_KEYS: CardStatusKey[] = ['loaded', 'pending', 'failed', 'unloaded', 'idle']
export const CARD_STATUS_LABELS: Record<CardStatusKey, string> = {
  loaded: 'נטען', pending: 'בטעינה', failed: 'הטעינה נכשלה', unloaded: 'נפרק', idle: 'טרם נטען',
}

export interface FoodCardRow {
  home: string
  status: CardStatusKey
  /** YYYY-MM של הטעינה, או ריק. */
  month: string
  /** סכום הטעינה בש"ח (רק לכרטיס שנטען). */
  loaded: number
  /** יתרה אחרונה שמורה בתיק. */
  balance: number
}

export const NO_HOME = 'ללא בית החלמה'

type Raw = {
  recovery_home?: string | null
  card_load_status?: string | null
  card_loaded_at?: string | null
  card_load_amount?: number | string | null
  card_balance?: number | string | null
}

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0 }

export function toFoodCardRow(a: Raw): FoodCardRow {
  const st = String(a.card_load_status ?? 'idle') as CardStatusKey
  const status: CardStatusKey = CARD_STATUS_KEYS.includes(st) ? st : 'idle'
  return {
    home: (a.recovery_home ?? '').trim() || NO_HOME,
    status,
    month: status === 'loaded' ? String(a.card_loaded_at ?? '').slice(0, 7) : '',
    loaded: status === 'loaded' ? num(a.card_load_amount) : 0,
    balance: num(a.card_balance),
  }
}

type Bucket = { count: number; loaded: number; balance: number }
const empty = (): Bucket => ({ count: 0, loaded: 0, balance: 0 })
const add = (b: Bucket, r: FoodCardRow) => { b.count++; b.loaded += r.loaded; b.balance += r.balance }

export interface FoodCardSummary {
  total: Bucket
  byStatus: Record<CardStatusKey, Bucket>
  byHome: { home: string; total: Bucket; byStatus: Record<CardStatusKey, number> }[]
  byMonth: { month: string; count: number; loaded: number }[]
}

export function summarizeFoodCards(rows: FoodCardRow[]): FoodCardSummary {
  const total = empty()
  const byStatus = Object.fromEntries(CARD_STATUS_KEYS.map(k => [k, empty()])) as Record<CardStatusKey, Bucket>
  const homes = new Map<string, { home: string; total: Bucket; byStatus: Record<CardStatusKey, number> }>()
  const months = new Map<string, { month: string; count: number; loaded: number }>()
  for (const r of rows) {
    add(total, r)
    add(byStatus[r.status], r)
    const h = homes.get(r.home) ?? {
      home: r.home, total: empty(),
      byStatus: Object.fromEntries(CARD_STATUS_KEYS.map(k => [k, 0])) as Record<CardStatusKey, number>,
    }
    add(h.total, r)
    h.byStatus[r.status]++
    homes.set(r.home, h)
    if (r.month) {
      const m = months.get(r.month) ?? { month: r.month, count: 0, loaded: 0 }
      m.count++
      m.loaded += r.loaded
      months.set(r.month, m)
    }
  }
  return {
    total,
    byStatus,
    byHome: [...homes.values()].sort((a, b) => b.total.count - a.total.count),
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  }
}

export async function loadFoodCardRows(db: SupabaseClient): Promise<FoodCardRow[]> {
  const { rows, error } = await fetchAllRows<Raw>((from, to) => db
    .from('maternity_aids')
    .select('recovery_home, card_load_status, card_loaded_at, card_load_amount, card_balance')
    .in('status', ['active', 'completed'])
    .range(from, to))
  if (error) throw new Error('שליפת כרטיסי המזון נכשלה')
  return rows.map(toFoodCardRow)
}
