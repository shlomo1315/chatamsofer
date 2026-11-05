// מנתב בקשות מטכנוליין: אימות → בחירת מטפל לפי מערכת ושלוחה → תשובה.
//
// ⚠️ חוק ברזל: תמיד מחזירים JSON תקין. JSON לא תקין מחזיר את המתקשר לתפריט
// הקודם, ולכן כל שגיאה הופכת להודעה וניתוק.
import { goodbye, hangup } from './modules'
import { checkRequest, isSystemId, type RejectReason } from './systems'
import { applyVoice } from './voiceFiles'
import { validateResult } from './schema'
import type { TelephonySystemId, TlHandler, TlParams, TlResult } from './types'

type Registry = Record<TelephonySystemId, Record<string, TlHandler>>

const registry: Registry = { main: {}, yerid: {}, distributors: {} }

export function register(system: TelephonySystemId, ext: string, handler: TlHandler) {
  registry[system][ext] = handler
}

export type DispatchResult = { status: number; body: TlResult }

const REJECT_LABELS: Record<RejectReason, string> = {
  'no-secret': 'לא הוגדר סוד למערכת',
  'shared-secret': 'סוד משותף לכמה מערכות',
  'bad-secret': 'סוד שגוי בכתובת',
  'number-mismatch': 'המספר שהמרכזיה שלחה לא תואם למספר המערכת',
}

/** שלוש ספרות אחרונות בלבד — לזיהוי בלוג בלי לחשוף מספר מלא. */
const tail = (v?: string) => (v ?? '').replace(/\D/g, '').slice(-3) || '?'

const NOT_FOUND: DispatchResult = { status: 404, body: hangup() }

export async function dispatch(
  systemParam: string, secret: string, ext: string, params: TlParams,
): Promise<DispatchResult> {
  if (!isSystemId(systemParam)) return NOT_FOUND
  const system = systemParam
  const reject = checkRequest(system, secret, params.PBXdid)
  if (reject) {
    const num = reject === 'number-mismatch' ? ` (PBXdid מסתיים ב-${tail(params.PBXdid)})` : ''
    console.warn(`[telephony:${system}] בקשה נדחתה: ${REJECT_LABELS[reject]}${num}`)
    return NOT_FOUND
  }
  // אחרי ניתוק מגיעה פנייה נוספת עם PBXcallStatus=HANGUP — אין למי לענות, ואסור
  // להריץ שוב את השלב האחרון (למשל שיוך כרטיס).
  if (params.PBXcallStatus === 'HANGUP') return { status: 200, body: hangup() }
  const handler = registry[system][ext]
  if (!handler) {
    console.warn(`[telephony:${system}] שלוחה לא מוכרת: ${ext}`)
    return { status: 200, body: goodbye("השלוחה אינה זמינה") }
  }
  try {
    const body = await handler({
      system, ext, params,
      phone: params.PBXphone ?? '',
      callId: params.PBXcallId ?? '',
    })
    const v = validateResult(body)
    if (!v.ok) {
      console.error(`[telephony:${system}/${ext}] תשובה לא תקינה: ${v.error}`)
      return { status: 200, body: goodbye("אירעה שגיאה אנא נסו שוב מאוחר יותר") }
    }
    return { status: 200, body: system === 'main' ? await applyVoice(body) : body }
  } catch (e) {
    console.error(`[telephony:${system}/${ext}]`, e instanceof Error ? e.message : e)
    return { status: 200, body: goodbye("אירעה שגיאה אנא נסו שוב מאוחר יותר") }
  }
}
