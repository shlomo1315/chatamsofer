// שיחות יוצאות דרך Interaction API של טכנוליין (makeCall) — לקוד אימות חד-פעמי.
//
// ⚠️ דרישה: כתובת ה-IP היוצאת של השרת חייבת להיות מאושרת בטכנוליין
// (אזור אישי ← "אבטחת API"), אחרת הבקשה נדחית ב-403.
// ⚠️ המפתח נלקח ממשתני הסביבה של המערכת הרלוונטית בלבד ולעולם לא נרשם בלוג.
import { getSystem } from './systems'
import type { TelephonySystemId } from './types'

const API = 'https://api.tlivr.com/ivrFilesApi.php'

export type CallResult = { ok: boolean; notConfigured?: boolean; error?: string }

export function callConfigured(system: TelephonySystemId): boolean {
  return !!getSystem(system).apiKey
}

/** מקריא קוד חד-פעמי בשיחה קולית (mode=voice). הקוד אינו נרשם בלוג. */
export async function placeCodeCall(system: TelephonySystemId, phone: string, code: string): Promise<CallResult> {
  const cfg = getSystem(system)
  if (!cfg.apiKey) return { ok: false, notConfigured: true }
  const digits = code.replace(/\D/g, '')
  if (digits.length < 4 || digits.length > 6) return { ok: false, error: 'הקוד חייב להיות 4 עד 6 ספרות' }

  const q = new URLSearchParams({ action: 'makeCall', phone, cid: digits, mode: 'voice', apiKey: cfg.apiKey })
  if (cfg.callerId) q.set('callerId', cfg.callerId)
  try {
    const res = await fetch(`${API}?${q}`, { cache: 'no-store' })
    const json = await res.json().catch(() => null) as { status?: string; errorCode?: string; note?: string } | null
    if (!json) return { ok: false, error: `HTTP ${res.status}` }
    if (json.status !== 'OK') return { ok: false, error: `errorCode ${json.errorCode ?? '?'}: ${json.note ?? ''}`.trim() }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
