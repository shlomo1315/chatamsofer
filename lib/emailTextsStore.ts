import { createClient } from '@supabase/supabase-js'
import { EMAIL_TEXTS_KEY, textOf, type EmailTexts } from './emailCatalog'

// ─────────────────────────────────────────────────────────────────────────────
// מטמון הטקסטים הערוכים.
//
// תבניות המייל הן פונקציות סינכרוניות, ויש להן ~38 מקומות קריאה. הפיכתן
// ל-async כדי לקרוא מה-DB הייתה מחייבת לשנות את כולם — סיכון מיותר.
// במקום זאת: המטמון נטען פעם אחת ומתרענן מיד עם כל שמירה, כך שהתבניות
// נשארות סינכרוניות ו-textFor() זמין להן בכל מקום.
//
// אם הטעינה נכשלת, textFor() מחזיר את ברירת המחדל שבקוד — מייל תמיד יוצא.
// ─────────────────────────────────────────────────────────────────────────────

let cache: EmailTexts = {}
let loaded = false
let loading: Promise<void> | null = null

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** טוען את הטקסטים למטמון. בטוח לקריאה מרובה — טעינה אחת בלבד במקביל. */
export async function loadEmailTexts(): Promise<void> {
  if (loaded) return
  if (loading) return loading

  loading = (async () => {
    try {
      const db = admin()
      if (!db) return
      const { data } = await db
        .from('app_settings').select('value').eq('key', EMAIL_TEXTS_KEY).maybeSingle()
      if (data?.value) cache = JSON.parse(String(data.value))
      loaded = true
    } catch (e) {
      console.error('[emailTexts] טעינה נכשלה — נעשה שימוש בברירות המחדל:', e)
    } finally {
      loading = null
    }
  })()

  return loading
}

/** מרענן את המטמון מיד — נקרא אחרי שמירה במסך ההגדרות. */
export function setEmailTexts(texts: EmailTexts): void {
  cache = texts ?? {}
  loaded = true
}

/**
 * הטקסט האפקטיבי של שדה: מה שנערך במסך ההגדרות, ובהיעדרו ברירת המחדל שבקוד.
 * סינכרוני בכוונה — כדי שתבניות המייל לא ידרשו שינוי.
 *
 * ⚠️ דורש ש-loadEmailTexts() נקרא קודם. הקריאה מתבצעת ב-deliverMail (כלומר
 * לפני כל שליחה) וגם בעליית השרת, כך שבפועל המטמון תמיד חם. אם בכל זאת לא —
 * מוחזרת ברירת המחדל שבקוד, והמייל יוצא. לעולם לא נכשל בגלל הטקסטים.
 */
export function textFor(emailId: string, fieldKey: string): string {
  return textOf(cache, emailId, fieldKey)
}

/** לשימוש ב-worker/instrumentation שרוצה לוודא טעינה לפני שליחה. */
export function emailTextsLoaded(): boolean {
  return loaded
}
