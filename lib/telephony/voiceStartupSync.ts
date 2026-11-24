// יצירת הקלטות חסרות בקול המשובט בעליית השרת.
//
// ⚠️ נוסח שנכנס רק בקוד (ברירת מחדל) לא עבר בשמירה במסך הניהול, ולכן לא נוצרה
// לו הקלטה והוא הוקרא בקול ממוחשב (חנוכה, 24.11). syncMainVoice יוצר רק קטעים
// שחסרים באינדקס, לפי הנוסח שמושמע בפועל (השמור במסד גובר על ברירת המחדל),
// כך שעלייה בלי שינוי בנוסחים לא פונה ל-ElevenLabs בכלל.
//
// 🔴 כמה מופעי שרת עולים יחד בפריסה. בלי נעילה כל אחד היה יוצר את אותם קטעים
// ושורף מכסה פעמיים. מי שלא קיבל את הנעילה מדלג.
import { getServiceClient } from '@/lib/apiAuth'
import { acquireSettingsLock, releaseSettingsLock } from '@/lib/backupLock'
import { syncMainVoice } from './voiceFiles'

export const VOICE_SYNC_LOCK_KEY = 'phone_voice_sync_lock'
export const VOICE_SYNC_LOCK_TTL_MS = 15 * 60 * 1000

export type StartupVoiceResult = 'no-db' | 'locked' | 'synced' | 'failed'

/** לעולם לא זורק: כל כשל (מכסה, מפתח, רשת) נרשם ללוג בלבד. */
export async function syncVoiceOnStartup(): Promise<StartupVoiceResult> {
  const db = getServiceClient()
  if (!db) return 'no-db'
  let locked = false
  try {
    locked = await acquireSettingsLock(db, VOICE_SYNC_LOCK_KEY, VOICE_SYNC_LOCK_TTL_MS)
    if (!locked) {
      console.log('[voice-startup] מופע אחר כבר יוצר הקלטות · מדלג')
      return 'locked'
    }
    const r = await syncMainVoice()
    if (r.ok) {
      if (r.created) console.log(`[voice-startup] נוצרו ${r.created} הקלטות חסרות מתוך ${r.total}`)
      return 'synced'
    }
    console.error(`[voice-startup] יצירת ההקלטות נכשלה: ${r.error} · נוצרו ${r.created}, נכשלו ${r.failed}`)
    return 'failed'
  } catch (e) {
    console.error('[voice-startup] שגיאה:', e instanceof Error ? e.message : e)
    return 'failed'
  } finally {
    if (locked) await releaseSettingsLock(db, VOICE_SYNC_LOCK_KEY)
  }
}
