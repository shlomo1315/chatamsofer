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
  created_at?: string | null
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
  /**
   * הכרטיס עדיין טעון בנדרים.
   * ⚠️ ההבחנה קריטית: כרטיס טעון נמצא *מחוץ* למגירה — הכסף בו, וייתכן שהוא כבר
   * בידי המשפחה. החזרתו למלאי הייתה יוצרת כרטיס פנטום: המערכת סופרת כרטיס
   * שאינו קיים פיזית ומנפיקה אותו שוב. במקרה כזה הפעולה הנכונה היא ביטול
   * הטעינה — והוא זה שמחזיר את הכרטיס למלאי.
   */
  loaded: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// כיסוי כרטיסים ללידות מאושרות — "יש 48 מאושרות, למה המערכת מפחיתה 46?"
//
// ⚠️ "מספר המאושרות" ו"מספר הכרטיסים שיצאו" אינם אותו מספר, לשני הכיוונים:
// לידה מאושרת שביקשה בית החלמה בלבד אינה מקבלת כרטיס; לידה שההטענה שלה נכשלה
// לא הוציאה כרטיס; ומצד שני יש כרטיסים טעונים בידי לידות שהאישור שלהן נסוג.
// לכן ההשוואה מוצגת בשמות ולא כמספר יחיד — אחרת כל פער נראה כמו כרטיס אבוד.
// ─────────────────────────────────────────────────────────────────────────────
export interface ApprovedGap {
  aidId: string
  name: string
  reason: string
}

export interface ApprovedCoverage {
  /** לידות מאושרות שביקשו כרטיס מזון */
  total: number
  /** מהן — כמה מחזיקות כרטיס בפועל */
  withCard: number
  /** המאושרות שאינן מחזיקות כרטיס, עם הסיבה */
  missing: ApprovedGap[]
}

// ⚠️ heldIds (התיקים שמחזיקים ניכוי ביומן) אינו פרמטר לחישוב אלא נשאר בחתימה
// לתאימות הקוראים: העדות הקובעת ל"מחזיקה כרטיס" היא card_load_status, לא היומן.
// תיק עם ניכוי ביומן שלא נטען בפועל הוא כרטיס שלא יצא — ולכן "טרם קיבלה".
export function approvedCardCoverage(
  activeAids: (ReconAid & { awaitingStock?: boolean })[],
  _heldIds: string[] = [],
): ApprovedCoverage {
  void _heldIds
  const missing: ApprovedGap[] = []
  let withCard = 0
  for (const aid of activeAids) {
    // ⚠️ העדות הקובעת היא card_load_status ולא קישור היומן, וזו אותה הגדרה
    // בדיוק כמו holdsCard בדשבורד (lib/awaitingFilter). קודם נספר כאן גם תיק
    // שיש לו ניכוי ביומן אך לא נטען בפועל, ומכאן נבע ההפרש בין שני המסכים.
    if (aid.card_load_status === 'loaded' || aid.card_load_status === 'unloaded') { withCard++; continue }
    missing.push({
      aidId: aid.id,
      name: aid.name?.trim() || 'לא ידוע',
      reason: aid.card_load_status === 'failed' ? 'ההטענה נכשלה — לא יצא כרטיס'
        : aid.awaitingStock ? 'ממתינה למלאי — הכרטיס עוד לא יצא'
        : 'אושרה אך טרם נטען לה כרטיס',
    })
  }
  return { total: activeAids.length, withCard, missing }
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
  /** מלאי הפתיחה שנקבע ידנית (0 כשלא נקבע) */
  opening: number
  /** מועד קביעת מלאי הפתיחה — null כשההתאמה מכסה את כל היומן */
  baselineAt: string | null
  /**
   * כרטיסים שנוכו בגין לידות שנמחקו מהמערכת.
   * ⚠️ מדווח בנפרד ובלי שמות מפני שאין מה להציג: מחיקת תיק מאפסת את aid_id
   * ביומן (on delete set null), ולכן הקישור לשם המשפחה אבד. בלי השורה הזו
   * הניכויים האלה היו "נעלמים" מההתאמה והסכומים לא היו מסתדרים.
   */
  deletedAidCards: number
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
/**
 * מועד מלאי הפתיחה האחרון — התנועות שקדמו לו אינן נכללות בהתאמה.
 *
 * ⚠️ ההתאמה חייבת נקודת אפס: היומן צבר תנועות מתקופת הבדיקות, וסכימת הכל
 * הציגה "הוכנסו 683" מול מנהל שיודע שקנה 300. המלאי עצמו לא משתנה — הוא תמיד
 * סכום היומן — רק *ההסבר* נמדד מנקודת הספירה הפיזית והלאה.
 */
export function baselineAtOf(ledger: ReconLedgerRow[]): string | null {
  let latest: string | null = null
  for (const row of ledger) {
    if (row.reason !== 'baseline' || !row.created_at) continue
    if (!latest || row.created_at > latest) latest = row.created_at
  }
  return latest
}

/** התנועות שנכללות בהתאמה — אחרי מלאי הפתיחה (או כולן, כשלא נקבע). */
export function scopedLedger(ledger: ReconLedgerRow[]): ReconLedgerRow[] {
  const at = baselineAtOf(ledger)
  if (!at) return ledger
  return ledger.filter(r => !!r.created_at && r.created_at > at)
}

export function heldAidIds(ledger: ReconLedgerRow[]): string[] {
  const net = new Map<string, number>()
  const birthAids = new Set<string>()
  for (const row of scopedLedger(ledger)) {
    if (!row.aid_id) continue
    const delta = Number(row.delta) || 0
    net.set(row.aid_id, (net.get(row.aid_id) ?? 0) + delta)
    if (BIRTH_REASONS.has(row.reason ?? '') && delta < 0) birthAids.add(row.aid_id)
  }
  return [...birthAids].filter(id => (net.get(id) ?? 0) < 0)
}

export function reconcileStock(ledger: ReconLedgerRow[], aids: ReconAid[]): StockRecon {
  const byId = new Map(aids.map(a => [a.id, a]))

  // המלאי האמיתי — סכום *כל* היומן, גם מלפני מלאי הפתיחה. הוא לעולם אינו נגזר
  // מטווח ההתאמה, כדי שהמספר במסך יהיה תמיד זהה למסד.
  const balance = ledger.reduce((s, r) => s + (Number(r.delta) || 0), 0)
  const baselineAt = baselineAtOf(ledger)
  const rows = scopedLedger(ledger)

  let totalIn = 0
  let totalOut = 0
  const reasonMap = new Map<string, ReasonLine>()
  // ⚠️ הצבירה לכל תיק היא של *כל* התנועות שלו — כולל ההחזרות (delta חיובי עם
  // aid_id). כרטיס שנוכה והוחזר מתאזן לאפס ואינו נספר כתלוי; ספירת ניכויים
  // בלבד הייתה מדווחת על כרטיס חסר שכבר חזר למלאי.
  const netByAid = new Map<string, number>()

  // ניכויי לידה שאיבדו את הקישור לתיק (התיק נמחק → aid_id התאפס), בניכוי
  // החזרות שנרשמו באותו אופן
  let orphanOut = 0
  let orphanBack = 0

  for (const row of rows) {
    const delta = Number(row.delta) || 0
    const reasonKey = row.reason ?? 'adjust'

    // 🔴 "נקנו" סופר רכישות בלבד — לא החזרות.
    //
    // ⚠️ הבאג שהיה כאן: כל תנועה חיובית נספרה כ"נכנס", כולל החזרה של
    // כרטיס שנוכה ונכשל ("החזרה אוטומטית — טעינת נדרים נכשלה"). החזרה
    // אינה קנייה — היא ביטול של ניכוי, ושתיהן יחד מתאזנות לאפס.
    //
    // 🔴 בפועל זה עיוות את המספר בגלוי: ארבעה תיקי דרכון נוכו והוחזרו
    // *כל שעה* במשך יממה, וכל החזרה כזו הוסיפה ל"נקנו". המנהל הכניס 300
    // וראה 295 — מספר שאינו קיים בשום מקום במציאות.
    //
    // ⚠️ ההחזרה עדיין נספרת ב-totalOut *השלילי* דרך הקיזוז ב-netByAid,
    // ולכן הזהות "פתיחה + נכנס − יצא = מלאי" נשמרת. רק הסיווג השתנה.
    const isReturn = delta > 0 && reasonKey === 'adjust' && !!row.aid_id
    if (delta > 0) { if (!isReturn) totalIn += delta }
    else totalOut += -delta
    // החזרה מקזזת את הניכוי שקדם לה, ולכן מופחתת מהיוצא ולא מתווספת לנכנס.
    if (isReturn) totalOut -= delta

    const reason = row.reason ?? 'adjust'
    const line = reasonMap.get(reason) ?? { reason, count: 0, total: 0 }
    line.count += 1
    line.total += delta
    reasonMap.set(reason, line)

    if (row.aid_id) netByAid.set(row.aid_id, (netByAid.get(row.aid_id) ?? 0) + delta)
    else if (BIRTH_REASONS.has(reason) && delta < 0) orphanOut += -delta
    else if (reason === 'adjust' && delta > 0) orphanBack += delta
  }

  // מלאי הפתיחה — כל מה שקדם לו מקופל למספר אחד, כך שהזהות
  // "פתיחה + נכנס − יצא = מלאי" מתקיימת תמיד, לכל טווח.
  const opening = balance - totalIn + totalOut

  // רק תיקים שנוכה בגינם כרטיס בפועל (ולא, למשל, הוספת מלאי שנרשמה על תיק)
  const birthAids = new Set(
    rows.filter(r => r.aid_id && BIRTH_REASONS.has(r.reason ?? '') && Number(r.delta) < 0).map(r => r.aid_id as string),
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
        loaded: aid?.card_load_status === 'loaded',
      })
    }
  }

  strays.sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name, 'he'))
  const namedStray = strays.reduce((s, r) => s + r.cards, 0)
  const deletedAidCards = Math.max(0, orphanOut - orphanBack)
  const strayCards = namedStray + deletedAidCards

  return {
    balance,
    totalIn,
    totalOut,
    byReason: [...reasonMap.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    heldOk,
    strayCards,
    expectedBalance: balance + strayCards,
    strays,
    opening,
    baselineAt,
    deletedAidCards,
  }
}
