import { createClient } from '@supabase/supabase-js'
import { PUBLIC_TEXTS_KEY, type PublicTexts } from './publicTexts'

// ─────────────────────────────────────────────────────────────────────────────
// מטמון הטקסטים הערוכים של הממשק הציבורי — באותו דפוס של emailTextsStore.
//
// הממשק הציבורי הוא קומפוננטת לקוח, ולכן הטקסטים נטענים בשרת ומוזרמים
// אליה כ-prop. המטמון חוסך שאילתה בכל טעינת עמוד — קריטי כאן, כי בדיוק
// סיימנו לתקן איטיות במסך הזה ואסור להחזיר אותה.
//
// אם הטעינה נכשלת מוחזר אובייקט ריק, ו-textOf() נופל לברירות המחדל שבקוד:
// האתר מוצג תמיד, גם כשה-DB לא זמין.
// ─────────────────────────────────────────────────────────────────────────────

let cache: PublicTexts = {}
let loaded = false
let loading: Promise<void> | null = null

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** טוען את הטקסטים למטמון. בטוח לקריאה מרובה — טעינה אחת בלבד במקביל. */
export async function loadPublicTexts(): Promise<PublicTexts> {
  if (loaded) return cache
  if (loading) { await loading; return cache }

  loading = (async () => {
    try {
      const db = admin()
      if (!db) return
      const { data } = await db
        .from('app_settings').select('value').eq('key', PUBLIC_TEXTS_KEY).maybeSingle()
      if (data?.value) cache = JSON.parse(String(data.value))
      loaded = true
    } catch (e) {
      console.error('[publicTexts] טעינה נכשלה — נעשה שימוש בברירות המחדל:', e)
    } finally {
      loading = null
    }
  })()

  await loading
  return cache
}

/**
 * מרענן את המטמון מיד — נקרא אחרי שמירה במסך העריכה.
 * זה מה שהופך את העדכון ל"חי": השמירה לא ממתינה לפקיעת מטמון.
 */
export function setPublicTexts(texts: PublicTexts): void {
  cache = texts ?? {}
  loaded = true
}

/** תוכן המטמון הנוכחי, בלי לגעת ב-DB. */
export function publicTextsCache(): PublicTexts {
  return cache
}
