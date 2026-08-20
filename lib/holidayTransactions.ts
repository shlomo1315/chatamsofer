// ─────────────────────────────────────────────────────────────────────────────
// היסטוריית עסקאות החגים — מטמון.
//
// 🔴 getClientCardFull נקרא לכל משפחה בנפרד. ביולדות יש עשרות משפחות וזה
// עובד; כאן ~6,000 — כלומר 6,000 קריאות API בכל פתיחת מסך, דקות ארוכות.
// לכן המסך קורא מהמסד, וסנכרון ידני ממלא אותו.
//
// ⚠️ קנייה = יש שם חנות. בלי שם חנות זו טעינה/פריקה ואינה עסקה —
// אותה הבחנה בדיוק כמו במסך היולדות.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getHolidayNedarimCreds, getClientCardFull, findClientByZeout,
  normalizeZeout, type NedarimCreds,
} from './nedarim'

export interface TxRow {
  recipientId: string
  txDate: string | null
  storeName: string
  amount: number
  raw?: unknown
}

const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** תאריך נדרים (dd/MM/yyyy או ISO) → ISO. ⚠️ מחזיר null ולא Invalid Date. */
export function parseTxDate(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (dmy) {
    const [, d, m, y] = dmy
    // 🔴 Date.UTC ולא new Date(y,m,d): הבנאי המקומי יוצר חצות בשעון
    // ישראל, ו-toISOString מזיז אותו **יום אחורה**. עסקה מ-12/09 הייתה
    // נשמרת כ-11/09 — תאריך שגוי בהיסטוריה שהמשתמש בודק מולה.
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
  }
  const dt = new Date(s)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

/**
 * מחלץ עסקאות מכרטיס נדרים.
 *
 * ⚠️ טהורה — בלי גישה לרשת או למסד, כדי שאפשר יהיה לבדוק את החילוץ.
 */
export function extractTransactions(
  recipientId: string,
  card: Record<string, unknown> | null,
): TxRow[] {
  const history = Array.isArray(card?.History) ? (card!.History as Record<string, unknown>[]) : []
  const out: TxRow[] = []
  for (const h of history) {
    const storeName = String(h.StoreName ?? h.Store ?? '').trim()
    // 🔴 בלי שם חנות זו טעינה/פריקה, לא קנייה.
    if (!storeName) continue
    out.push({
      recipientId,
      txDate: parseTxDate(h.Date),
      storeName,
      amount: num(h.Amount),
      raw: h,
    })
  }
  return out
}

/**
 * מסנכרן עסקאות למסד.
 *
 * ⚠️ סדרתי: נדרים חוסמת קצב על עשרות קריאות מקבילות.
 */
export async function syncTransactions(
  db: SupabaseClient,
  targets: { recipientId: string; idNumber: string | null }[],
  opts: { delayMs?: number } = {},
): Promise<{ synced: number; failed: number; transactions: number }> {
  const out = { synced: 0, failed: 0, transactions: 0 }
  if (!targets.length) return out

  const creds = await getHolidayNedarimCreds()
  if (!creds) throw new Error('לא הוגדרו הרשאות נדרים לחלוקות חגים')

  for (const t of targets) {
    const zeout = normalizeZeout(t.idNumber ?? '')
    if (!zeout) { out.failed++; continue }

    try {
      const clientId = await findClientByZeout(creds as NedarimCreds, zeout)
      if (!clientId) { out.failed++; continue }

      const card = await getClientCardFull(creds as NedarimCreds, clientId)
      const rows = extractTransactions(t.recipientId, card as Record<string, unknown> | null)

      if (rows.length) {
        // ⚠️ upsert על מפתח הדדופ — סנכרון חוזר אינו מכפיל עסקאות.
        await db.from('holiday_transactions').upsert(
          rows.map(r => ({
            recipient_id: r.recipientId,
            tx_date: r.txDate,
            store_name: r.storeName,
            amount: r.amount,
            raw: r.raw ?? null,
            synced_at: new Date().toISOString(),
          })),
          { onConflict: 'recipient_id,tx_date,store_name,amount', ignoreDuplicates: true },
        )
        out.transactions += rows.length
      }
      out.synced++
    } catch {
      // כשל במשפחה אחת אינו מפיל את המנה.
      out.failed++
    }

    if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs))
  }

  console.log(`[holiday-tx] סונכרנו ${out.synced} · ${out.transactions} עסקאות · ${out.failed} נכשלו`)
  return out
}
