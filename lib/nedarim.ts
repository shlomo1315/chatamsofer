// אינטגרציה עם נדרים פלוס ("נדרים קארד") — matara.pro
// כל הפעולות פונות לאותו endpoint ומחזירות JSON בצורה { Result: 'OK' | 'Error', Message, ... }.
// מודול צד-שרת בלבד. קוד המוסד וסיסמת ה-API נשמרים ב-app_settings (מפתח 'nedarim_card')
// עם נפילה-לאחור ל-ENV (NEDARIM_MOSAD_ID / NEDARIM_API_PASSWORD).
// תיעוד: https://matara.pro/nedarimplus/ApiDocumentation.html
import { getServiceClient } from '@/lib/apiAuth'

export const NEDARIM_URL =
  'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx'

const NEDARIM_KEY = 'nedarim_card'

export type NedarimCreds = { mosadId: string; apiPassword: string }

// קריאת קוד מוסד + סיסמת API — קודם מההגדרות (app_settings), אחרת מ-ENV
export async function getNedarimCreds(): Promise<NedarimCreds | null> {
  const admin = getServiceClient()
  if (admin) {
    const { data } = await admin.from('app_settings').select('value').eq('key', NEDARIM_KEY).maybeSingle()
    if (data?.value) {
      try {
        const p = JSON.parse(data.value)
        if (p?.mosadId && p?.apiPassword) return { mosadId: String(p.mosadId), apiPassword: String(p.apiPassword) }
      } catch { /* value אינו JSON */ }
    }
  }
  const mosadId = process.env.NEDARIM_MOSAD_ID
  const apiPassword = process.env.NEDARIM_API_PASSWORD
  if (mosadId && apiPassword) return { mosadId, apiPassword }
  return null
}

export async function saveNedarimCreds(creds: NedarimCreds): Promise<boolean> {
  const admin = getServiceClient()
  if (!admin) return false
  const value = JSON.stringify({ mosadId: creds.mosadId.trim(), apiPassword: creds.apiPassword.trim() })
  const { error } = await admin.from('app_settings').upsert(
    { key: NEDARIM_KEY, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return !error
}

export type NedarimResponse = { Result?: string; Message?: string; [k: string]: unknown }
const isOk = (r: NedarimResponse) => String(r.Result ?? '').toUpperCase() === 'OK'

// שליחת בקשה לנדרים (FORM urlencoded) והחזרת ה-JSON המפוענח
async function nedarimRequest(
  creds: NedarimCreds,
  action: string,
  params: Record<string, string | undefined>,
): Promise<NedarimResponse> {
  const form = new URLSearchParams()
  form.set('Action', action)
  form.set('MosadId', creds.mosadId)
  form.set('MosadNumber', creds.mosadId) // חלק מהפעולות מצפות ל-MosadNumber
  form.set('ApiPassword', creds.apiPassword)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') form.set(k, String(v))
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  let res: Response
  try {
    res = await fetch(NEDARIM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
      cache: 'no-store',
    })
  } finally { clearTimeout(timer) }
  const text = await res.text()
  if (!res.ok) throw new Error(`נדרים החזיר שגיאה (${res.status})`)
  try {
    return JSON.parse(text) as NedarimResponse
  } catch {
    // חלק מהפעולות מחזירות טקסט פשוט (OK / שגיאה)
    return { Result: text.trim().toUpperCase().startsWith('OK') ? 'OK' : 'Error', Message: text.trim() }
  }
}

// קריאה גנרית שמושכת בעצמה את הקרדנציאלס — לשימוש ע"י ה-proxy
export async function nedarimCall(
  action: string,
  params: Record<string, string | undefined> = {},
): Promise<NedarimResponse> {
  const creds = await getNedarimCreds()
  if (!creds) throw new Error('נדרים קארד אינו מוגדר — יש להזין קוד מוסד וקוד API בהגדרות')
  return nedarimRequest(creds, action, params)
}

export type NedarimClientFields = {
  full_name?: string | null
  family_name?: string | null
  id_number?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
}

// משיכת רשימת כל המשפחות (GetClient_Table) → { total, families[] }
export async function getClientsTable(creds: NedarimCreds) {
  const r = await nedarimRequest(creds, 'GetClient_Table', {})
  if (!isOk(r)) throw new Error(r.Message || 'כשל במשיכת רשימת המשפחות מנדרים')
  const rows = Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : []
  return { total: r.Total ?? null, families: rows }
}

// חיפוש משפחה בנדרים לפי ת.ז. → מחזיר ClientId אם קיימת, אחרת null
export async function findClientByZeout(creds: NedarimCreds, zeout: string): Promise<string | null> {
  const { families } = await getClientsTable(creds)
  const want = zeout.trim()
  const match = families.find((row) => String(row.Zeout ?? '').trim() === want)
  return match ? String(match.ClientId) : null
}

// הקמת/עדכון משפחה בנדרים → מחזיר ClientId (מגיע ב-Message בהצלחה)
export async function saveClientCard(
  creds: NedarimCreds,
  b: NedarimClientFields,
  clientId?: string | null,
): Promise<string | null> {
  const r = await nedarimRequest(creds, 'SaveClientCard', {
    ClientId: clientId ?? undefined,
    FamilyName: b.family_name || b.full_name || '',
    FirstName: b.full_name || '',
    Zeout: b.id_number ?? undefined,
    Address: [b.address, b.city].filter(Boolean).join(', ') || undefined,
    Phone1: b.phone ?? undefined,
    Phone2: b.phone2 ?? undefined,
    Email: b.email ?? undefined,
    Comments: 'נוצר/עודכן אוטומטית ממערכת היכל החתם סופר',
  })
  if (!isOk(r)) throw new Error(r.Message || 'כשל בהקמת/עדכון משפחה בנדרים')
  const id = String(r.Message ?? '').trim()
  return id || clientId || null
}

// מחיקת משפחה
export async function deleteClient(creds: NedarimCreds, clientId: string) {
  const r = await nedarimRequest(creds, 'SaveClientCard', { ClientId: clientId, Deleted: '1' })
  return { ok: isOk(r), message: String(r.Message ?? '') }
}

// הוספת טעינה למשפחה → { ok, tlushId, message }
export async function addTlush(
  creds: NedarimCreds,
  clientId: string,
  amount: number,
  expiration?: string,
  comments?: string,
) {
  const r = await nedarimRequest(creds, 'AddTlush', {
    ClientId: clientId,
    Amount: String(amount),
    Expiration: expiration,
    Comments: comments,
  })
  const ok = isOk(r)
  return { ok, tlushId: ok ? String(r.Message ?? '').trim() : null, message: String(r.Message ?? '') }
}

// פריקת טעינה לפי מזהה הטעינה → { ok, message }
export async function prikatTlush(creds: NedarimCreds, tlushId: string) {
  const r = await nedarimRequest(creds, 'PrikatTlush', { TlushId: tlushId })
  return { ok: isOk(r), message: String(r.Message ?? '') }
}

// שיוך / מחיקת כרטיס מגנטי
export async function setMagneticCard(
  creds: NedarimCreds,
  clientId: string,
  magneticCard: string,
  opts?: { cardId?: string; remove?: boolean },
) {
  const r = await nedarimRequest(creds, 'SetClientMagneticCard', {
    ClientId: clientId,
    MagneticCard: magneticCard,
    CardId: opts?.cardId,
    Remove: opts?.remove ? '1' : undefined,
  })
  return { ok: isOk(r), message: String(r.Message ?? ''), data: r }
}

// משיכת נתוני משפחה מלאים (פרטים + יתרה + היסטוריה + טעינות + כרטיסים + סירובים)
export async function getClientCardFull(creds: NedarimCreds, clientId: string): Promise<NedarimResponse | null> {
  const r = await nedarimRequest(creds, 'GetClientCard', { ClientId: clientId })
  if (!isOk(r)) return null
  return r
}

// משיכת נתוני משפחה (לרענון יתרה) → TotalFreeAmount, או null אם נכשל
export async function getClientCard(creds: NedarimCreds, clientId: string) {
  const r = await nedarimRequest(creds, 'GetClientCard', { ClientId: clientId })
  if (!isOk(r)) return null
  const total = Number(r.TotalFreeAmount)
  return { totalFreeAmount: Number.isFinite(total) ? total : null }
}
