// שלוחת הקראת קוד אימות (OTP) — המתקשר שומע את הקוד הממתין למספרו, פעם אחת.
// הקוד אינו נרשם בלוג.
import { digits, say, goodbye, message, hangup } from '../modules'
import { takePendingCode } from '../otpLookup'
import type { TlHandler } from '../types'

export const otp: TlHandler = async ({ phone, callId }) => {
  if (!phone) return goodbye('שגיאה במספר המתקשר')
  const r = await takePendingCode(phone)
  console.log(`[telephony:main/otp] result=${r.kind} callId=${callId}`)
  switch (r.kind) {
    case 'ok':
      return [
        { type: 'simpleMessage', files: [...say('קוד הכניסה שלך הוא'), digits(r.code)] },
        { type: 'simpleMessage', files: [...say('אני חוזר'), digits(r.code)] },
        hangup(),
      ]
    case 'expired': return goodbye('הקוד פג תוקף אנא בקשו קוד חדש מהאתר')
    case 'none': return goodbye('לא נמצא קוד פעיל אנא בקשו קוד חדש מהאתר')
    case 'badPhone': return goodbye('שגיאה במספר המתקשר')
    default: return [message('שגיאת מערכת אנא נסו שוב מאוחר יותר'), hangup()]
  }
}
