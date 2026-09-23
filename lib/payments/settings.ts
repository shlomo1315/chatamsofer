// ─────────────────────────────────────────────────────────────────────────────
// הגדרות ספק הסליקה.
//
// 🔴 מפתח נפרד לחלוטין מ-'nedarim_card'. נדרים קארד הוא מוצר אחר
// (כרטיסי מזון טעונים, מוסדות 7018265 ו-7014553) ומדובר בתקציב ולא
// בגבייה. ערבוב בין השניים הוא בלתי-הפיך בדיווח — ראו ההערות בראש
// lib/nedarim.ts.
//
// ⚠️ app_settings.value היא עמודת text. האובייקט נשמר כ-JSON מפורש;
// שמירת אובייקט גולמי נכשלת בשקט ומייצרת "[object Object]".
//
// 🔴 ה-apiValid לעולם אינו חוזר ללקוח. הראוט מחזיר דגל hasApiValid
// בלבד, כמו במסכי נדרים קארד.
// ─────────────────────────────────────────────────────────────────────────────

import { getServiceClient } from '@/lib/apiAuth'

export const PAYMENTS_KEY = 'payments_provider'

export interface PaymentSettings {
  /** שם הספק. '' או 'mock' = סליקה מדומה. */
  provider?: string
  /** קוד המוסד אצל הספק. */
  mosadId?: string
  /** קוד ה-API. 🔴 לעולם לא נחשף ללקוח. */
  apiValid?: string
  /**
   * 🔴 מצב בדיקה. ספק אמיתי + testMode = עדיין לא גובים.
   *
   * ⚠️ קיים כדי שאפשר יהיה להזין פרטים ולבדוק חיבור בלי שהחנות
   * תתחיל לגבות באותו רגע.
   */
  testMode?: boolean
}

async function read(): Promise<PaymentSettings> {
  const db = getServiceClient()
  if (!db) return {}
  const { data } = await db.from('app_settings')
    .select('value').eq('key', PAYMENTS_KEY).maybeSingle()
  const raw = (data as { value?: string } | null)?.value
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object' ? parsed : {}) as PaymentSettings
  } catch {
    // ⚠️ ערך פגום אינו מפיל את החנות — הוא מתנהג כ"לא מוגדר", וכך
    // getPaymentProvider נופל למדומה במקום לזרוק.
    console.error('[payments/settings] ערך פגום ב-app_settings')
    return {}
  }
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  return read()
}

/**
 * שמירה עם מיזוג.
 *
 * ⚠️ patch-merge ולא החלפה: שמירת שדה אחד במסך ההגדרות לא תמחק את
 * השאר. אותו דפוס כמו writeNedarimSettings.
 */
export async function savePaymentSettings(patch: PaymentSettings): Promise<boolean> {
  const db = getServiceClient()
  if (!db) return false
  const current = await read()
  const next = { ...current, ...patch }
  const { error } = await db.from('app_settings')
    .upsert({ key: PAYMENTS_KEY, value: JSON.stringify(next) }, { onConflict: 'key' })
  if (error) {
    console.error('[payments/settings] שמירה נכשלה:', error.message)
    return false
  }
  return true
}
