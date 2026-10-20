// שליחה קולית פשוטה: חיוג לכל מי שרכש ביריד, ומשמיעים את ההודעה המוקלטת ומנתקים.
// ההשמעה מובטחת כי ה-webhook של שלוחת הזיכויים (כבר מחובר לתבנית) מזהה שיש שליחה פעילה
// למספר, ועונה `id_list_message=<f-קובץ>` ו-hangup, בלי תפריט.
import { normalizePhone } from './kvitel'

export const VOICE_BROADCAST_KEY = 'voice_broadcast_active'
export const VOICE_BROADCAST_STATUSES = ['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded']
export const VOICE_TEST_WINDOW_MS = 30 * 60 * 1000
export const VOICE_FULL_WINDOW_MS = 4 * 60 * 60 * 1000

export type VoiceMarker = { until: string; phones: string[] | 'all' }

export type VoiceRecipient = { phone: string; name: string; }

/** נמענים: רק הזמנות משלוח ששולמו ולא בוטלו (איסוף עצמי כבר קיבלו). מספר ייחודי פעם אחת. הרשימה היחידה לספירה, לטבלה ולחיוג. */
export function pickVoiceRecipientList(rows: { customer_phone: string | null; customer_name?: string | null; delivery_method?: string | null; status?: string }[]): VoiceRecipient[] {
  const seen = new Map<string, VoiceRecipient>()
  for (const r of rows) {
    if (r.status && !VOICE_BROADCAST_STATUSES.includes(r.status)) continue
    if (r.delivery_method !== 'shipping') continue
    const phone = normalizePhone(r.customer_phone ?? '')
    if (!phone || seen.has(phone)) continue
    seen.set(phone, { phone, name: String(r.customer_name ?? '').trim() })
  }
  return [...seen.values()]
}

/** האם המספר אמור לשמוע את ההודעה לפי סימון השליחה הפעילה. */
export function voiceMarkerCovers(raw: string | null | undefined, phone: string, now = Date.now()): boolean {
  if (!raw) return false
  let m: VoiceMarker
  try { m = JSON.parse(raw) } catch { return false }
  if (!m?.until || Date.parse(m.until) < now) return false
  return m.phones === 'all' || (Array.isArray(m.phones) && m.phones.includes(phone))
}

const YEMOT_API = 'https://www.call2all.co.il/ym/api'

/** חיוג בחשבון היריד בלבד (YEMOT_BOOK_FAIR_TOKEN). קבוצות של עד 50 מספרים. */
export async function dialVoiceBroadcast(phones: string[]): Promise<{ ok: boolean; dialed: number; error?: string }> {
  const token = process.env.YEMOT_BOOK_FAIR_TOKEN
  const templateId = process.env.YEMOT_BOOK_FAIR_CREDIT_TEMPLATE_ID
  if (!token || !templateId) return { ok: false, dialed: 0, error: 'חשבון ימות של היריד אינו מוגדר' }
  let dialed = 0
  for (let i = 0; i < phones.length; i += 50) {
    const chunk = phones.slice(i, i + 50)
    const form = new URLSearchParams()
    form.set('token', token); form.set('templateId', templateId); form.set('withSMS', '0')
    form.set('phones', JSON.stringify(Object.fromEntries(chunk.map(p => [p.replace(/\D/g, ''), '']))))
    const callerId = process.env.YEMOT_BOOK_FAIR_CALLER_ID
    if (callerId) form.set('callerId', callerId)
    try {
      const res = await fetch(`${YEMOT_API}/RunCampaign`, { method: 'POST', body: form })
      const json = await res.json().catch(() => null)
      if (!json || (json.responseStatus && json.responseStatus !== 'OK')) {
        return { ok: false, dialed, error: json ? String(json.message ?? json.responseStatus) : `HTTP ${res.status}` }
      }
      dialed += chunk.length
    } catch (e) { return { ok: false, dialed, error: e instanceof Error ? e.message : String(e) } }
  }
  return { ok: true, dialed }
}
