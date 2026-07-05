// אינטגרציה עם נדרים פלוס ("נדרים קארד") — matara.pro
// כל הפעולות פונות לאותו endpoint ומחזירות JSON בצורה { Result: 'OK' | 'Error', Message, ... }.
// מודול צד-שרת בלבד. קוד המוסד וסיסמת ה-API נשמרים ב-app_settings (מפתח 'nedarim_card')
// עם נפילה-לאחור ל-ENV (NEDARIM_MOSAD_ID / NEDARIM_API_PASSWORD).
// תיעוד: https://matara.pro/nedarimplus/ApiDocumentation.html
import { getServiceClient } from '@/lib/apiAuth'

export const NEDARIM_URL =
  'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx'

const NEDARIM_KEY = 'nedarim_card'

// מזהה ברירת המחדל של קבוצת "הגבלת חנויות" — "עזר יולדות אוכל מוכן" בנדרים קארד.
// כל טעינת יולדת משויכת לקבוצה זו (פרמטר LimitedId ב-AddTlush) כדי להגביל את המימוש לחנויות המורשות.
export const MATERNITY_LIMITED_ID_DEFAULT = '823'

export type NedarimCreds = { mosadId: string; apiPassword: string }

// הגדרות נדרים הנשמרות תחת מפתח 'nedarim_card' ב-app_settings.
// הכתיבה ממזגת (patch) כדי לא לדרוס שדות שלא נמסרו — למשל שמירת קוד ה-API לא מוחקת את מזהה קבוצת ההגבלה.
type NedarimStoredSettings = { mosadId?: string; apiPassword?: string; maternityLimitedId?: string }

async function readNedarimSettings(): Promise<NedarimStoredSettings> {
  const admin = getServiceClient()
  if (!admin) return {}
  const { data } = await admin.from('app_settings').select('value').eq('key', NEDARIM_KEY).maybeSingle()
  if (data?.value) { try { return JSON.parse(data.value) as NedarimStoredSettings } catch { /* value אינו JSON */ } }
  return {}
}

async function writeNedarimSettings(patch: NedarimStoredSettings): Promise<boolean> {
  const admin = getServiceClient()
  if (!admin) return false
  const merged = { ...(await readNedarimSettings()), ...patch }
  const { error } = await admin.from('app_settings').upsert(
    { key: NEDARIM_KEY, value: JSON.stringify(merged), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return !error
}

// קריאת קוד מוסד + סיסמת API — קודם מההגדרות (app_settings), אחרת מ-ENV
export async function getNedarimCreds(): Promise<NedarimCreds | null> {
  const s = await readNedarimSettings()
  if (s.mosadId && s.apiPassword) return { mosadId: String(s.mosadId), apiPassword: String(s.apiPassword) }
  const mosadId = process.env.NEDARIM_MOSAD_ID
  const apiPassword = process.env.NEDARIM_API_PASSWORD
  if (mosadId && apiPassword) return { mosadId, apiPassword }
  return null
}

export async function saveNedarimCreds(creds: NedarimCreds): Promise<boolean> {
  return writeNedarimSettings({ mosadId: creds.mosadId.trim(), apiPassword: creds.apiPassword.trim() })
}

// מזהה קבוצת "הגבלת חנויות" לטעינות יולדות — מההגדרות, אחרת ENV, אחרת ברירת המחדל (823 — "עזר יולדות אוכל מוכן")
export async function getMaternityLimitedId(): Promise<string> {
  const s = await readNedarimSettings()
  if (s.maternityLimitedId && String(s.maternityLimitedId).trim()) return String(s.maternityLimitedId).trim()
  const env = process.env.NEDARIM_MATERNITY_LIMITED_ID
  return (env && env.trim()) || MATERNITY_LIMITED_ID_DEFAULT
}

export async function saveMaternityLimitedId(limitedId: string): Promise<boolean> {
  return writeNedarimSettings({ maternityLimitedId: String(limitedId).trim() })
}

export type NedarimResponse = { Result?: string; Message?: string; [k: string]: unknown }
const isOk = (r: NedarimResponse) => String(r.Result ?? '').toUpperCase() === 'OK'

// שליחת בקשה לנדרים (FORM urlencoded) והחזרת ה-JSON המפוענח
// timeoutMs ניתן לקיצור בנתיבים אינטראקטיביים (שיחת ימות) כדי לא לחרוג מחלון התגובה של ימות.
async function nedarimRequest(
  creds: NedarimCreds,
  action: string,
  params: Record<string, string | undefined>,
  timeoutMs = 25_000,
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
  const timer = setTimeout(() => controller.abort(), timeoutMs)
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

// משיכת רשימת כל המשפחות (GetClient_Table) → { total, families[], meta }
// meta = כל השדות ברמה העליונה של התגובה (למעט data) — לאיתור שדות לא מתועדים כמו יתרת ארנק המוסד
export async function getClientsTable(creds: NedarimCreds) {
  const r = await nedarimRequest(creds, 'GetClient_Table', {})
  if (!isOk(r)) throw new Error(r.Message || 'כשל במשיכת רשימת המשפחות מנדרים')
  const rows = Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : []
  const meta: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (k === 'data') continue
    if (v === null || typeof v !== 'object') meta[k] = v
  }
  return { total: r.Total ?? null, families: rows, meta }
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
  groupe: string = 'לידות',
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
    Groupe: groupe || undefined, // קטגוריה בנדרים — ברירת מחדל "לידות"
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
// limitedId = מזהה קבוצת "הגבלת חנויות" בנדרים (פרמטר LimitedId ב-AddTlush), המגביל את מימוש
// הטעינה לחנויות שבקבוצה. לטעינות יולדות מועבר מזהה הקבוצה "עזר יולדות אוכל מוכן" (getMaternityLimitedId).
// הערה: אין ל-AddTlush פרמטר "Groupe" מתועד — לכן השיוך חייב להיעשות דרך LimitedId בלבד.
export async function addTlush(
  creds: NedarimCreds,
  clientId: string,
  amount: number,
  expiration?: string,
  comments?: string,
  limitedId?: string,
) {
  const r = await nedarimRequest(creds, 'AddTlush', {
    ClientId: clientId,
    Amount: String(amount),
    Expiration: expiration,
    Comments: comments,
    LimitedId: limitedId,
  })
  const ok = isOk(r)
  return { ok, tlushId: ok ? String(r.Message ?? '').trim() : null, message: String(r.Message ?? '') }
}

// רשימת קבוצות "הגבלת חנויות" (LimitedStores) — כל קבוצה מגבילה באילו חנויות ניתן לממש.
// מחזיר את המבנה הגולמי כדי שנזהה את שם/מזהה הקבוצה המדויקים כפי שנדרים מחזירה.
export async function getLimitedStoresList(creds: NedarimCreds): Promise<{ groups: Record<string, unknown>[]; raw: NedarimResponse }> {
  const r = await nedarimRequest(creds, 'GetLimitedStoresList', {})
  const known = Array.isArray(r.data) ? (r.data as Record<string, unknown>[])
    : Array.isArray((r as { List?: unknown }).List) ? ((r as { List: Record<string, unknown>[] }).List)
    : Array.isArray((r as { Groups?: unknown }).Groups) ? ((r as { Groups: Record<string, unknown>[] }).Groups)
    : null
  // נדרים מחזירה את הקבוצות (ID + ListName + Stores) תחת מפתח שאינו תמיד קבוע — אם לא זוהה מפתח
  // ידוע, סורקים כל מערך עליון ובוחרים את זה שפריטיו נראים כמו קבוצות (בעלי ListName) כדי לזהות את המזהה.
  const groups = known ?? (() => {
    for (const v of Object.values(r)) {
      if (Array.isArray(v) && v.some(x => x && typeof x === 'object' && 'ListName' in (x as object))) {
        return v as Record<string, unknown>[]
      }
    }
    return []
  })()
  return { groups, raw: r }
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
  opts?: { cardId?: string; remove?: boolean; timeoutMs?: number },
) {
  const r = await nedarimRequest(creds, 'SetClientMagneticCard', {
    ClientId: clientId,
    MagneticCard: magneticCard,
    CardId: opts?.cardId,
    // נדרים דורש שהפרמטר יישלח תמיד — '0' בהוספה, '1' במחיקה (השמטתו מחזירה "פרמטר Remove לא תקין")
    Remove: opts?.remove ? '1' : '0',
  }, opts?.timeoutMs)
  return { ok: isOk(r), message: String(r.Message ?? ''), data: r }
}

// מחיקת כרטיס מגנטי לפי מספר: מאתר קודם את CardId (נדרים דורש CardId למחיקה) ואז מוחק.
// אם הכרטיס כבר לא משויך — מחזיר הצלחה (notFound).
export async function removeMagneticByNumber(
  creds: NedarimCreds, clientId: string, cardNumber: string,
): Promise<{ ok: boolean; message: string; notFound?: boolean }> {
  const want = cardNumber.replace(/\D/g, '')
  let cardId: string | undefined
  try {
    const full = await getClientCardFull(creds, clientId)
    const cards = Array.isArray((full as { Cards?: unknown } | null)?.Cards) ? ((full as { Cards: Record<string, unknown>[] }).Cards) : []
    const hit = cards.find(c => !c.RemovedDate && [c.MagneticCard, c.CardNumber].some(v => String(v ?? '').replace(/\D/g, '') === want))
    if (!hit) return { ok: true, message: '', notFound: true }
    cardId = hit.CardId != null ? String(hit.CardId) : undefined
  } catch { /* נמשיך בלי CardId */ }
  const r = await setMagneticCard(creds, clientId, cardNumber, { remove: true, cardId })
  return { ok: r.ok, message: r.message }
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
