// ─────────────────────────────────────────────────────────────────────────────
// יומן טעינות כרטיסי המזון — "מי קיבלה כרטיס, מתי, בכמה, ומי הטעין"
//
// המקור הוא activity_log (maternity_card_loaded / maternity_card_load_failed):
// כל טעינה, אוטומטית או ידנית, נרשמת שם עם הסכום ועם המשתמש שהטעין.
//
// ⚠️ טסטים מזוהים לפי הנתונים ולא לפי תאריך: טעינה של תיק שנמחק מהמערכת היא
// תיק בדיקה (כך נוקו הבדיקות של יוני–יולי), וכן שם שמכיל "בדיקה"/"טסט"/test.
// תאריך לבדו אינו סימן — יולדות אמיתיות נטענו גם לפני שנרשמה הרכישה הראשונה.
//
// ⚠️ ניסיונות כושלים רצופים של אותו תיק מקובצים לשורה אחת: הסבב השעתי מנסה
// שוב ושוב, ובלי קיבוץ תיק תקוע אחד ממלא את היומן במאות שורות זהות.
//
// פונקציה טהורה — השליפות בנקודת-הקצה, וההיגיון נבדק בטסטים.
// ─────────────────────────────────────────────────────────────────────────────

export const LOADED_ACTION = 'maternity_card_loaded'
export const FAILED_ACTION = 'maternity_card_load_failed'

export interface JournalEvent {
  action: string
  entity_id: string | null
  user_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface JournalAid {
  id: string
  name: string
  /** מצב הכרטיס עכשיו — loaded / unloaded / failed / idle */
  card_load_status?: string | null
}

export interface JournalRow {
  /** מפתח יציב לתצוגה */
  key: string
  at: string
  aidId: string
  name: string
  amount: number | null
  result: 'loaded' | 'failed'
  /** כמה ניסיונות כושלים רצופים קובצו לשורה (1 בטעינה מוצלחת) */
  attempts: number
  /** שם המשתמש שהטעין, או "אוטומטי" */
  by: string
  /** הודעת השגיאה האחרונה (בכישלון) */
  error: string | null
  /** מצב הכרטיס עכשיו בתיק */
  currentStatus: string | null
}

export interface LoadJournal {
  rows: JournalRow[]
  /** טעינות מוצלחות אמיתיות */
  loaded: number
  /** תיקים שונים שנטענו */
  loadedAids: number
  /** שורות כישלון (אחרי קיבוץ) */
  failed: number
  /** אירועי טעינה שסוננו כטסטים */
  excludedTests: number
}

const TEST_NAME = /בדיקה|טסט|test/i

export function isTestName(name: string): boolean {
  return TEST_NAME.test(name)
}

function amountOf(d: Record<string, unknown> | null): number | null {
  const n = Number(d?.amount)
  return Number.isFinite(n) && n > 0 ? n : null
}

function errorOf(d: Record<string, unknown> | null): string | null {
  const e = d?.error ?? d?.message
  return typeof e === 'string' && e ? e : null
}

function byOf(e: JournalEvent, staff: Map<string, string>): string {
  if (e.user_id) return staff.get(e.user_id) ?? 'משתמש לא ידוע'
  return 'אוטומטי'
}

/**
 * בונה את היומן מהאירועים. התוצאה ממוינת מהחדש לישן.
 * @param aids  כל התיקים הקיימים שהאירועים מפנים אליהם. אירוע שהתיק שלו חסר = תיק שנמחק = טסט.
 * @param staff מזהה משתמש → שם
 */
export function buildLoadJournal(
  events: JournalEvent[],
  aids: JournalAid[],
  staff: Map<string, string>,
): LoadJournal {
  const aidMap = new Map(aids.map(a => [a.id, a]))
  const sorted = [...events]
    .filter(e => e.entity_id && (e.action === LOADED_ACTION || e.action === FAILED_ACTION))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const rows: JournalRow[] = []
  // הכישלון הפתוח האחרון של כל תיק — אליו מצטרפים ניסיונות רצופים
  const openFail = new Map<string, JournalRow>()
  let excludedTests = 0

  for (const e of sorted) {
    const aidId = e.entity_id as string
    const aid = aidMap.get(aidId)
    if (!aid || isTestName(aid.name)) { excludedTests++; continue }

    if (e.action === FAILED_ACTION) {
      const open = openFail.get(aidId)
      if (open) {
        open.attempts++
        open.at = e.created_at
        open.error = errorOf(e.details) ?? open.error
        open.amount = amountOf(e.details) ?? open.amount
        continue
      }
      const row: JournalRow = {
        key: `${aidId}:${e.created_at}`, at: e.created_at, aidId, name: aid.name,
        amount: amountOf(e.details), result: 'failed', attempts: 1, by: byOf(e, staff),
        error: errorOf(e.details), currentStatus: aid.card_load_status ?? null,
      }
      rows.push(row)
      openFail.set(aidId, row)
      continue
    }

    openFail.delete(aidId)
    rows.push({
      key: `${aidId}:${e.created_at}`, at: e.created_at, aidId, name: aid.name,
      amount: amountOf(e.details), result: 'loaded', attempts: 1, by: byOf(e, staff),
      error: null, currentStatus: aid.card_load_status ?? null,
    })
  }

  rows.sort((a, b) => b.at.localeCompare(a.at))
  const loadedRows = rows.filter(r => r.result === 'loaded')
  return {
    rows,
    loaded: loadedRows.length,
    loadedAids: new Set(loadedRows.map(r => r.aidId)).size,
    failed: rows.length - loadedRows.length,
    excludedTests,
  }
}
