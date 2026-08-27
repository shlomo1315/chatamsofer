// ─────────────────────────────────────────────────────────────────────────────
// הודעות התפריט הראשי — הטקסטים שהמתקשר שומע בשלוחה הראשית.
//
// ⚠️ אותו דפוס בדיוק כמו yemotHolidayMessages / yemotMaternityMessages: מטא
// לעריכה במסך, וברירת מחדל בקוד. כך העריכה, ההקלטה והקול הנוירוני עובדים
// כאן בלי מנגנון נוסף.
// ─────────────────────────────────────────────────────────────────────────────

export const MAIN_MENU_MSG_KEY = 'yemot_main_menu_messages'

export type MainMenuMsg = { text: string; audio?: string | null }
export type MainMenuMessages = Record<string, MainMenuMsg>

export type MainMenuMsgMeta = {
  key: string
  label: string
  defaultText: string
  allowAudio: boolean
  placeholders?: string[]
  hint?: string
}

export const MAIN_MENU_MESSAGE_META: MainMenuMsgMeta[] = [
  {
    key: 'welcome',
    label: 'ברוכים הבאים',
    defaultText: 'ברוכים הבאים להיכל החתם סופר',
    allowAudio: true,
    hint: 'ההודעה הראשונה שנשמעת. ריק — מדלגים עליה ועוברים ישר לתפריט.',
  },
  {
    key: 'menu',
    label: 'התפריט הראשי',
    defaultText: 'לרישום לחלוקת החגים הקישו 1, לשיוך כרטיס מזון ליולדת הקישו 2, להודעות הקישו 9',
    allowAudio: true,
    hint: 'התפריט עצמו. ⚠️ המספרים כאן חייבים להתאים למה שהתפריט באמת מקבל.',
  },
  {
    key: 'notice',
    label: 'הודעה כללית (מקש 9)',
    defaultText: 'אין כרגע הודעות חדשות',
    allowAudio: true,
    hint: 'הודעה חופשית — שעות פעילות, עדכון על חלוקה, או כל הודעה זמנית.',
  },
  {
    key: 'invalid',
    label: 'הקשה שגויה',
    defaultText: 'הקשה שגויה',
    allowAudio: true,
    hint: 'נשמע כשמקישים מספר שאינו בתפריט. אחריו התפריט מושמע שוב.',
  },
]

/** ברירות המחדל, לשימוש כשטרם נשמרו הודעות. */
export function defaultMainMenuMessages(): MainMenuMessages {
  const out: MainMenuMessages = {}
  for (const m of MAIN_MENU_MESSAGE_META) out[m.key] = { text: m.defaultText, audio: null }
  return out
}

/**
 * ממזג את מה שנשמר עם ברירות המחדל.
 *
 * ⚠️ הודעה שנוספה לקוד אחרי השמירה האחרונה חייבת לקבל את ברירת המחדל שלה
 * ולא להיעלם — אחרת התפריט משמיע שקט במקום מקש שקיים.
 */
export function mergeMainMenuMessages(saved: unknown): MainMenuMessages {
  const out = defaultMainMenuMessages()
  if (!saved || typeof saved !== 'object') return out
  for (const m of MAIN_MENU_MESSAGE_META) {
    const v = (saved as Record<string, unknown>)[m.key]
    if (!v || typeof v !== 'object') continue
    const rec = v as { text?: unknown; audio?: unknown }
    out[m.key] = {
      // ⚠️ מחרוזת ריקה נשמרת כפי שהיא: "ריק = דלג" הוא בחירה מפורשת
      // (למשל ברכת פתיחה שלא רוצים), ולא היעדר הגדרה.
      text: typeof rec.text === 'string' ? rec.text : m.defaultText,
      audio: typeof rec.audio === 'string' && rec.audio ? rec.audio : null,
    }
  }
  return out
}

// ── שמירה וטעינה ─────────────────────────────────────────────────────────────
// ⚠️ app_settings היא עמודת text: הערך נשמר כמחרוזת JSON. שמירת אובייקט
// גולמי נכשלת בשקט ומייצרת "[object Object]".
import { getServiceClient } from './apiAuth'

export async function getMainMenuMessages(): Promise<MainMenuMessages> {
  const admin = getServiceClient()
  if (!admin) return defaultMainMenuMessages()
  try {
    const { data } = await admin.from('app_settings')
      .select('value').eq('key', MAIN_MENU_MSG_KEY).maybeSingle()
    return mergeMainMenuMessages(data?.value ? JSON.parse(String(data.value)) : null)
  } catch {
    return defaultMainMenuMessages()
  }
}

export async function saveMainMenuMessages(input: MainMenuMessages): Promise<boolean> {
  const admin = getServiceClient()
  if (!admin) return false
  // ⚠️ ממוזג מעל ברירות המחדל ולא נשמר כפי שהתקבל: קלט חלקי היה מוחק
  // הודעות שלא נערכו.
  const merged = mergeMainMenuMessages(input)
  const { error } = await admin.from('app_settings').upsert({
    key: MAIN_MENU_MSG_KEY,
    value: JSON.stringify(merged),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  return !error
}

/**
 * קובע (או מסיר) את קובץ הקול של הודעה בתפריט הראשי.
 *
 * ⚠️ נשמר שם הקובץ היחסי לשלוחה בלבד; ה-webhook מנגן אותו כ-`f-<audio>`.
 * audio=null מחזיר את ההודעה להקראת טקסט (TTS).
 */
export async function setMainMenuMessageAudio(key: string, audio: string | null): Promise<boolean> {
  if (!MAIN_MENU_MESSAGE_META.some(m => m.key === key)) return false
  const messages = await getMainMenuMessages()
  const current = messages[key]
  if (!current) return false
  messages[key] = { ...current, audio }
  return saveMainMenuMessages(messages)
}
