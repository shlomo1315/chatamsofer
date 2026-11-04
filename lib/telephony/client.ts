// שיחות יוצאות דרך Campaign API של טכנוליין (campaignRun) — לקוד אימות חד-פעמי.
//
// ⚠️ דרישה: כתובת ה-IP היוצאת של השרת חייבת להיות מאושרת בטכנוליין
// (אזור אישי ← "אבטחת API"), אחרת הבקשה נדחית (errorCode -99).
// לכן שיחות יוצאות כבויות עד שמגדירים TECHNOLINE_OUTBOUND_ENABLED=true.
// ⚠️ המפתח נלקח ממשתני הסביבה של המערכת הרלוונטית בלבד, והקוד אינו נרשם בלוג.
import { campaignApi } from './interaction'
import { accountConfig, getSystem } from './systems'
import type { TelephonySystemId } from './types'

export type CallResult = { ok: boolean; notConfigured?: boolean; error?: string }

export function callConfigured(system: TelephonySystemId): boolean {
  return !!getSystem(system).apiKey && accountConfig().outboundEnabled
}

/** מספר ישראלי בלבד, בצורה מקומית (05XXXXXXXX). null אם לא תקין. */
export function localPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '').replace(/^(00)?972/, '')
  if (!d.startsWith('0')) d = `0${d}`
  return /^(0[2348]\d{7}|07\d{8}|05[0-689]\d{7})$/.test(d) ? d : null
}

/** מקריא קוד חד-פעמי בשיחה קולית (TTS). הקוד אינו נרשם בלוג. */
export async function placeCodeCall(system: TelephonySystemId, phone: string, code: string): Promise<CallResult> {
  const cfg = getSystem(system)
  if (!cfg.apiKey || !accountConfig().outboundEnabled) return { ok: false, notConfigured: true }
  const digits = code.replace(/\D/g, '')
  if (digits.length < 4 || digits.length > 6) return { ok: false, error: 'הקוד חייב להיות 4 עד 6 ספרות' }
  const to = localPhone(phone)
  if (!to) return { ok: false, error: 'מספר טלפון לא תקין' }

  // ספרות מופרדות בנקודה-פסיק לקריאה ברורה (אסור פסיק או נקודה)
  const spoken = digits.split('').join('; ')
  const res = await campaignApi(system, 'campaignRun', {
    phones: [to],
    audioText: `קוד האימות שלך הוא ${spoken}. אני חוזר. ${spoken}`,
    ...(cfg.callerId ? { callId: cfg.callerId } : {}),
    callLength: 30, dialRetries: 1, betweenRetries: 5,
  })
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

/** מקריא טקסט חופשי בשיחה קולית (TTS). לשיחות יוצאות שאינן קוד אימות. */
export async function placeTextCall(system: TelephonySystemId, phone: string, text: string): Promise<CallResult> {
  const cfg = getSystem(system)
  if (!cfg.apiKey || !accountConfig().outboundEnabled) return { ok: false, notConfigured: true }
  const to = localPhone(phone)
  if (!to) return { ok: false, error: 'מספר טלפון לא תקין' }
  const audioText = text.replace(/[,\-"'&|=]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!audioText) return { ok: false, error: 'אין טקסט להקראה' }
  const res = await campaignApi(system, 'campaignRun', {
    phones: [to],
    audioText,
    ...(cfg.callerId ? { callId: cfg.callerId } : {}),
    callLength: 60, dialRetries: 1, betweenRetries: 5,
  })
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}
