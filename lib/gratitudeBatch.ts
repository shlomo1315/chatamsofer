// ─────────────────────────────────────────────────────────────────────────────
// פילוח הברכות לקובץ מרוכז — מי נכנס לקובץ, ובאיזה סדר.
//
// 🔴 למה מודול נפרד: אותו פילוח משרת שלושה מקומות — התצוגה המקדימה
// (כמה ברכות ייכנסו), הכותרת שבתוך ה-PDF, וההורדה עצמה. שלושה מימושים
// היו נסחפים, והמשתמש היה מוריד קובץ שאינו תואם למה שהמסך הבטיח.
//
// ⚠️ ההחלטה המרכזית: "טרם נשלחו לנדיב" נקבע לפי sent_to_donor_at ולא לפי
// סטטוס. ברכה יכולה להיות מאושרת ועדיין לא נשלחה — וזה בדיוק המצב שאותו
// המשלוח השבועי מחפש.
// ─────────────────────────────────────────────────────────────────────────────

/** מה שהפילוח צריך לדעת על ברכה. */
export interface BatchLetter {
  id: string
  status?: string | null
  /** מתי נשלחה לנדיב. null/ריק = טרם נשלחה. */
  sent_to_donor_at?: string | null
  /** תאריך קליטת הברכה (ISO). */
  created_at?: string | null
}

/** מצב המשלוח לנדיב — הפילוח שהמשתמש בוחר. */
export type SentFilter = 'all' | 'unsent' | 'sent'

export interface BatchFilters {
  /** מתאריך (YYYY-MM-DD) — כולל את היום עצמו. */
  from?: string | null
  /** עד תאריך (YYYY-MM-DD) — כולל את היום עצמו *במלואו*. */
  to?: string | null
  sent?: SentFilter
}

/** האם הברכה כבר נשלחה לנדיב. */
export const wasSentToDonor = (l: BatchLetter): boolean =>
  Boolean((l.sent_to_donor_at ?? '').trim())

/**
 * היום שבו נקלטה הברכה, כ-YYYY-MM-DD.
 *
 * ⚠️ חיתוך המחרוזת ולא new Date(): התאריך במסד נשמר ב-UTC, והמרה
 * ל-Date מקומי הייתה מזיזה ברכה שנקלטה בערב ליום הקודם — כך שברכה
 * מה-1 בחודש נופלת מחוץ לטווח שמתחיל ב-1 בחודש.
 */
export function dayOf(l: BatchLetter): string {
  return String(l.created_at ?? '').slice(0, 10)
}

function matchesRange(l: BatchLetter, from?: string | null, to?: string | null): boolean {
  const d = dayOf(l)
  // ⚠️ ברכה בלי תאריך אינה נופלת מהטווח בשקט — היא נכללת רק כשאין טווח,
  // ולכן מי שסינן לפי תאריכים לא מקבל שורות שאינו יכול להסביר.
  if (!d) return !from && !to
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

/** האם הברכה נכנסת לקובץ. */
export function matchesBatch(l: BatchLetter, f: BatchFilters): boolean {
  if (!matchesRange(l, f.from, f.to)) return false

  const sent = f.sent ?? 'all'
  if (sent === 'unsent' && wasSentToDonor(l)) return false
  if (sent === 'sent' && !wasSentToDonor(l)) return false

  // ⚠️ אין בחירת סטטוס למשתמש — היא רק חסמה את הפקת עם ערימות שאין להן
  // שום ערך עסקי. רק ברכה שנדחתה במפורש (תוכן לא מתאים למסירה לנדיב) מודרת תמיד —
  // לא תלוי בבחירה ששכחו לסמן.
  if ((l.status ?? '') === 'rejected') return false

  return true
}

/**
 * הברכות שייכנסו לקובץ, בסדר קליטה עולה (ישן→חדש).
 *
 * ⚠️ עולה ולא יורד — במסמך מודפס קוראים מלמעלה למטה כרונולוגית, בניגוד
 * לרשימה במסך שבה החדש קודם.
 */
export function selectBatch<T extends BatchLetter>(rows: T[], f: BatchFilters): T[] {
  return rows
    .filter(l => matchesBatch(l, f))
    .sort((a, b) => {
      const da = String(a.created_at ?? ''), db = String(b.created_at ?? '')
      return da === db ? a.id.localeCompare(b.id) : da < db ? -1 : 1
    })
}

export interface BatchStats {
  total: number
  sent: number
  unsent: number
  approved: number
  received: number
  rejected: number
}

/** פילוח מספרי של קבוצת ברכות — לכותרת ה-PDF ולתצוגה המקדימה. */
export function batchStats(rows: BatchLetter[]): BatchStats {
  const s: BatchStats = { total: rows.length, sent: 0, unsent: 0, approved: 0, received: 0, rejected: 0 }
  for (const l of rows) {
    if (wasSentToDonor(l)) s.sent++; else s.unsent++
    const st = l.status ?? ''
    if (st === 'approved') s.approved++
    else if (st === 'received') s.received++
    else if (st === 'rejected') s.rejected++
  }
  return s
}

/** תיאור הטווח לכותרת המסמך. ריק = "כל התקופה". */
export function rangeLabel(from?: string | null, to?: string | null): string {
  const he = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4)
  if (from && to) return `${he(from)} — ${he(to)}`
  if (from) return `מ-${he(from)} ואילך`
  if (to) return `עד ${he(to)}`
  return 'כל התקופה'
}

export const SENT_LABEL: Record<SentFilter, string> = {
  all: 'הכל',
  unsent: 'טרם נשלחו לנדיב',
  sent: 'נשלחו לנדיב',
}
