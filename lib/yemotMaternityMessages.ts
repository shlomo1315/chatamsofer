// הודעות שלוחת היולדות בימות — טקסט ניתן לעריכה + אפשרות להקלטה אנושית, לכל הודעה בנפרד.
// נשמר ב-app_settings תחת המפתח 'yemot_maternity_messages' (JSON של key → { text, audio }).
// audio = שם קובץ ההקלטה בימות (יחסי לשלוחה). אם קיים — מושמע במקום ה-TTS.
import { getServiceClient } from '@/lib/apiAuth'

export const MATERNITY_MSG_KEY = 'yemot_maternity_messages'

export type MaternityMsg = { text: string; audio?: string | null }
export type MaternityMessages = Record<string, MaternityMsg>

// מטא-דאטה לכל הודעה — משמש את דף ההגדרות לבניית הטופס.
// allowAudio=false להודעות דינמיות (תבנית עם משתנים) שלא ניתן להקליט מראש.
export type MsgMeta = {
  key: string
  label: string
  defaultText: string
  allowAudio: boolean
  placeholders?: string[]
  hint?: string
}

export const MATERNITY_MESSAGE_META: MsgMeta[] = [
  { key: 'welcome', label: 'ברכת זיהוי', defaultText: 'שלום זוהית בהצלחה נמצא תיק לידה פעיל בחשבונך', allowAudio: true },
  { key: 'welcome_card_exists', label: 'ברכה כשכרטיס כבר רשום', defaultText: 'שלום מצאנו את תיק הלידה שלך כרטיס נדרים כבר רשום וניתן לעדכן את המספר', allowAudio: true },
  { key: 'ask_card', label: 'בקשת מספר כרטיס', defaultText: 'אנא הקישו את מספר הכרטיס של נדרים שקיבלתם משמאל לימין ולסיום הקישו סולמית', allowAudio: true },
  { key: 'invalid_card', label: 'מספר כרטיס לא תקין', defaultText: 'מספר כרטיס לא תקין', allowAudio: true },
  { key: 'center_intro', label: 'הקדמה לבחירת מוקד', defaultText: 'אנא בחרו את המוקד שבו תקבלו את הכרטיס הקישו את קוד המוקד', allowAudio: true },
  { key: 'center_item', label: 'תבנית שורת מוקד', defaultText: 'למוקד {name} הקישו {code}', allowAudio: false, placeholders: ['name', 'code'], hint: 'הודעה דינמית — חובה לכלול את {name} ו-{code}. אין אפשרות הקלטה כי המוקדים משתנים.' },
  { key: 'invalid_center', label: 'קוד מוקד שגוי', defaultText: 'קוד מוקד שגוי אנא נסו שוב', allowAudio: true },
  { key: 'not_found', label: 'טלפון לא מזוהה', defaultText: 'מספר הטלפון שלכם לא קיים במערכת מעבירים אתכם בחזרה לתפריט הראשי', allowAudio: true },
  { key: 'no_birth', label: 'אין לידה פעילה / אין זכאות', defaultText: 'אין כרגע לידה מעודכנת במערכת אין כעת זכאות לקבלת כרטיס נדרים מאחר שלא נמצאה לידה בשישה השבועות האחרונים אם את בתוך שישה שבועות מהלידה ועדיין מופיעה שגיאה אנא פני למשרד', allowAudio: true },
  { key: 'pending_approval', label: 'לידה ממתינה לאישור המזכירות', defaultText: 'שים לב כרגע אין אפשרות להטעין את הכרטיס היות ועדיין אינכם מאושרים במערכת הלידה הנוכחית ממתינה לאישור של המזכירות', allowAudio: true },
  { key: 'card_already_linked', label: 'כרטיס כבר משויך ללידה זו', defaultText: 'כרטיס נדרים כבר משויך ללידה זו לא ניתן לשייך כרטיס נוסף אם יש צורך בעדכון אנא פני למשרד', allowAudio: true },
  { key: 'link_success', label: 'חיבור הכרטיס הצליח', defaultText: 'הכרטיס חובר בהצלחה המוקד שנבחר {center} שיהיה בריאות ומזל טוב', allowAudio: true, placeholders: ['center'], hint: 'ניתן לכלול {center} לשם המוקד. אם תעלה הקלטה אנושית — שם המוקד לא יוקרא.' },
  { key: 'link_fail', label: 'חיבור הכרטיס נכשל', defaultText: 'לא הצלחנו לחבר את הכרטיס הפעולה לא בוצעה אנא נסי שוב מאוחר יותר או פני למשרד', allowAudio: true },
  { key: 'not_in_nedarim', label: 'המשפחה אינה רשומה בנדרים', defaultText: 'לא ניתן לחבר את הכרטיס מאחר שהמשפחה אינה רשומה במערכת נדרים אנא פני למשרד', allowAudio: true },
  { key: 'card_saved_no_center', label: 'מספר נשמר (ללא שלב מוקד)', defaultText: 'מספר הכרטיס נשמר בהצלחה שיהיה בריאות ומזל טוב', allowAudio: true },
  { key: 'system_error', label: 'שגיאת מערכת כללית', defaultText: 'שגיאת מערכת אנא נסי שוב מאוחר יותר', allowAudio: true },
  { key: 'no_card_found', label: 'לא נמצא מספר כרטיס', defaultText: 'לא נמצא מספר כרטיס אנא חייגי שוב', allowAudio: true },
]

const META_BY_KEY = new Map(MATERNITY_MESSAGE_META.map((m) => [m.key, m]))

export function defaultMessages(): MaternityMessages {
  const out: MaternityMessages = {}
  for (const m of MATERNITY_MESSAGE_META) out[m.key] = { text: m.defaultText, audio: null }
  return out
}

// טוען את ההודעות — ברירות מחדל ממוזגות עם מה שנשמר ב-app_settings.
export async function getMaternityMessages(): Promise<MaternityMessages> {
  const merged = defaultMessages()
  const admin = getServiceClient()
  if (!admin) return merged

  const { data } = await admin.from('app_settings').select('value').eq('key', MATERNITY_MSG_KEY).maybeSingle()
  if (data?.value) {
    try {
      const saved = JSON.parse(data.value) as MaternityMessages
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

// שמירה — ממזג מעל ברירות המחדל (שומר על טקסט תקין בלבד; audio נשמר רק להודעות שמותר בהן).
export async function saveMaternityMessages(input: MaternityMessages): Promise<boolean> {
  const admin = getServiceClient()
  if (!admin) return false

  const current = await getMaternityMessages()
  for (const key of Object.keys(current)) {
    const i = input[key]
    if (!i) continue
    current[key] = {
      text: typeof i.text === 'string' && i.text.trim() ? i.text.trim() : current[key].text,
      audio: META_BY_KEY.get(key)?.allowAudio ? (i.audio ?? current[key].audio ?? null) : null,
    }
  }

  const { error } = await admin.from('app_settings').upsert(
    { key: MATERNITY_MSG_KEY, value: JSON.stringify(current), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return !error
}

// עדכון/מחיקת קובץ הקלטה להודעה בודדת (audio=null מסיר).
export async function setMaternityMessageAudio(key: string, audio: string | null): Promise<boolean> {
  if (!META_BY_KEY.get(key)?.allowAudio) return false
  const msgs = await getMaternityMessages()
  if (!msgs[key]) return false
  msgs[key] = { ...msgs[key], audio }
  return saveMaternityMessages(msgs)
}
