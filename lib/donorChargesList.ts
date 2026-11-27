import type { ChargesReport } from '@/lib/donorCharges'
import { toUsd, type RateMap } from '@/lib/boiRates'
import type { Column } from '@/lib/xlsx'

// גיליון "כל החיובים" בדוח לנדיב: שורה לכל חיוב, לפי תאריך ושעה, עם השער
// היציג של אותו יום (או האחרון שלפניו) וסכום משוער בדולרים.
// משותף לשרת (האקסל) ולמסך (התצוגה המקדימה), כדי ששניהם יציגו אותו דבר.

export const ALL_CHARGES_SHEET = 'כל החיובים'
export const ALL_CHARGES_COLUMNS: Column[] = [
  { header: 'תאריך', kind: 'date' },
  { header: 'שעה' },
  { header: 'בית החלמה' },
  { header: 'שם היולדת' },
  { header: 'לילות', kind: 'number' },
  { header: 'סכום (₪)', kind: 'number' },
  { header: 'שער יציג משוער', kind: 'number', numFmt: '0.000' },
  { header: 'תאריך השער', kind: 'date' },
  { header: 'סכום משוער ($)', kind: 'number', numFmt: '#,##0.00' },
]

export type ListCell = string | number | null

/** השורות ממוינות לפי תאריך, שעה ובית. השורה האחרונה היא סה״כ. */
export function allChargesRows(report: ChargesReport, rates: RateMap | null): ListCell[][] {
  const charges = report.branches.flatMap(b => b.days.flatMap(d => d.charges))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.home.localeCompare(b.home, 'he'))
  let usdTotal = 0, allRated = charges.length > 0
  const rows: ListCell[][] = charges.map(c => {
    const r = rates?.[c.date] ?? null
    const usd = r ? toUsd(c.amount, r.rate) : null
    if (usd === null) allRated = false
    else usdTotal += usd
    return [c.date, c.time, c.home, c.name, c.nights, c.amount, r?.rate ?? null, r?.date ?? null, usd]
  })
  // סה״כ בדולרים רק כשלכל החיובים יש שער, כדי לא להציג סכום חלקי כאילו הוא מלא
  rows.push(['סה״כ', null, null, null, null, report.amount, null, null, allRated ? Math.round(usdTotal * 100) / 100 : null])
  return rows
}
