// ─────────────────────────────────────────────────────────────────────────────
// הודעות שלוחת חלוקות החגים בימות — טקסט ניתן לעריכה, ואפשרות הקלטה אנושית.
//
// נשמר ב-app_settings תחת 'yemot_holiday_messages' (JSON של key → { text, audio }).
// אותו דפוס בדיוק כמו שלוחת היולדות, כדי שמסך ההגדרות יעבוד באותה צורה ולא
// יהיו שני מנגנונים שונים לאותו דבר.
//
// ⚠️ ההודעות הדינמיות (עם {name} / {distribution}) אינן ניתנות להקלטה: שם
// המשפחה ושם החלוקה משתנים בכל שיחה, והקלטה קבועה הייתה מקריאה נתון שגוי.
// ─────────────────────────────────────────────────────────────────────────────
import { getServiceClient } from '@/lib/apiAuth'

export const HOLIDAY_MSG_KEY = 'yemot_holiday_messages'

export type HolidayMsg = { text: string; audio?: string | null }
export type HolidayMessages = Record<string, HolidayMsg>

export type HolidayMsgMeta = {
  key: string
  label: string
  defaultText: string
  allowAudio: boolean
  placeholders?: string[]
  hint?: string
}

export const HOLIDAY_MESSAGE_META: HolidayMsgMeta[] = [
  {
    key: 'identify', label: 'זיהוי המשפחה', allowAudio: false, placeholders: ['name'],
    defaultText: 'שלום וברכה המערכת זיהתה אתכם בשם {name}',
    hint: 'הודעה דינמית — חובה לכלול {name}. אין אפשרות הקלטה.',
  },
  {
    key: 'ask_confirm', label: 'בקשת אישור הרישום', allowAudio: false, placeholders: ['distribution'],
    defaultText: 'לרישום לחלוקת {distribution} הקישו 1',
    hint: 'הודעה דינמית — חובה לכלול {distribution} (שם החלוקה הפעילה).',
  },
  {
    key: 'success', label: 'הרישום נקלט', allowAudio: false, placeholders: ['name', 'distribution'],
    defaultText: 'רישומכם לחלוקת {distribution} נקלט בהצלחה בעזרת השם במהלך חודש אלול תקבלו עדכון מדויק על אופן החלוקה',
  },
  {
    key: 'already', label: 'כבר רשומים', allowAudio: false, placeholders: ['name', 'distribution'],
    defaultText: 'אתם כבר רשומים לחלוקת {distribution} אין צורך בפעולה נוספת',
  },
  {
    key: 'not_found', label: 'טלפון לא מזוהה', allowAudio: true,
    defaultText: 'מספר הטלפון שלכם אינו רשום במערכת יש להירשם קודם לאיגוד הצאצאים ולאחר מכן לחייג שוב',
  },
  {
    key: 'closed', label: 'הרישום סגור', allowAudio: true,
    defaultText: 'הרישום לחלוקת החגים אינו פתוח כרגע נשמח לעמוד לרשותכם במועד הרישום',
  },
  { key: 'cancelled', label: 'המשתמש לא אישר', allowAudio: true, defaultText: 'הרישום לא בוצע תודה ולהתראות' },
  { key: 'failed', label: 'תקלה ברישום', allowAudio: true, defaultText: 'אירעה תקלה ברישום אנא נסו שוב מאוחר יותר או פנו למשרד' },
]

const META_BY_KEY = new Map(HOLIDAY_MESSAGE_META.map(m => [m.key, m]))

function defaultMessages(): HolidayMessages {
  const out: HolidayMessages = {}
  for (const m of HOLIDAY_MESSAGE_META) out[m.key] = { text: m.defaultText, audio: null }
  return out
}

/** ההודעות — ברירות המחדל ממוזגות עם מה שנשמר בהגדרות. */
export async function getHolidayMessages(): Promise<HolidayMessages> {
  const merged = defaultMessages()
  const admin = getServiceClient()
  if (!admin) return merged
  const { data } = await admin.from('app_settings').select('value').eq('key', HOLIDAY_MSG_KEY).maybeSingle()
  if (data?.value) {
    try {
      const saved = JSON.parse(data.value) as HolidayMessages
      for (const key of Object.keys(merged)) {
        const s = saved[key]
        if (!s) continue
        merged[key] = {
          text: typeof s.text === 'string' && s.text.trim() ? s.text : merged[key].text,
          audio: META_BY_KEY.get(key)?.allowAudio ? (s.audio ?? null) : null,
        }
      }
    } catch { /* value אינו JSON תקין */ }
  }
  return merged
}

/** שמירה — ממזג מעל ברירות המחדל; הקלטה נשמרת רק להודעות שמותר בהן. */
export async function saveHolidayMessages(input: HolidayMessages): Promise<boolean> {
  const admin = getServiceClient()
  if (!admin) return false
  const current = await getHolidayMessages()
  for (const key of Object.keys(current)) {
    const i = input[key]
    if (!i) continue
    const newText = typeof i.text === 'string' && i.text.trim() ? i.text.trim() : current[key].text
    const audio = META_BY_KEY.get(key)?.allowAudio ? (i.audio ?? current[key].audio ?? null) : null
    current[key] = { text: newText, audio }
  }
  const { error } = await admin.from('app_settings').upsert(
    { key: HOLIDAY_MSG_KEY, value: JSON.stringify(current) },
    { onConflict: 'key' },
  )
  if (error) { console.error('[yemotHolidayMessages] save failed:', error.message); return false }
  return true
}

/**
 * קביעת/הסרת הקלטה להודעה. null = חזרה ל-TTS.
 *
 * ⚠️ מוגן ב-allowAudio: הודעה דינמית (עם {name}/{distribution}) אינה יכולה
 * להישמע מהקלטה קבועה — היא הייתה מקריאה שם משפחה או שם חלוקה שגויים.
 */
export async function setHolidayMessageAudio(key: string, audio: string | null): Promise<boolean> {
  if (!META_BY_KEY.get(key)?.allowAudio) return false
  const msgs = await getHolidayMessages()
  if (!msgs[key]) return false
  msgs[key] = { ...msgs[key], audio }
  return saveHolidayMessages(msgs)
}
