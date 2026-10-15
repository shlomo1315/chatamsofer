import { normalizeEmail } from '@/lib/gilyonot'
import { normalizePhone } from '@/lib/phone'

// ─────────────────────────────────────────────────────────────────────────────
// גיליונות החתם סופר — מערך המפיצים: כללים טהורים (בלי מסד), כדי שהמסך,
// ממשק המפיץ ובהמשך ימות המשיח יעבדו לפי אותם כללים. מיגרציה: 20261018_gilyonot_distributors.sql
// ─────────────────────────────────────────────────────────────────────────────

// ── איך מפיץ מזדהה בממשק שלו ──
// ⚠️ שינוי אחד כאן מחליף את שיטת הזיהוי בכל המערכת (טופס הכניסה, החיפוש והבדיקות).
// הקוד החד-פעמי נשלח תמיד למייל של המפיץ, ואם אין לו מייל — בשיחה לטלפון.
export type LoginBy = 'phone' | 'email' | 'id_number'
export const DISTRIBUTOR_LOGIN_BY: LoginBy = 'phone'

export const LOGIN_LABELS: Record<LoginBy, { label: string; placeholder: string; inputMode: 'tel' | 'email' | 'numeric' }> = {
  phone: { label: 'מספר טלפון', placeholder: 'המספר שמסרתם למשרד', inputMode: 'tel' },
  email: { label: 'כתובת מייל', placeholder: 'המייל שמסרתם למשרד', inputMode: 'email' },
  id_number: { label: 'מספר תעודת זהות', placeholder: '9 ספרות', inputMode: 'numeric' },
}

export type DistributorStatus = 'active' | 'removed'
export type DistributorSource = 'manual' | 'import' | 'nedarim' | 'phone'
export type EventKind = 'issue' | 'received' | 'increase' | 'decrease' | 'note' | 'address' | 'leave' | 'join' | 'admin_edit' | 'hilula'
export type EventChannel = 'web' | 'phone' | 'admin' | 'nedarim'
export type EventStatus = 'open' | 'done' | 'rejected'

export const EVENT_LABELS: Record<EventKind, string> = {
  issue: 'דיווח על תקלה',
  received: 'דיווח קבלה',
  increase: 'בקשת תוספת',
  decrease: 'בקשת הפחתה',
  note: 'הערה',
  address: 'עדכון כתובת',
  leave: 'התנתקות מהמערך',
  join: 'הצטרפות',
  admin_edit: 'עדכון במשרד',
  hilula: 'סעודת ההילולא',
}
export const CHANNEL_LABELS: Record<EventChannel, string> = { web: 'אתר', phone: 'טלפון', admin: 'משרד', nedarim: 'נדרים פלוס' }
export const SOURCE_LABELS: Record<DistributorSource, string> = { manual: 'ידני', import: 'ייבוא', nedarim: 'נדרים פלוס', phone: 'טלפון' }

// פעולות שהמפיץ עצמו רשאי לבצע (מהאתר, ובהמשך מהטלפון)
export const DISTRIBUTOR_ACTIONS = ['issue', 'received', 'increase', 'decrease', 'note', 'address', 'leave'] as const
export type DistributorAction = typeof DISTRIBUTOR_ACTIONS[number]

export const MAX_QUANTITY = 100_000
export const MAX_IMPORT_DISTRIBUTORS = 5_000
export const MAX_ROUTE = 9_999

export interface DistributorFields {
  full_name: string
  phone: string | null
  phone2: string | null
  email: string | null
  id_number: string | null
  city: string | null
  address: string | null
  synagogue: string | null
  quantity: number
  /** מספר העצירה של השליח בתוך העיר (מקובץ המסלולים). המסלול = העיר, ממוינת לפי המספר. */
  route: number | null
  notes: string | null
}

/** טקסט חופשי: בלי תווי בקרה, רווחים מכווצים, אורך מוגבל. ריק → null. */
export function cleanText(v: unknown, max = 200): string | null {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  return s || null
}

/** הערה רב-שורתית (שומרת ירידות שורה). */
export function cleanNote(v: unknown, max = 2000): string | null {
  const s = String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
  return s || null
}

/** טלפון ישראלי תקין (9–10 ספרות שמתחילות ב-0), או null. */
export function cleanPhone(v: unknown): string | null {
  const p = normalizePhone(String(v ?? ''))
  const d = p.length === 9 && !p.startsWith('0') ? `0${p}` : p
  return /^0\d{8,9}$/.test(d) ? d : null
}

/** ת.ז. ישראלית: ספרות בלבד, מרופדת ל-9, עם ספרת ביקורת תקינה. */
export function cleanIdNumber(v: unknown): string | null {
  const digits = String(v ?? '').replace(/\D/g, '')
  if (!digits || digits.length > 9) return null
  const id = digits.padStart(9, '0')
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let n = Number(id[i]) * ((i % 2) + 1)
    if (n > 9) n -= 9
    sum += n
  }
  return sum % 10 === 0 && id !== '000000000' ? id : null
}

// כתיבים שונים של אותה עיר → שם אחד, כדי שהסינון, הסיכום והמסלולים לא יתפצלו.
// המפתח: בלי רווחים, גרשיים ומקפים. עיר שלא ברשימה נשמרת כפי שנכתבה (מנוקה).
const CITY_ALIASES: [string, string[]][] = [
  ['ירושלים', ['ירושלים', 'ירושלם', 'ירושליים']],
  ['בני ברק', ['בניברק', 'בנינרק', 'בניבג', 'בניברך']],
  ['ביתר עילית', ['ביתר', 'ביתרעילית', 'ביתרעלית']],
  ['מודיעין עילית', ['מודיעיןעילית', 'מודיעיןעלית', 'קריתספר', 'קרייתספר']],
  ['בית שמש', ['ביתשמש']],
  ['אלעד', ['אלעד']],
  ['אשדוד', ['אשדוד']],
  ['קרית גת', ['קריתגת', 'קרייתגת']],
  ['גבעת זאב', ['גבעתזאב']],
]
const cityKey = (s: string) => s.replace(/["'`׳״\s\-–]/g, '')
const CITY_BY_KEY = new Map(CITY_ALIASES.flatMap(([city, keys]) => [city, ...keys].map(k => [cityKey(k), city] as const)))

/** פיצול "ירושלים -קטמון" לעיר ולשכונה. */
export function splitCityArea(v: unknown): { city: string | null; area: string | null } {
  const raw = cleanText(String(v ?? '').replace(/^["'\s]+|["'\s]+$/g, ''), 60)
  if (!raw) return { city: null, area: null }
  const known = CITY_BY_KEY.get(cityKey(raw))
  if (known) return { city: known, area: null }
  const m = raw.match(/^(.+?)\s*(?:\s-|-\s|,|–)\s*(.+)$/)
  const head = m ? CITY_BY_KEY.get(cityKey(m[1])) : undefined
  if (head && m) return { city: head, area: cleanText(m[2], 60) }
  return { city: raw, area: null }
}

/** עיר כמפתח לסיכום ולסינון: כתיב אחיד לערים המוכרות, רווחים מכווצים, בלי גרשיים בקצוות. */
export function cleanCity(v: unknown): string | null {
  return splitCityArea(v).city
}

/** מספר מסלול: שלם חיובי, ריק → null, אחר → undefined (לא תקין). */
export function cleanRoute(v: unknown): number | null | undefined {
  const s = String(v ?? '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isInteger(n) && n > 0 && n <= MAX_ROUTE ? n : undefined
}

export function cleanQuantity(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return 0
  const n = Number(String(v).replace(/[,\s]/g, ''))
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_QUANTITY) return null
  return n
}

/** מנרמל את המזהה שהוקלד בטופס הכניסה לפי שיטת הזיהוי. */
export function normalizeLoginId(by: LoginBy, raw: unknown): string | null {
  if (by === 'phone') return cleanPhone(raw)
  if (by === 'email') return normalizeEmail(raw)
  return cleanIdNumber(raw)
}

/**
 * בדיקת שדות מפיץ (הוספה ידנית, עריכה וייבוא). שדה שהוזן ואינו תקין = שגיאה,
 * ולא נשמר בשקט כריק — כך לא נעלם טלפון בגלל ספרה חסרה.
 */
export function validateDistributor(input: Record<string, unknown>): { ok: true; value: DistributorFields } | { ok: false; error: string } {
  const full_name = cleanText(input.full_name, 80)
  if (!full_name) return { ok: false, error: 'חסר שם' }
  const has = (k: string) => String(input[k] ?? '').trim() !== ''
  const phone = cleanPhone(input.phone)
  if (has('phone') && !phone) return { ok: false, error: 'מספר טלפון לא תקין' }
  const phone2 = cleanPhone(input.phone2)
  if (has('phone2') && !phone2) return { ok: false, error: 'מספר טלפון נוסף לא תקין' }
  const email = normalizeEmail(input.email)
  if (has('email') && !email) return { ok: false, error: 'כתובת מייל לא תקינה' }
  const id_number = cleanIdNumber(input.id_number)
  if (has('id_number') && !id_number) return { ok: false, error: 'מספר ת.ז. לא תקין' }
  const quantity = cleanQuantity(input.quantity)
  if (quantity === null) return { ok: false, error: 'כמות הגיליונות צריכה להיות מספר שלם' }
  const route = cleanRoute(input.route)
  if (route === undefined) return { ok: false, error: 'מספר המסלול צריך להיות מספר שלם חיובי' }
  return {
    ok: true,
    value: {
      full_name, phone, phone2, email, id_number, quantity, route,
      city: cleanCity(input.city),
      address: cleanText(input.address, 160),
      synagogue: cleanText(input.synagogue, 120),
      notes: cleanNote(input.notes, 1000),
    },
  }
}

// ── ייבוא רשימת מפיצים מ-Excel/CSV ──
// השורה הראשונה חייבת להיות שורת כותרות. העמודות מזוהות לפי השם, בכל סדר.

type ImportField = keyof DistributorFields
const HEADER_ALIASES: [ImportField, string[]][] = [
  ['phone2', ['טלפון2', 'טלפוןנוסף', 'נייד2', 'טלנוסף', 'phone2']],
  ['full_name', ['שם', 'שםמלא', 'שםהמפיץ', 'מפיץ', 'name', 'fullname', 'שםומשפחה']],
  ['phone', ['טלפון', 'נייד', 'פלאפון', 'טל', 'פל', 'phone', 'mobile', 'מספרטלפון']],
  ['email', ['מייל', 'אימייל', 'דואל', 'דואראלקטרוני', 'email', 'mail']],
  ['id_number', ['תז', 'תעודתזהות', 'מספרזהות', 'id']],
  ['city', ['עיר', 'ישוב', 'יישוב', 'city', 'מקום']],
  ['address', ['כתובת', 'רחוב', 'address', 'כתובתלמשלוח']],
  ['synagogue', ['ביתכנסת', 'ביתהכנסת', 'ביכנ', 'בהכנס', 'ביהכנ', 'ביהכנס', 'ביתמדרש', 'synagogue']],
  ['quantity', ['כמות', 'גיליונות', 'גליונות', 'כמותגיליונות', 'כמותגליונות', 'מסגיליונות', 'מספרגיליונות', 'quantity', 'qty']],
  ['route', ['מסלול', 'מסמסלול', 'מספרמסלול', 'route']],
  ['notes', ['הערות', 'הערה', 'notes']],
]

const headerKey = (s: string) => s.toLowerCase().replace(/["'`׳״.\s_\-()]/g, '')

/** מזהה את שדה העמודה לפי הכותרת, או null אם לא מוכרת. */
export function detectHeader(cell: string): ImportField | null {
  const k = headerKey(cell)
  if (!k) return null
  for (const [field, aliases] of HEADER_ALIASES) if (aliases.some(a => headerKey(a) === k)) return field
  // התאמה חלקית ("מספר טלפון נייד", "כמות גיליונות שבועית"), לפי סדר העדיפות שלמעלה
  for (const [field, aliases] of HEADER_ALIASES) if (aliases.some(a => headerKey(a).length >= 3 && k.includes(headerKey(a)))) return field
  return null
}

/** פענוח CSV פשוט: מפריד פסיק, נקודה-פסיק או טאב, ותמיכה במרכאות כפולות. */
export function parseCsv(text: string): string[][] {
  const first = text.split('\n', 1)[0] ?? ''
  const sep = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',')
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

export interface ImportResult {
  rows: DistributorFields[]
  invalid: { line: number; error: string }[]
  columns: ImportField[]
  error?: string
}

/** טבלה (שורת כותרות + נתונים) → מפיצים תקינים ושורות פסולות עם הסיבה. */
export function parseDistributorTable(table: string[][]): ImportResult {
  if (!table.length) return { rows: [], invalid: [], columns: [], error: 'הקובץ ריק' }
  const map = table[0].map(c => detectHeader(String(c ?? '')))
  const seen = new Set<ImportField>()
  const cols = map.map(f => (f && !seen.has(f) ? (seen.add(f), f) : null))
  if (!cols.includes('full_name')) {
    return { rows: [], invalid: [], columns: [], error: 'לא נמצאה עמודת "שם" בשורה הראשונה. השורה הראשונה בקובץ צריכה להיות שורת כותרות (שם, טלפון, עיר, כתובת, בית כנסת, כמות...).' }
  }
  const rows: DistributorFields[] = []
  const invalid: ImportResult['invalid'] = []
  table.slice(1).forEach((cells, i) => {
    const rec: Record<string, unknown> = {}
    cols.forEach((f, c) => { if (f) rec[f] = cells[c] ?? '' })
    const res = validateDistributor(rec)
    if (res.ok) rows.push(res.value)
    else invalid.push({ line: i + 2, error: res.error })
  })
  return { rows, invalid, columns: [...seen] }
}

// ── סיכום: כמה גיליונות בכל עיר ──
export interface CitySummary { city: string; distributors: number; quantity: number }
export const NO_CITY = 'ללא עיר'

export function summarizeByCity(list: { city: string | null; quantity: number; status: DistributorStatus }[]): CitySummary[] {
  const by = new Map<string, CitySummary>()
  for (const d of list) {
    if (d.status !== 'active') continue
    const city = d.city || NO_CITY
    const s = by.get(city) ?? { city, distributors: 0, quantity: 0 }
    s.distributors++
    s.quantity += d.quantity
    by.set(city, s)
  }
  return [...by.values()].sort((a, b) => b.quantity - a.quantity || a.city.localeCompare(b.city, 'he'))
}

// ── שעות נציג אנושי (לשלוחה בימות המשיח) ──
export interface AgentWindow { day: number; from: string; to: string }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function normalizeAgentHours(v: unknown): AgentWindow[] | null {
  if (!Array.isArray(v) || v.length > 50) return null
  const out: AgentWindow[] = []
  for (const w of v) {
    const day = Number((w as AgentWindow)?.day)
    const from = String((w as AgentWindow)?.from ?? '')
    const to = String((w as AgentWindow)?.to ?? '')
    if (!Number.isInteger(day) || day < 0 || day > 6 || !HHMM.test(from) || !HHMM.test(to) || from >= to) return null
    out.push({ day, from, to })
  }
  return out.sort((a, b) => a.day - b.day || a.from.localeCompare(b.from))
}

/** יום (0=ראשון) ושעה "HH:MM" לפי שעון ישראל. */
export function israelClock(at: Date): { day: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return { day, time: `${get('hour')}:${get('minute')}` }
}

/** האם יש עכשיו נציג אנושי זמין, לפי חלונות השעות שהוגדרו. */
export function isAgentAvailable(hours: AgentWindow[], at: Date = new Date()): boolean {
  const { day, time } = israelClock(at)
  return hours.some(w => w.day === day && time >= w.from && time < w.to)
}

// ── פעולות המפיץ: מה כל פעולה שומרת ומה היא משנה ──
// אותה פונקציה תשמש גם את ימות המשיח (channel='phone'), כדי שהכללים יהיו אחד.
export interface DistributorSnapshot { id: string; quantity: number; city: string | null; address: string | null; status: DistributorStatus }
export interface ActionPlan {
  event: { kind: EventKind; quantity: number | null; details: string | null; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; status: EventStatus }
  /** עדכון מיידי לשורת המפיץ (כתובת, התנתקות). שינוי כמות מחכה לאישור המשרד. */
  update: Record<string, unknown> | null
  notifyCourier: boolean
  message: string
}

export function planDistributorAction(d: DistributorSnapshot, action: unknown, input: Record<string, unknown>): { ok: true; plan: ActionPlan } | { ok: false; error: string } {
  if (!DISTRIBUTOR_ACTIONS.includes(action as DistributorAction)) return { ok: false, error: 'פעולה לא מוכרת' }
  if (d.status !== 'active') return { ok: false, error: 'המפיץ כבר אינו פעיל במערך' }
  const kind = action as DistributorAction
  const details = cleanNote(input.details, 1000)
  const ev = (o: Partial<ActionPlan['event']>): ActionPlan['event'] =>
    ({ kind, quantity: null, details, old_value: null, new_value: null, status: 'open', ...o })

  switch (kind) {
    case 'issue':
    case 'note':
      if (!details) return { ok: false, error: kind === 'issue' ? 'נא לתאר את התקלה' : 'נא לכתוב את ההערה' }
      return { ok: true, plan: { event: ev({}), update: null, notifyCourier: false, message: 'הפנייה התקבלה. המשרד יטפל בה בהקדם.' } }
    case 'received': {
      const q = String(input.quantity ?? '').trim() === '' ? null : cleanQuantity(input.quantity)
      if (q === null) return { ok: false, error: 'נא להזין כמה גיליונות התקבלו' }
      // כמות שונה מהמצופה = חוסר או עודף, ולכן נשאר פתוח לטיפול המשרד
      const match = q === d.quantity
      return { ok: true, plan: {
        event: ev({ quantity: q, old_value: { quantity: d.quantity }, status: match ? 'done' : 'open' }),
        update: null, notifyCourier: false,
        message: match ? 'תודה! הקבלה נרשמה.' : 'תודה! הקבלה נרשמה, והמשרד יבדוק את ההפרש.',
      } }
    }
    case 'increase':
    case 'decrease': {
      const q = String(input.quantity ?? '').trim() === '' ? null : cleanQuantity(input.quantity)
      if (q === null) return { ok: false, error: 'נא להזין את הכמות החדשה המבוקשת' }
      if (kind === 'increase' && q <= d.quantity) return { ok: false, error: `בתוספת, הכמות החדשה צריכה להיות יותר מ-${d.quantity}` }
      if (kind === 'decrease' && q >= d.quantity) return { ok: false, error: `בהפחתה, הכמות החדשה צריכה להיות פחות מ-${d.quantity}` }
      return { ok: true, plan: {
        event: ev({ quantity: q, old_value: { quantity: d.quantity }, new_value: { quantity: q } }),
        update: null, notifyCourier: false, message: 'הבקשה התקבלה. הכמות תתעדכן אחרי אישור המשרד.',
      } }
    }
    case 'address': {
      const address = cleanText(input.address, 200)
      if (!address) return { ok: false, error: 'נא להזין את הכתובת החדשה' }
      const hasCity = String(input.city ?? '').trim() !== ''
      const city = hasCity ? cleanCity(input.city) : d.city
      return { ok: true, plan: {
        event: ev({ old_value: { address: d.address, city: d.city }, new_value: { address, city }, status: 'done' }),
        update: { address, city }, notifyCourier: true, message: 'הכתובת עודכנה, והשליח קיבל הודעה.',
      } }
    }
    case 'leave':
      return { ok: true, plan: {
        event: ev({ old_value: { quantity: d.quantity }, status: 'done' }),
        update: { status: 'removed', removed_reason: details ? `המפיץ התנתק: ${details}` : 'המפיץ התנתק', removed_at: 'now' },
        notifyCourier: true, message: 'ההתנתקות נרשמה. תודה רבה על כל ההפצה!',
      } }
  }
}
