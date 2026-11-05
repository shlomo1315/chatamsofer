// שיחת זיכוי יוצאת ללקוחות הטלפון של היריד, דרך מערכת היריד בטכנוליין.
// השיחה מודיעה על הזיכוי ומזמינה לחזור לשלוחת הזיכויים, שם נקלטים פרטי הבנק.
import { callConfigured, placeTextCall, type CallResult } from '@/lib/telephony/client'
import { getSystem } from '@/lib/telephony/systems'

export function creditCallConfigured(): boolean {
  return callConfigured('yerid')
}

export function creditCallText(number: string | null): string {
  const back = number ? `התקשרו למספר ${number.split('').join(' ')}` : 'התקשרו למוקד היריד'
  return `שלום. כאן היכל החתם סופר. יש לכם זיכוי בגין ספרים שלא סופקו. כדי למסור את פרטי החשבון לזיכוי ${back}. תודה ושלום`
}

export function placeCreditCall(phone: string): Promise<CallResult> {
  return placeTextCall('yerid', phone, creditCallText(getSystem('yerid').number))
}
