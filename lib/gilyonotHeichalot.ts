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

const KEY = 'next_issue_number'
type Db = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

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
