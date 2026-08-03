// ─────────────────────────────────────────────────────────────────────────────
// התאמת מלאי כרטיסי המזון — "הכנסתי 300, אישרתי 48, למה נשארו 247?"
//
// המלאי הוא סכום יומן התנועות, ולכן הוא תמיד נכון חשבונאית — אבל לא תמיד ניתן
// להסבר: כל אישור לידה מנכה כרטיס, וניכוי אינו מתבטל מעצמו כשהבקשה חוזרת
// להמתנה, נדחית, או שההטענה נכשלה. אז נשאר במערכת כרטיס ש"מוחזק" בידי תיק
// שאינו זכאי לו, המלאי נראה קטן מהצפוי, ואין דרך לדעת אצל מי הוא נתקע.
//
// כאן מחושב ההסבר: לכל תיק שנוכה עבורו כרטיס נבדק מה מצבו *עכשיו*, וכל כרטיס
// שאינו מגובה בלידה מאושרת מסומן כ"תלוי" — עם שם המשפחה והסיבה, כדי שאפשר
// יהיה להחזיר אותו למלאי בלחיצה אחת במקום לחפש בגיליון.
//
// ⚠️ פונקציה טהורה בכוונה — כל השליפות נעשות בנקודת-הקצה. כך ההיגיון נבדק
// בטסטים על מקרים אמיתיים (דחייה, כשל הטענה, ניכוי כפול) ולא רק על הפרודקשן.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconLedgerRow {
  delta: number
  reason: string | null
  aid_id?: string | null
}

export interface ReconAid {
  id: string
  /** סטטוס הלידה: active=מאושר · pending=ממתין · cancelled=לא מאושר · deep_review=בדיקה מעמיקה */
  status?: string | null
  card_load_status?: string | null
  name?: string | null
}

export interface StrayCard {
  aidId: string
  name: string
  /** כמה כרטיסים ניתן להחזיר למלאי בגין התיק הזה */
  cards: number
  /** סטטוס הלידה בעברית — כדי שהשורה תהיה מובנת בלי לפתוח את התיק */
  statusLabel: string
  /** ההסבר: למה הכרטיס הזה נוכה ואינו מגובה */
  reason: string
}

export interface ReasonLine {
  reason: string
  count: number
  total: number
}

export interface StockRecon {
  balance: number
  totalIn: number
  totalOut: number
  byReason: ReasonLine[]
  /** כרטיסים שנוכו ומגובים בלידה מאושרת */
  heldOk: number
  /** כרטיסים שנוכו ואינם מגובים — הפער שהמנהל רואה */
  strayCards: number
  /** המלאי שהיה אמור להיות אלמלא הכרטיסים התלויים */
  expectedBalance: number
  strays: StrayCard[]
}

const STATUS_LABEL: Record<string, string> = {
  active: 'מאושר',
  pending: 'ממתין לאישור',
  cancelled: 'לא מאושר',
  deep_review: 'בדיקה מעמיקה',
}

// תנועות שמייצגות ניכוי בגין לידה (ולא הורדה ידנית/התאמה)
const BIRTH_REASONS = new Set(['birth_approval', 'auto_assign'])

/**
 * האם הכרטיס שנוכה עבור התיק מגובה במצב הנוכחי?
 *
 * ⚠️ 'unloaded' נחשב תקין: זו הפריקה האוטומטית בתום שישה שבועות — הכרטיס נוצל
 * בפועל וירד מהמלאי בצדק. פריקה בעקבות *ביטול אישור* כן מחזירה כרטיס למלאי,
 * וזאת בנקודת הביטול עצמה, כך שהיא כבר לא תופיע כאן כמוחזקת.
 */
function isBacked(aid: ReconAid | undefined): { ok: boolean; reason: string } {
  if (!aid) return { ok: false, reason: 'התיק נמחק מהמערכת — הכרטיס נוכה ולא הוחזר' }
  if (aid.status === 'cancelled') return { ok: false, reason: 'הבקשה נדחתה לאחר שהכרטיס נוכה' }
  if (aid.status === 'pending') return { ok: false, reason: 'הבקשה חזרה להמתנה לאחר שהכרטיס נוכה' }
  if (aid.status === 'deep_review') return { ok: false, reason: 'הבקשה הועברה לבדיקה מעמיקה לאחר שהכרטיס נוכה' }
  if (aid.card_load_status === 'failed') return { ok: false, reason: 'ההטענה בנדרים נכשלה — הכרטיס נוכה ולא נטען' }
  if (aid.card_load_status === 'loaded' || aid.card_load_status === 'unloaded') return { ok: true, reason: '' }
  return { ok: false, reason: 'הכרטיס נוכה אך לא נרשמה הטענה' }
}

/**
 * התיקים שמחזיקים כרטיס בפועל (ניכוי בגין לידה שלא הוחזר).
 *
 * ⚠️ קיים כדי שנקודת-הקצה תשלוף סטטוסים רק עבורם — כמה עשרות — ולא עבור כל
 * תיק שאי פעם הופיע ביומן. עם מאות שורות, שליפה של כולם הייתה מייצרת בקשה
 * ענקית מול PostgREST על נתונים שאינם דרושים לחישוב.
 */
export function heldAidIds(ledger: ReconLedgerRow[]): string[] {
  const net = new Map<string, number>()
  const birthAids = new Set<string>()
  for (const row of ledger) {
    if (!row.aid_id) continue
    const delta = Number(row.delta) || 0
    net.set(row.aid_id, (net.get(row.aid_id) ?? 0) + delta)
    if (BIRTH_REASONS.has(row.reason ?? '') && delta < 0) birthAids.add(row.aid_id)
  }
  return [...birthAids].filter(id => (net.get(id) ?? 0) < 0)
}

export function reconcileStock(ledger: ReconLedgerRow[], aids: ReconAid[]): StockRecon {
  const byId = new Map(aids.map(a => [a.id, a]))

  let totalIn = 0
  let totalOut = 0
  const reasonMap = new Map<string, ReasonLine>()
  // ⚠️ הצבירה לכל תיק היא של *כל* התנועות שלו — כולל ההחזרות (delta חיובי עם
  // aid_id). כרטיס שנוכה והוחזר מתאזן לאפס ואינו נספר כתלוי; ספירת ניכויים
  // בלבד הייתה מדווחת על כרטיס חסר שכבר חזר למלאי.
  const netByAid = new Map<string, number>()

  for (const row of ledger) {
    const delta = Number(row.delta) || 0
    if (delta > 0) totalIn += delta
    else totalOut += -delta

    const reason = row.reason ?? 'adjust'
    const line = reasonMap.get(reason) ?? { reason, count: 0, total: 0 }
    line.count += 1
    line.total += delta
    reasonMap.set(reason, line)

    if (row.aid_id) netByAid.set(row.aid_id, (netByAid.get(row.aid_id) ?? 0) + delta)
  }

  // רק תיקים שנוכה בגינם כרטיס בפועל (ולא, למשל, הוספת מלאי שנרשמה על תיק)
  const birthAids = new Set(
    ledger.filter(r => r.aid_id && BIRTH_REASONS.has(r.reason ?? '') && Number(r.delta) < 0).map(r => r.aid_id as string),
  )

  let heldOk = 0
  const strays: StrayCard[] = []
  for (const aidId of birthAids) {
    const held = -(netByAid.get(aidId) ?? 0)
    if (held <= 0) continue                      // נוכה והוחזר במלואו
    const aid = byId.get(aidId)
    const { ok, reason } = isBacked(aid)
    const legit = ok ? 1 : 0
    heldOk += Math.min(held, legit)
    const stray = held - legit
    if (stray > 0) {
      strays.push({
        aidId,
        name: aid?.name?.trim() || 'לא ידוע',
        cards: stray,
        statusLabel: STATUS_LABEL[String(aid?.status ?? '')] ?? '—',
        // ⚠️ ניכוי כפול על תיק תקין הוא סיפור אחר לגמרי מדחייה, וההסבר חייב
        // לומר זאת: אחרת המנהל מחפש למה הלידה "לא מאושרת" והיא כן מאושרת.
        reason: ok ? `נוכו ${held} כרטיסים לאותה לידה — עודף של ${stray}` : reason,
      })
    }
  }

  strays.sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name, 'he'))
  const strayCards = strays.reduce((s, r) => s + r.cards, 0)
  const balance = totalIn - totalOut

  return {
    balance,
    totalIn,
    totalOut,
    byReason: [...reasonMap.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    heldOk,
    strayCards,
    expectedBalance: balance + strayCards,
    strays,
  }
}
