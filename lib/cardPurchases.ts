import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// רכישות כרטיסי מזון.
//
// ⚠️ "סך הכרטיסים שנקנו" נקרא מכאן ולא נגזר מיומן התנועות. הגזירה מהיומן
// נכשלה שלוש פעמים (0, 295, 662) מסיבה מבנית: היומן מערבב רכישות עם
// החזרות של כרטיסים שנכשלו, תיקוני ספירה והתאמות מלאי — ואין בו סימן
// ודאי שמבחין ביניהם. כל ניסיון לזהות רכישה בדיעבד היה ניחוש.
//
// ⚠️ נפרד מהמלאי בכוונה: "כמה נקנו" ו"כמה יש עכשיו" הן שתי שאלות שונות.
// המלאי מחושב מיומן התנועות (getStockBalance) והוא נכון; הרכישות הן
// אירועים מתועדים עם תאריך.
// ─────────────────────────────────────────────────────────────────────────────

export interface CardPurchase {
  id: string
  quantity: number
  purchased_on: string
  note: string | null
  created_by: string | null
  created_at: string
}

export interface PurchaseTotals {
  /** סך הכרטיסים שנרכשו אי־פעם */
  totalPurchased: number
  /** הרכישות עצמן, מהחדשה לישנה */
  purchases: CardPurchase[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPurchases(db: SupabaseClient<any>): Promise<PurchaseTotals> {
  const { data, error } = await db
    .from('card_purchases')
    .select('id, quantity, purchased_on, note, created_by, created_at')
    .order('purchased_on', { ascending: false })

  // ⚠️ נכשל רך: אם המיגרציה טרם רצה (42P01) המסך ימשיך להציג מלאי ותנועות
  // ולא ייפול כולו. "נקנו" יציג 0, וזה מצב שניתן להבחין בו — בניגוד למספר
  // שגוי שנראה תקין.
  if (error) {
    console.error('[cardPurchases] query failed:', error.message)
    return { totalPurchased: 0, purchases: [] }
  }

  const purchases = (data ?? []) as CardPurchase[]
  return { totalPurchased: sumPurchases(purchases), purchases }
}

/** סכום הרכישות. פונקציה טהורה — ניתנת לבדיקה בלי מסד. */
export function sumPurchases(purchases: readonly { quantity?: number | null }[]): number {
  return purchases.reduce((sum, p) => {
    const q = Number(p.quantity)
    return Number.isFinite(q) && q > 0 ? sum + q : sum
  }, 0)
}

/**
 * אימות קלט של רכישה חדשה.
 *
 * ⚠️ התאריך חובה ואינו מקבל ברירת מחדל של "היום": רכישה מוזנת לעיתים
 * קרובות אחרי שהגיעה החשבונית, והתיעוד צריך לשקף את יום הרכישה בפועל.
 * ⚠️ תאריך עתידי נחסם — הוא תמיד שגיאת הקלדה.
 */
export function validatePurchase(quantity: unknown, purchasedOn: unknown, today: string): string | null {
  const q = Number(quantity)
  if (!Number.isInteger(q) || q <= 0) return 'כמות הכרטיסים חייבת להיות מספר שלם גדול מאפס'
  if (typeof purchasedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn)) {
    return 'תאריך הרכישה חובה (יום/חודש/שנה)'
  }
  if (purchasedOn > today) return 'תאריך הרכישה אינו יכול להיות עתידי'
  return null
}
