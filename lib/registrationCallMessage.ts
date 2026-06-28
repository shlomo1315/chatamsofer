// הודעת השיחה הטלפונית לאחר רישום — טקסט הניתן לעריכה מדף ההגדרות.
// נשמר ב-app_settings תחת המפתח registration_call_message. השיחה היוצאת
// (placeAnnouncementCall) מקריאה את הטקסט הזה ב-TTS.
import { getServiceClient } from '@/lib/apiAuth'

export const REG_CALL_MSG_KEY = 'registration_call_message'

// ברירת המחדל — הנוסח שסוכם (כתובת המייל בעברית מדוברת ואז אות-אות באנגלית).
export const DEFAULT_REG_CALL_TEXT =
  'הרשמתך לאיגוד הצאצאים שעל ידי היכל החתם סופר נקלטה בהצלחה והועברה לטיפול המשרד בכדי לקבל אצלכם למייל את ההטבות המיוחדות לצאצאי רבינו החתם סופר שלחו מייל לכתובת איגוד שטרודל חסם סופר נקודה אינפו ושוב הכתובת באותיות אנגלית I G U D שטרודל C H A S A M S O F E R נקודה I N F O בהצלחה'

export async function getRegistrationCallText(): Promise<string> {
  const admin = getServiceClient()
  if (!admin) return DEFAULT_REG_CALL_TEXT
  const { data } = await admin.from('app_settings').select('value').eq('key', REG_CALL_MSG_KEY).maybeSingle()
  const t = (data?.value ?? '').trim()
  return t || DEFAULT_REG_CALL_TEXT
}

export async function saveRegistrationCallText(text: string): Promise<boolean> {
  const admin = getServiceClient()
  if (!admin) return false
  const value = String(text ?? '').trim() || DEFAULT_REG_CALL_TEXT
  const { error } = await admin.from('app_settings').upsert(
    { key: REG_CALL_MSG_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' },
  )
  return !error
}
