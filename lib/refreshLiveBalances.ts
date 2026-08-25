// ─────────────────────────────────────────────────────────────────────────────
// רענון היתרות מנדרים — רץ אוטומטית כל שעה.
//
// 🔴 למה זה קיים: card_balance נכתב פעם אחת בטעינה ואינו מתעדכן
// מקניות. כל היולדות רשומות 600.00 גם אחרי שקנו — כולל מי שנשארו לה
// 0.21. המספר נראה מדויק והוא שקר, והוא כבר גרם לרישום שגוי של
// 13 פריקות שנרשמו כ"חזרו 600 ₪".
//
// ⚠️ נדרים היא מקור האמת היחיד ליתרה. אין דרך לגזור אותה מהמסד.
// ─────────────────────────────────────────────────────────────────────────────
import { getServiceClient } from './apiAuth'
import { getNedarimCreds, getClientCard } from './nedarim'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface RefreshResult {
  ok: boolean
  checked: number
  updated: number
  failed: number
  error?: string
}

export async function refreshLiveBalances(): Promise<RefreshResult> {
  const empty = { checked: 0, updated: 0, failed: 0 }

  const creds = await getNedarimCreds()
  if (!creds) return { ok: false, ...empty, error: 'חיבור נדרים פלוס לא מוגדר' }

  const db = getServiceClient()
  if (!db) return { ok: false, ...empty, error: 'שגיאת שרת' }

  const { data, error } = await db.from('maternity_aids')
    .select('id, beneficiary:beneficiaries(nedarim_id)')
    .eq('card_load_status', 'loaded')
    .is('card_unloaded_at', null)

  if (error) return { ok: false, ...empty, error: error.message }

  const rows = (data ?? []) as {
    id: string
    beneficiary?: { nedarim_id?: string | null } | { nedarim_id?: string | null }[] | null
  }[]

  // ⚠️ מטמון לפי מזהה משפחה: לאותה משפחה עשויים להיות כמה תיקים,
  // וקריאה חוזרת הייתה מכפילה את הפניות ל-API החיצוני.
  const cache = new Map<string, number | null>()
  const now = new Date().toISOString()
  let updated = 0
  let failed = 0

  for (const r of rows) {
    const b = Array.isArray(r.beneficiary) ? r.beneficiary[0] : r.beneficiary
    const nedId = (b?.nedarim_id ?? '').toString().trim()
    if (!nedId) { failed++; continue }

    let balance: number | null
    if (cache.has(nedId)) {
      balance = cache.get(nedId) ?? null
    } else {
      // ⚠️ ניסיון חוזר אחד: בפריקה של 25.08 חמש קריאות בשנייה אחת
      // החזירו תשובות ריקות, והתיעוד נשמר "לא ידוע" ללא סיבה אמיתית.
      balance = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const card = await getClientCard(creds, nedId)
          balance = card?.totalFreeAmount ?? null
          if (balance != null) break
        } catch { /* נופל לניסיון הבא */ }
        if (attempt === 0) await sleep(400)
      }
      cache.set(nedId, balance)
      // ⚠️ השהיה בין משפחות — לא להציף את ה-API של נדרים.
      await sleep(120)
    }

    if (balance == null) { failed++; continue }

    // ⚠️ נכתב רק כשהערך ידוע: כתיבת null הייתה מוחקת יתרה תקינה
    // שנשלפה בסבב קודם, בגלל תקלת רשת רגעית.
    const { error: upErr } = await db.from('maternity_aids')
      .update({ live_balance: balance, live_balance_at: now })
      .eq('id', r.id)
    if (upErr) failed++
    else updated++
  }

  return { ok: true, checked: rows.length, updated, failed }
}
