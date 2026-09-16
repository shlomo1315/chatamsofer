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
type NedarimStoredSettings = {
  mosadId?: string; apiPassword?: string; maternityLimitedId?: string
  // ── חלוקות חגים ──
  // ⚠️ הרשאה נפרדת בכוונה: החגים והיולדות הם שני תקציבים ושתי קבוצות הגבלת
  // חנויות, ולעיתים שני מוסדות בנדרים. שימוש בהרשאה אחת לשניהם היה מקשר טעינת
  // חג לתקציב היולדות, וזה בלתי-הפיך מבחינת הדיווח.
  holidayMosadId?: string; holidayApiPassword?: string; holidayLimitedId?: string
}

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

// ── חלוקות חגים — הרשאת נדרים נפרדת ────────────────────────────────────────
/**
 * פרטי החיבור לנדרים עבור החגים.
 *
 * ⚠️ נפילה-לאחור להרשאה הראשית *בכוונה*: שיוך הכרטיס בשלוחה הטלפונית עובד היום
 * עם ההרשאה הראשית, והחזרת null כשלא הוגדרה הרשאת חגים הייתה משביתה ערוץ עובד
 * ברגע הפריסה. מי שרוצה הפרדה מגדיר; מי שלא — ממשיך כמו קודם.
 */
export async function getHolidayNedarimCreds(): Promise<NedarimCreds | null> {
  const s = await readNedarimSettings()
  if (s.holidayMosadId && s.holidayApiPassword) {
    return { mosadId: String(s.holidayMosadId), apiPassword: String(s.holidayApiPassword) }
  }
  return getNedarimCreds()
}

/** האם הוגדרה הרשאה *נפרדת* לחגים (לעומת שימוש בראשית). */
export async function hasSeparateHolidayCreds(): Promise<boolean> {
  const s = await readNedarimSettings()
  return !!(s.holidayMosadId && s.holidayApiPassword)
}

export async function saveHolidayNedarimCreds(creds: NedarimCreds): Promise<boolean> {
  return writeNedarimSettings({
    holidayMosadId: creds.mosadId.trim(),
    holidayApiPassword: creds.apiPassword.trim(),
  })
}

/** ניקוי ההרשאה הנפרדת — חזרה לשימוש בהרשאה הראשית. */
export async function clearHolidayNedarimCreds(): Promise<boolean> {
  return writeNedarimSettings({ holidayMosadId: '', holidayApiPassword: '' })
}

/** קבוצת "הגבלת חנויות" לטעינות החגים. ריק = בלי הגבלה. */
export async function getHolidayLimitedId(): Promise<string> {
  const s = await readNedarimSettings()
  if (s.holidayLimitedId && String(s.holidayLimitedId).trim()) return String(s.holidayLimitedId).trim()
  return (process.env.NEDARIM_HOLIDAY_LIMITED_ID ?? '').trim()
}

export async function saveHolidayLimitedId(limitedId: string): Promise<boolean> {
  return writeNedarimSettings({ holidayLimitedId: String(limitedId).trim() })
}

export type NedarimResponse = { Result?: string; Message?: string; [k: string]: unknown }
const isOk = (r: NedarimResponse) => String(r.Result ?? '').toUpperCase() === 'OK'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 תור קצב גלובלי לכל קריאה יוצאת לנדרים — per-instance, בזיכרון.
//
// ⚠️ ב-14-15.09 נדרים דיווחו על קרוב ל-3,000 פניות בשעה מה-IP שלנו ואיימו
// בחסימה. הסיבה: כל שיחת שיוך כרטיס בשלוחת החגים מבצעת 2-5 קריאות (חיפוש,
// הקמה, שיוך, אימות), ולפני החג עשרות משפחות מתקשרות באותה דקה — בלי גורם
// בקוד שמגביל כמה קריאות יוצאות בו-זמנית לצד השלישי. זה לא לולאה על אותה
// בקשה (הבדיקה "כבר משויך" עובדת נכון ועוצרת retry לפני שהוא נוגע בנדרים);
// זה עומס לגיטימי מרוכז שהצטבר בלי שום ריסון.
//
// ⚠️ תור ולא Promise.all חסום: קריאה שממתינה בתור עדיין מחזירה תשובה בסוף,
// ולא נכשלת — רק נדחית. חלון האינטראקטיבי (שיחת ימות, 15 שניות) מוגן בנפרד
// ע"י timeoutMs הקצר שהמסלולים האלה כבר מעבירים.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_CONCURRENT_REQUESTS = 3
const MIN_GAP_MS = 150
let activeRequests = 0
let lastDispatchAt = 0
const queue: (() => boolean)[] = []

// ⚠️ אין כאן תקרה קשיחה לשעה, בכוונה. תקרה כזו (למשל 800) נראית נכונה מול
// התלונה של נדרים, אבל היא נאכפת בדיוק בערב שלפני החג — כשמאות משפחות
// מתקשרות לשייך, כל אחת צורכת 2-5 קריאות, והמאוחרות היו מקבלות "נסו שוב
// בעוד רגע" על פעולה שאי אפשר לדחות. הוויסות למטה מוריד את *הפיק הרגעי*
// שהוא מה שנדרים חוסמים עליו, בלי לחסום אף משפחה.

// ⚠️ הפריט בתור עצמו מחזיר true אם תפס slot בפועל: entry שבוטל (פג הזמן
// שהוקצב לו בתור) מחזיר false, ואז ה-slot שהוקצה לו כאן משתחרר מיד לפריט
// הבא — אחרת activeRequests "דולף" על כל בקשה שפגה בתור, עד שהתור נתקע
// לצמיתות על התקרה בלי לשחרר אף slot.
function scheduleNext() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || queue.length === 0) return
  const now = Date.now()
  const wait = Math.max(0, lastDispatchAt + MIN_GAP_MS - now)
  setTimeout(() => {
    const next = queue.shift()
    if (!next) return
    activeRequests++
    lastDispatchAt = Date.now()
    if (!next()) activeRequests--
    scheduleNext()
  }, wait)
}

// ⚠️ תקרה על ההמתנה *בתור עצמו* — נפרדת מ-timeoutMs של הבקשה. בלעדיה עומס
// קיצוני (מאות שיחות בו-זמנית) יכול להשאיר בקשה תקועה בתור דקות ארוכות,
// גם אם הרשת לנדרים תקינה — וזה בדיוק הזמן שנספר מתוך 15 השניות שיש
// לימות. עדיף כישלון מהיר וברור ("נסו שוב בעוד רגע") מהמתנה שקטה שחורגת
// מחלון השיחה.
const QUEUE_WAIT_TIMEOUT_MS = 8_000

function acquireSlot(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const entry = (): boolean => {
      if (settled) return false // כבר פג הזמן — לא תופס slot, הבא בתור מקבל אותו
      settled = true
      clearTimeout(waitTimer)
      resolve(() => {
        activeRequests--
        scheduleNext()
      })
      return true
    }
    const waitTimer = setTimeout(() => {
      if (settled) return
      settled = true
      const idx = queue.indexOf(entry)
      if (idx !== -1) queue.splice(idx, 1)
      reject(new Error('נדרים עמוס כרגע — נסו שוב בעוד רגע'))
    }, QUEUE_WAIT_TIMEOUT_MS)
    queue.push(entry)
    scheduleNext()
  })
}

// שליחת בקשה לנדרים (FORM urlencoded) והחזרת ה-JSON המפוענח
// timeoutMs ניתן לקיצור בנתיבים אינטראקטיביים (שיחת ימות) כדי לא לחרוג מחלון התגובה של ימות.
async function nedarimRequest(
  creds: NedarimCreds,
  action: string,
  params: Record<string, string | undefined>,
  timeoutMs = 25_000,
): Promise<NedarimResponse> {
  const release = await acquireSlot()
  try {
    return await nedarimRequestRaw(creds, action, params, timeoutMs)
  } finally {
    release()
  }
}

async function nedarimRequestRaw(
  creds: NedarimCreds,
  action: string,
  params: Record<string, string | undefined>,
  timeoutMs: number,
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
  /**
   * סוג המסמך המזהה. 'passport' = דרכון, כל השאר = ת"ז ישראלית.
   *
   * 🔴 נדרים דוחה דרכון בשדה Zeout ("מספר זהות שגוי. נא לרשום מספר בספרות
   * בלבד") — ולכן דרכון נשלח למזהה ג'. בלי ההבחנה הזו כל יולדת עם דרכון
   * נכשלה בהקמת הכרטיס ונשארה בלי כרטיס מזון.
   */
  id_type?: 'id' | 'passport' | string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
}

/**
 * האם המזהה הוא דרכון ולא ת"ז ישראלית.
 *
 * ⚠️ נקבע גם לפי id_type וגם לפי תוכן המספר, ובכוונה: השדה אינו תמיד
 * מלא (רשומות ישנות, קליטה ממייל), אבל מזהה שיש בו אות *אינו* ת"ז ישראלית
 * בשום מקרה. שתי הבדיקות יחד מכסות גם רשומה שסומנה וגם כזו שלא.
 */
export function isPassportId(fields: { id_number?: string | null; id_type?: string | null }): boolean {
  if (fields.id_type === 'passport') return true
  const s = String(fields.id_number ?? '').trim()
  return s.length > 0 && /[^\d\s-]/.test(s)
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מטמון קצר לטבלת הלקוחות — הבזבוז הגדול ביותר מול נדרים.
//
// ⚠️ findClientByZeout מושכת את *כל* טבלת הלקוחות (אלפי משפחות) כדי לאתר
// משפחה אחת, ו-loadOne קוראת לה פעמיים לכל טעינה (ת"ז הבעל ואז האישה).
// בערב החג, בקצב של ~5 שיוכי כרטיסים בדקה, זה עשר משיכות של הטבלה המלאה
// בכל דקה — על אותם נתונים בדיוק. זה החלק הארי של העומס שנדרים מדדו.
//
// ⚠️ 60 שניות ולא יותר: הקמת משפחה חדשה חייבת להיראות בחיפוש שאחריה, אחרת
// המערכת תנסה להקים אותה שוב ותידחה ב"כבר רשום". החלון קצר דיו לכך, וארוך
// דיו כדי לבלוע את כל השיחות המקבילות של אותה דקה.
//
// ⚠️ מטמון לכל מוסד בנפרד (mosadId): היולדות והחגים הם שני מוסדות שונים עם
// שתי טבלאות שונות, וערבוב ביניהם היה מחזיר את המשפחה הלא נכונה.
// ─────────────────────────────────────────────────────────────────────────────
type ClientsTableResult = { total: unknown; families: Record<string, unknown>[]; meta: Record<string, unknown> }
const CLIENTS_TABLE_TTL_MS = 60_000
const clientsTableCache = new Map<string, { at: number; value: ClientsTableResult }>()
/** ⚠️ בקשות מקבילות מתמזגות לקריאה אחת — אחרת עשר שיחות בו-זמנית מייצרות
 *  עשר משיכות של אותה טבלה לפני שהראשונה הספיקה להיכנס למטמון. */
const clientsTableInflight = new Map<string, Promise<ClientsTableResult>>()

/** ניקוי המטמון למוסד — נקרא אחרי הקמת משפחה, כדי שתימצא מיד. */
export function invalidateClientsTable(creds: NedarimCreds) {
  clientsTableCache.delete(creds.mosadId)
  clientsTableInflight.delete(creds.mosadId)
}

// משיכת רשימת כל המשפחות (GetClient_Table) → { total, families[], meta }
// meta = כל השדות ברמה העליונה של התגובה (למעט data) — לאיתור שדות לא מתועדים כמו יתרת ארנק המוסד
export async function getClientsTable(creds: NedarimCreds): Promise<ClientsTableResult> {
  const key = creds.mosadId
  const hit = clientsTableCache.get(key)
  if (hit && Date.now() - hit.at < CLIENTS_TABLE_TTL_MS) return hit.value

  const inflight = clientsTableInflight.get(key)
  if (inflight) return inflight

  const p = fetchClientsTable(creds)
    .then(value => {
      clientsTableCache.set(key, { at: Date.now(), value })
      return value
    })
    .finally(() => { clientsTableInflight.delete(key) })
  clientsTableInflight.set(key, p)
  return p
}

async function fetchClientsTable(creds: NedarimCreds): Promise<ClientsTableResult> {
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

// ─────────────────────────────────────────────────────────────────────────────
// נרמול ת"ז להשוואה — ספרות בלבד, מרופד ל-9.
//
// ⚠️ במערכת שלנו ת"ז נשמרת לעיתים בלי האפס המוביל ("12345678"), ובנדרים היא
// שמורה מלאה ("012345678"). השוואת מחרוזות מדויקת נכשלה, החיפוש החזיר null,
// המערכת ניסתה *להקים* משפחה שכבר קיימת — ונדרים דחו ב"מספר זהות זה כבר רשום
// אצל X". התוצאה: יולדת נשארה בלי כרטיס למרות שהמשפחה קיימת ויש מלאי.
//
// דרכון/מסמך זר אינו ת"ז ישראלית ואין לרפד אותו באפסים — הוא מושווה כמות
// שהוא (ללא רווחים/מקפים), אחרת "AB123456" היה נחתך ל-"000123456" ועלול
// להתאים בטעות לת"ז אמיתית.
// ─────────────────────────────────────────────────────────────────────────────
export function normalizeZeout(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (/[^\d\s-]/.test(s)) return s.replace(/[\s-]/g, '').toUpperCase()
  const d = s.replace(/\D/g, '')
  return d ? d.padStart(9, '0') : ''
}

// חיפוש משפחה בנדרים לפי ת.ז. → מחזיר ClientId אם קיימת, אחרת null
export async function findClientByZeout(creds: NedarimCreds, zeout: string): Promise<string | null> {
  const want = normalizeZeout(zeout)
  if (!want) return null
  const { families } = await getClientsTable(creds)
  // ⚠️ לא רק שדה Zeout: בנדרים ת"ז בן/בת הזוג יושבת בשדה נפרד, ומשפחה
  // שהוקמה על שם הבעל לא נמצאה כשחיפשנו לפי ת"ז האשה (ולהפך).
  const match = families.find(row =>
    Object.entries(row).some(([k, v]) => /zeout|tz\b|teudat/i.test(k) && normalizeZeout(v) === want),
  )
  return match ? String(match.ClientId) : null
}

// הקמת/עדכון משפחה בנדרים → מחזיר ClientId (מגיע ב-Message בהצלחה)
export async function saveClientCard(
  creds: NedarimCreds,
  b: NedarimClientFields,
  clientId?: string | null,
  groupe: string = 'לידות',
): Promise<string | null> {
  // 🔴 דרכון → מזהה ג', ולא Zeout.
  //
  // נדרים אוכף על Zeout ת"ז ישראלית בספרות בלבד, ודוחה דרכון בשגיאה
  // "מספר זהות שגוי. נא לרשום מספר בספרות בלבד" — כלומר הכרטיס כלל לא הוקם,
  // והיולדת נשארה בלי כרטיס מזון בלי שאיש שם לב עד שהתלוננה.
  //
  // ⚠️ המספר עדיין נשלח, רק בשדה אחר. השמטתו הייתה מקימה משפחה בלי מזהה
  // כלל, וכל חיפוש עתידי לפי דרכון היה נכשל ומקים אותה שוב.
  const passport = isPassportId(b)
  const idValue = String(b.id_number ?? '').trim() || undefined

  const r = await nedarimRequest(creds, 'SaveClientCard', {
    ClientId: clientId ?? undefined,
    FamilyName: b.family_name || b.full_name || '',
    FirstName: b.full_name || '',
    Zeout: passport ? undefined : idValue,
    // מזהה ג' — השדה שנדרים מקצה למסמך שאינו ת"ז ישראלית.
    Zeout3: passport ? idValue : undefined,
    Address: [b.address, b.city].filter(Boolean).join(', ') || undefined,
    Phone1: b.phone ?? undefined,
    Phone2: b.phone2 ?? undefined,
    Email: b.email ?? undefined,
    Groupe: groupe || undefined, // קטגוריה בנדרים — ברירת מחדל "לידות"
    Comments: 'נוצר/עודכן אוטומטית ממערכת היכל החתם סופר',
  })
  if (!isOk(r)) throw new Error(r.Message || 'כשל בהקמת/עדכון משפחה בנדרים')
  // 🔴 המטמון של טבלת הלקוחות מתיישן ברגע זה — משפחה שהוקמה כעת חייבת
  // להימצא בחיפוש הבא. בלי הניקוי הזה חיפוש בתוך חלון המטמון היה מחזיר
  // null על משפחה שקיימת, והמערכת הייתה מנסה להקים אותה שוב ונדחית
  // ב"מספר זהות זה כבר רשום".
  invalidateClientsTable(creds)
  const id = String(r.Message ?? '').trim()
  return id || clientId || null
}

// מחיקת משפחה
export async function deleteClient(creds: NedarimCreds, clientId: string) {
  const r = await nedarimRequest(creds, 'SaveClientCard', { ClientId: clientId, Deleted: '1' })
  // ⚠️ כמו בהקמה — משפחה שנמחקה אסור שתמשיך להופיע בחיפוש מהמטמון.
  if (isOk(r)) invalidateClientsTable(creds)
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
