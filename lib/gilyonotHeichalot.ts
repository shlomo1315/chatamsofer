import { HDate, Locale, gematriya } from '@hebcal/core'

/** מספר גיליון בגימטריה, למשל 81 -> פ''א, 82 -> פ''ב. */
export function issueNumberLabel(n: number): string {
  return String(gematriya(n)).replace(/״/g, "''")
}

/** שם החודש העברי בלי ניקוד, למשל "כסלו". */
export function hebrewMonthLabel(date: Date = new Date()): string {
  return Locale.hebrewStripNikkud(Locale.gettext(new HDate(date).getMonthName(), 'he'))
}

/**
 * הנושא האוטומטי (הצעה בלבד): גיליון "היכל החתם סופר", גיליון פ''א, פרשת תולדות
 * ועם קובץ היכלות חדש גם: | הקובץ החדש "היכלות" - חודש כסלו
 */
export function heichalotSubject(o: { number?: number | null; parasha: string; heichalotNew: boolean; date?: Date }): string {
  const parasha = o.parasha.trim()
  const parts = [
    'גיליון "היכל החתם סופר"',
    o.number ? `גיליון ${issueNumberLabel(o.number)}` : '',
    parasha && !/^פרשת\s/.test(parasha) ? `פרשת ${parasha}` : parasha,
  ].filter(Boolean)
  const base = parts.join(', ')
  return o.heichalotNew ? `${base} | הקובץ החדש "היכלות" - חודש ${hebrewMonthLabel(o.date)}` : base
}

/**
 * פסקת היכלות בגוף המייל. הנוסח כאן הוא גיבוי: הנוסח המקורי שבתבנית השמורה במסד לא היה נגיש.
 * הפסקה נכנסת לפתיח של הגיליון בעת היצירה, ולכן אפשר לערוך אותה בעורך.
 */
export function heichalotParagraph(heichalotNew: boolean, month: string): string {
  return heichalotNew
    ? `ראו זה חדש! מצורף הקובץ החדש "היכלות" לחודש ${month}.`
    : `לטובת חובבי תורת משה צירפנו שוב את קובץ החודשי היכלות לחודש ${month}.`
}

/** מצב תקין של גיליון: כשסומן "יש היכלות חדש" חייב להיות לו קובץ. מחזיר הודעת שגיאה או null. */
export function heichalotMissingError(issue: { heichalot_new?: boolean | null; file2_path?: string | null }): string | null {
  return issue.heichalot_new && !issue.file2_path
    ? 'סימנתם "יש היכלות חדש" אבל לא הועלה קובץ היכלות חדש. העלו קובץ או בטלו את הסימון.'
    : null
}

const KEY = 'next_issue_number'
const CURRENT_KEY = 'current_heichalot'
/** קובץ ההיכלות הנוכחי נשמר מחוץ לתיקיות הגיליונות, כדי שמחיקת טיוטה לא תמחק אותו. */
export const HEICHALOT_DIR = 'gilyonot/heichalot/'
type Db = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export type CurrentHeichalot = { path: string; name: string; size: number; month: string }

export async function getCurrentHeichalot(db: Db): Promise<CurrentHeichalot | null> {
  const { data } = await db.from('gilyonot_settings').select('value').eq('key', CURRENT_KEY).maybeSingle()
  try {
    const v = JSON.parse(String(data?.value)) as CurrentHeichalot
    return v?.path ? v : null
  } catch { return null }
}

export async function setCurrentHeichalot(db: Db, v: CurrentHeichalot): Promise<boolean> {
  const { error } = await db.from('gilyonot_settings').upsert({ key: CURRENT_KEY, value: JSON.stringify(v), updated_at: new Date().toISOString() }, { onConflict: 'key' })
  return !error
}

/** מספר הגיליון הבא, או null אם עוד לא הוגדר (או שהמיגרציה לא רצה). */
export async function getNextIssueNumber(db: Db): Promise<number | null> {
  const { data } = await db.from('gilyonot_settings').select('value').eq('key', KEY).maybeSingle()
  const n = Number(data?.value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function setNextIssueNumber(db: Db, n: number): Promise<boolean> {
  const { error } = await db.from('gilyonot_settings').upsert({ key: KEY, value: String(n), updated_at: new Date().toISOString() }, { onConflict: 'key' })
  return !error
}

/**
 * נקרא רק אחרי שהגיליון נתפס לשליחה אמיתית. מקדם את המונה לאחרי מספר הגיליון הזה,
 * פעם אחת לגיליון (number_counted). לעולם לא מוריד את המונה.
 */
export async function advanceIssueCounter(db: Db, issueId: string): Promise<void> {
  const { data: row } = await db.from('gilyonot_issues').select('issue_number').eq('id', issueId).maybeSingle()
  const num = row?.issue_number as number | null | undefined
  if (!num) return
  const { data: won } = await db.from('gilyonot_issues').update({ number_counted: true }).eq('id', issueId).eq('number_counted', false).select('id').maybeSingle()
  if (!won) return
  const cur = await getNextIssueNumber(db)
  if (cur === null || cur <= num) await setNextIssueNumber(db, num + 1)
}
