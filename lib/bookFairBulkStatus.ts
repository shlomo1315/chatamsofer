import type { BookFairOrderStatus } from '@/types/bookFair'

// ─────────────────────────────────────────────────────────────────────────────
// עדכון סטטוסים מאקסל (10.10) — הלוגיקה הטהורה: זיהוי עמודות, פענוח סטטוס,
// ותכנון השינוי שורה-שורה. בלי מסד, ולכן נבדק בטסטים.
//
// 🔴 מעבר חופשי רק בתוך שלבי הטיפול (שולם → בליקוט → נארז → נשלח → נמסר).
// במסך ההזמנה המעבר הוא צעד-צעד; בקובץ משלוחן הגיוני לקפוץ מ"בליקוט" ל"נשלח".
//
// ⚠️ ביטול וזיכוי אינם כאן בכוונה: זיכוי מחזיר כסף ומלאי ועובר רק בנתיב
// הזיכוי, וביטול של הזמנה ששולמה בלי זיכוי משאיר כסף אצלנו בלי הזמנה.
//
// ⚠️ "נמסר" אינו נפתח מכאן: בהזמנת משלוח זו עובדה, ובאיסוף עצמי הביטול
// מנקה את פרטי המסירה — שניהם בכרטיס ההזמנה בלבד.
// ─────────────────────────────────────────────────────────────────────────────

export const BULK_STATUSES: BookFairOrderStatus[] = ['paid', 'picking', 'packed', 'shipped', 'delivered']

// ניסוחים חופשיים → סטטוס. ⚠️ אחרי נרמול (ראו norm): בלי ניקוד, גרשיים ורווחים כפולים.
const SYNONYMS: Record<string, BookFairOrderStatus> = {
  'שולם': 'paid', 'שולמה': 'paid', 'paid': 'paid', 'ממתין לטיפול': 'paid', 'בטיפול': 'paid',
  'בליקוט': 'picking', 'ליקוט': 'picking', 'בלקוט': 'picking', 'לקוט': 'picking', 'picking': 'picking', 'בהכנה': 'picking',
  'נארז': 'packed', 'נארזה': 'packed', 'ארוז': 'packed', 'ארוזה': 'packed', 'אריזה': 'packed', 'packed': 'packed',
  'נשלח': 'shipped', 'נשלחה': 'shipped', 'יצא': 'shipped', 'יצאה': 'shipped', 'יצא למשלוח': 'shipped',
  'במשלוח': 'shipped', 'נמסר לשליח': 'shipped', 'נמסרה לשליח': 'shipped', 'בדרך': 'shipped', 'shipped': 'shipped', 'sent': 'shipped',
  'נמסר': 'delivered', 'נמסרה': 'delivered', 'הגיע': 'delivered', 'הגיעה': 'delivered', 'סופק': 'delivered',
  'סופקה': 'delivered', 'התקבל': 'delivered', 'התקבלה': 'delivered', 'נאסף': 'delivered', 'נאספה': 'delivered', 'delivered': 'delivered',
  // מזוהים כדי לתת שגיאה ברורה ולא "סטטוס לא מוכר":
  'בוטל': 'cancelled', 'בוטלה': 'cancelled', 'ביטול': 'cancelled', 'cancelled': 'cancelled', 'canceled': 'cancelled',
  'זוכה': 'refunded', 'זוכתה': 'refunded', 'זיכוי': 'refunded', 'refunded': 'refunded',
  'זוכה חלקית': 'partially_refunded',
}

function norm(v: unknown): string {
  return String(v ?? '')
    .replace(/[֑-ׇ]/g, '')            // ניקוד וטעמים
    .replace(/[‎‏‪-‮⁦-⁩]/g, '') // תווי כיווניות
    .replace(/["'״׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** סטטוס מתוך תא חופשי, או null אם לא זוהה. */
export function parseStatus(raw: unknown): BookFairOrderStatus | null {
  const s = norm(raw)
  if (!s) return null
  if (SYNONYMS[s]) return SYNONYMS[s]
  // מפתח באנגלית כפי שהוא במסד (payment_mismatch וכו')
  if (/^[a-z_]+$/.test(s)) return null
  return null
}

/** מספר הזמנה מתא — מספר (121213 / 121213.0) או טקסט. */
export function normOrderNumber(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.round(v))
  return String(v ?? '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .trim()
    .replace(/^#\s*/, '')
}

/**
 * העמודות שזוהו. ‎-1 = אין עמודה כזו בקובץ.
 * ⚠️ סטטוס *או* כתובת חייבים להיות — קובץ של מספרי הזמנה בלבד אינו משנה דבר.
 */
export type DetectedColumns = {
  orderCol: number
  statusCol: number
  addressCol: number
  cityCol: number
  headerRow: boolean
}

const ADDRESS_HEADER = /כתובת|רחוב|address|street/i
const CITY_HEADER = /^(עיר|ישוב|יישוב|city)$/i

/**
 * איזו עמודה היא מה.
 *
 * ⚠️ הזמנה וסטטוס — לפי *התוכן* ולא לפי הכותרת: לכל משלוחן כותרות אחרות
 * ("מס' משלוח", "Status", "מצב"). עמודת ההזמנה = הכי הרבה מספרי הזמנה
 * קיימים; עמודת הסטטוס = הכי הרבה ערכים שמתפענחים כסטטוס.
 * ⚠️ כתובת ועיר — לפי הכותרת בלבד: אין דרך אמינה לזהות כתובת לפי תוכן,
 * וטעות כאן הייתה דורסת כתובות. בלי כותרת מתאימה — בוחרים במסך.
 */
export function detectColumns(rows: unknown[][], known: Set<string>): DetectedColumns | null {
  const width = Math.max(0, ...rows.map(r => r.length))
  let orderCol = -1, best = 0
  for (let c = 0; c < width; c++) {
    const n = rows.filter(r => known.has(normOrderNumber(r[c]))).length
    if (n > best) { best = n; orderCol = c }
  }
  if (orderCol < 0) return null

  let statusCol = -1
  best = 0
  for (let c = 0; c < width; c++) {
    if (c === orderCol) continue
    const n = rows.filter(r => parseStatus(r[c]) !== null).length
    if (n > best) { best = n; statusCol = c }
  }

  const header = (rows[0] ?? []).map(v => norm(v))
  const free = (c: number) => c !== orderCol && c !== statusCol
  const addressCol = header.findIndex((h, c) => free(c) && ADDRESS_HEADER.test(h))
  const cityCol = header.findIndex((h, c) => free(c) && c !== addressCol && CITY_HEADER.test(h))

  if (statusCol < 0 && addressCol < 0) return null
  return { orderCol, statusCol, addressCol, cityCol, headerRow: isHeader(rows[0], orderCol, statusCol, known) }
}

/** שורה ראשונה שאין בה מספר הזמנה קיים (וגם לא סטטוס) = כותרת. */
export function isHeader(row: unknown[] | undefined, orderCol: number, statusCol: number, known: Set<string>): boolean {
  if (!row) return false
  return !known.has(normOrderNumber(row[orderCol])) && (statusCol < 0 || parseStatus(row[statusCol]) === null)
}

export type OrderInfo = {
  status: BookFairOrderStatus
  delivery_method?: string | null
  address_text?: string | null
  city_id?: string | null
}

export type CityRef = { id: string; name: string }

export type PlanRow = {
  /** מספר השורה באקסל (1-based), כדי שאפשר יהיה למצוא אותה בקובץ. */
  line: number
  orderNumber: string
  rawStatus: string
  current: BookFairOrderStatus | null
  /** null = אין שינוי סטטוס בשורה הזו. */
  target: BookFairOrderStatus | null
  /** כתובת חדשה — רק כשהיא שונה מהקיימת. */
  address?: string
  oldAddress?: string | null
  city?: CityRef
  kind: 'change' | 'same' | 'error'
  error?: string
}

const LABEL: Record<string, string> = {
  pending_payment: 'ממתין לתשלום', payment_mismatch: 'אי-התאמה בסכום', paid: 'שולם',
  picking: 'בליקוט', packed: 'נארז', shipped: 'נשלח', delivered: 'נמסר',
  failed: 'תשלום נכשל', cancelled: 'בוטל', refunded: 'זוכה', partially_refunded: 'זוכה חלקית',
}

/** בדיקת שורה אחת — משמש גם בתצוגה המקדימה וגם שוב רגע לפני הביצוע. */
export function checkTransition(current: BookFairOrderStatus, target: BookFairOrderStatus): string | null {
  if (target === 'cancelled') return 'ביטול — רק מכרטיס ההזמנה'
  if (target === 'refunded' || target === 'partially_refunded') return 'זיכוי — רק דרך פעולת הזיכוי (מחזירה את הכסף)'
  if (!BULK_STATUSES.includes(target)) return `לא ניתן לסמן "${LABEL[target] ?? target}" מקובץ`
  if (!BULK_STATUSES.includes(current)) return `ההזמנה במצב "${LABEL[current] ?? current}" — לא ניתן לשנות מקובץ`
  if (current === 'delivered' && target !== 'delivered') return 'ההזמנה כבר נמסרה — ביטול מסירה רק מכרטיס ההזמנה'
  return null
}

/**
 * בדיקת עדכון כתובת — אותם כללים כמו בכרטיס ההזמנה.
 * ⚠️ רק הזמנת משלוח: לאיסוף עצמי אין כתובת, וההמרה למשלוח היא פעולה
 * נפרדת בכרטיס (היא דורשת גם עיר).
 */
export function checkAddress(order: OrderInfo, address: string): string | null {
  if (order.delivery_method !== 'shipping') return 'הזמנה לאיסוף עצמי — אין כתובת לעדכן'
  if (!BULK_STATUSES.includes(order.status)) return `ההזמנה במצב "${LABEL[order.status] ?? order.status}" — לא מעדכנים כתובת`
  if (address.length < 5) return 'כתובת קצרה מדי'
  if (address.length > 300) return 'כתובת ארוכה מדי'
  return null
}

export function normCity(v: unknown): string {
  return norm(v).replace(/-/g, ' ')
}

export function planRows(
  rows: unknown[][],
  cols: DetectedColumns,
  orders: Map<string, OrderInfo>,
  cities: Map<string, CityRef> = new Map(),
): PlanRow[] {
  const out: PlanRow[] = []
  const seen = new Map<string, number>()
  const cell = (r: unknown[], c: number) => (c < 0 ? '' : String(r[c] ?? '').replace(/\s+/g, ' ').trim())

  rows.forEach((r, i) => {
    if (i === 0 && cols.headerRow) return
    const orderNumber = normOrderNumber(r[cols.orderCol])
    const rawStatus = cell(r, cols.statusCol)
    const rawAddress = cell(r, cols.addressCol)
    const rawCity = cell(r, cols.cityCol)
    if (!orderNumber && !rawStatus && !rawAddress) return  // שורה ריקה

    const line = i + 1
    const base: PlanRow = { line, orderNumber, rawStatus, current: null, target: null, kind: 'error' }
    const order = orders.get(orderNumber)

    if (!orderNumber) { out.push({ ...base, error: 'חסר מספר הזמנה' }); return }
    if (!order) { out.push({ ...base, error: 'מספר הזמנה לא קיים במערכת' }); return }
    const row: PlanRow = { ...base, current: order.status }
    if (!rawStatus && !rawAddress) { out.push({ ...row, error: 'אין בשורה סטטוס או כתובת' }); return }

    const dup = seen.get(orderNumber)
    if (dup !== undefined) { out.push({ ...row, error: `ההזמנה מופיעה כבר בשורה ${dup}` }); return }
    seen.set(orderNumber, line)

    // ── סטטוס ──
    if (rawStatus) {
      const target = parseStatus(rawStatus)
      if (!target) { out.push({ ...row, error: `סטטוס לא מוכר: "${rawStatus}"` }); return }
      if (target !== order.status) {
        const err = checkTransition(order.status, target)
        if (err) { out.push({ ...row, target, error: err }); return }
        row.target = target
      }
    }

    // ── כתובת ועיר ──
    if (rawAddress) {
      const err = checkAddress(order, rawAddress)
      if (err) { out.push({ ...row, error: err }); return }
      let city: CityRef | undefined
      if (rawCity) {
        city = cities.get(normCity(rawCity))
        if (!city) { out.push({ ...row, error: `עיר לא מוכרת: "${rawCity}"` }); return }
      }
      const sameAddr = rawAddress === (order.address_text ?? '').replace(/\s+/g, ' ').trim()
      const sameCity = !city || city.id === order.city_id
      if (!sameAddr || !sameCity) {
        row.address = rawAddress
        row.oldAddress = order.address_text ?? null
        if (city && !sameCity) row.city = city
      }
    }

    out.push({ ...row, kind: row.target || row.address ? 'change' : 'same' })
  })
  return out
}
