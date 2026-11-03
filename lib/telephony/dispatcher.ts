// מנתב בקשות מטכנוליין: אימות → בחירת מטפל לפי מערכת ושלוחה → תשובה.
//
// ⚠️ חוק ברזל: תמיד מחזירים JSON תקין. JSON לא תקין מחזיר את המתקשר לתפריט
// הקודם, ולכן כל שגיאה הופכת להודעה וניתוק.
import { goodbye, hangup } from './modules'
import { isSystemId, verifyRequest } from './systems'
import { validateResult } from './schema'
import type { TelephonySystemId, TlHandler, TlParams, TlResult } from './types'

type Registry = Record<TelephonySystemId, Record<string, TlHandler>>

const registry: Registry = { main: {}, yerid: {}, distributors: {} }

export function register(system: TelephonySystemId, ext: string, handler: TlHandler) {
  registry[system][ext] = handler
}

export type DispatchResult = { status: number; body: TlResult }

const NOT_FOUND: DispatchResult = { status: 404, body: hangup() }

export async function dispatch(
  systemParam: string, secret: string, ext: string, params: TlParams,
): Promise<DispatchResult> {
  if (!isSystemId(systemParam)) return NOT_FOUND
  const system = systemParam
  if (!verifyRequest(system, secret, params.PBXdid)) {
    console.warn(`[telephony:${system}] בקשה נדחתה (סוד שגוי או חסר)`)
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
    return { status: 200, body }
  } catch (e) {
    console.error(`[telephony:${system}/${ext}]`, e instanceof Error ? e.message : e)
    return { status: 200, body: goodbye("אירעה שגיאה אנא נסו שוב מאוחר יותר") }
  }
}
