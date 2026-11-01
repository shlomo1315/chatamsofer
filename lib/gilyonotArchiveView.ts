import { HDate, gematriya } from '@hebcal/core'

// ─────────────────────────────────────────────────────────────────────────────
// עזרים לדף הארכיון הציבורי: חומש לפי פרשה, שנה עברית, וסינון/חיפוש על הרשימה
// שנטענה. בלי תלות בשרת או במסד — רץ גם בדפדפן.
// ─────────────────────────────────────────────────────────────────────────────

export interface ArchiveItem {
  id: string
  title: string
  parasha: string
  year: number | null
  topic: string | null
  issue_date: string | null
  file_size: number | null
}

export const CHUMASH: Record<string, string[]> = {
  בראשית: ['בראשית', 'נח', 'לך לך', 'וירא', 'חיי שרה', 'תולדות', 'ויצא', 'וישלח', 'וישב', 'מקץ', 'ויגש', 'ויחי'],
  שמות: ['שמות', 'וארא', 'בא', 'בשלח', 'יתרו', 'משפטים', 'תרומה', 'תצוה', 'כי תשא', 'ויקהל', 'פקודי', 'ויקהל פקודי'],
  ויקרא: ['ויקרא', 'צו', 'שמיני', 'תזריע', 'מצורע', 'תזריע מצורע', 'אחרי מות', 'קדושים', 'אחרי מות קדושים', 'אמור', 'בהר', 'בחוקותי', 'בהר בחוקותי'],
  במדבר: ['במדבר', 'נשא', 'בהעלותך', 'שלח', 'קרח', 'חוקת', 'בלק', 'חוקת בלק', 'פינחס', 'מטות', 'מסעי', 'מטות מסעי'],
  דברים: ['דברים', 'ואתחנן', 'עקב', 'ראה', 'שופטים', 'כי תצא', 'כי תבוא', 'נצבים', 'וילך', 'נצבים וילך', 'האזינו', 'וזאת הברכה'],
  מועדים: ['ראש השנה', 'יום כיפור', 'סוכות', 'שמיני עצרת', 'שמחת תורה', 'חנוכה', 'פורים', 'פסח', 'שבועות', 'תשעה באב'],
}
export const CHUMASH_NAMES = Object.keys(CHUMASH)

const clean = (s: string) => s.replace(/^פרשת\s+/, '').replace(/["'״׳]/g, '').trim()

/** החומש של פרשה ("פרשת וירא" או "וירא"); ריק אם לא מזוהה. */
export function chumashOf(parasha: string): string {
  const p = clean(parasha)
  for (const [name, list] of Object.entries(CHUMASH)) if (list.some(x => clean(x) === p)) return name
  for (const [name, list] of Object.entries(CHUMASH)) if (list.some(x => p.includes(clean(x)) && clean(x).length > 2)) return name
  return ''
}

/** שנה עברית בגימטריה, למשל תשפ״ז. השנה נלקחת מהתאריך (ולא משנה לועזית). */
export function hebrewYearLabel(isoDate: string | null): string {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T12:00:00`)
  if (isNaN(d.getTime())) return ''
  return gematriya(new HDate(d).getFullYear() % 1000)
}

export interface ArchiveRow extends ArchiveItem { yearLabel: string; chumash: string }

export function toRows(items: ArchiveItem[]): ArchiveRow[] {
  return items.map(i => ({ ...i, yearLabel: hebrewYearLabel(i.issue_date), chumash: chumashOf(i.parasha) }))
}

export interface ArchiveFilter { q: string; year: string; chumash: string; topic: string }

/** חיפוש וסינון על הרשימה שנטענה. חיפוש: כל מילה חייבת להופיע בכותרת, פרשה, נושא, שנה או חומש. */
export function filterRows(rows: ArchiveRow[], f: ArchiveFilter): ArchiveRow[] {
  const words = f.q.replace(/["'״׳]/g, '').trim().split(/\s+/).filter(Boolean)
  return rows.filter(r => {
    if (f.year && r.yearLabel !== f.year) return false
    if (f.chumash && r.chumash !== f.chumash) return false
    if (f.topic && r.topic !== f.topic) return false
    if (!words.length) return true
    const hay = [r.title, r.parasha, r.topic ?? '', r.yearLabel, r.chumash].join(' ').replace(/["'״׳]/g, '')
    return words.every(w => hay.includes(w))
  })
}
