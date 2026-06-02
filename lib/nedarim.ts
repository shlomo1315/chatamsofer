// אינטגרציה עם נדרים פלוס ("נדרים קארד") — matara.pro
// כל הפעולות פונות לאותו endpoint ומחזירות JSON בצורה { Result: 'OK' | 'Error', Message, ... }.
// מודול צד-שרת בלבד (משתמש בסיסמת ה-API מהסביבה).

export const NEDARIM_URL =
  'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx'

export type NedarimCreds = { mosadId: string; apiPassword: string }

export function getNedarimCreds(): NedarimCreds | null {
  const mosadId = process.env.NEDARIM_MOSAD_ID
  const apiPassword = process.env.NEDARIM_API_PASSWORD
  if (!mosadId || !apiPassword) return null
  return { mosadId, apiPassword }
}

type NedarimResponse = { Result?: string; Message?: string; [k: string]: unknown }

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
  form.set('ApiPassword', creds.apiPassword)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') form.set(k, String(v))
  }

  const res = await fetch(NEDARIM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`נדרים החזיר שגיאה (${res.status})`)
  try {
    return JSON.parse(text) as NedarimResponse
  } catch {
    throw new Error(`תגובה לא תקינה מנדרים: ${text.slice(0, 200)}`)
  }
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

// חיפוש משפחה בנדרים לפי ת.ז. → מחזיר ClientId אם קיימת, אחרת null
export async function findClientByZeout(
  creds: NedarimCreds,
  zeout: string,
): Promise<string | null> {
  const r = await nedarimRequest(creds, 'GetClient_Table', {})
  if (!isOk(r)) throw new Error(r.Message || 'כשל במשיכת רשימת המשפחות מנדרים')
  const rows = Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : []
  const want = zeout.trim()
  const match = rows.find((row) => String(row.Zeout ?? '').trim() === want)
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

// הוספת טעינה למשפחה → { ok, tlushId, message }. בהצלחה ה-TlushId מגיע ב-Message.
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
  return {
    ok,
    tlushId: ok ? String(r.Message ?? '').trim() : null,
    message: String(r.Message ?? ''),
  }
}

// פריקת טעינה לפי מזהה הטעינה → { ok, message }
export async function prikatTlush(creds: NedarimCreds, tlushId: string) {
  const r = await nedarimRequest(creds, 'PrikatTlush', { TlushId: tlushId })
  return { ok: isOk(r), message: String(r.Message ?? '') }
}

// משיכת נתוני משפחה (לרענון יתרה) → TotalFreeAmount, או null אם נכשל
export async function getClientCard(creds: NedarimCreds, clientId: string) {
  const r = await nedarimRequest(creds, 'GetClientCard', { ClientId: clientId })
  if (!isOk(r)) return null
  const total = Number(r.TotalFreeAmount)
  return { totalFreeAmount: Number.isFinite(total) ? total : null }
}
