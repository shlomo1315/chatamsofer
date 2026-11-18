import { HDate, gematriya } from '@hebcal/core'

/** השנה העברית בגימטריה בלי אלפים, למשל "תשפ״ז". */
export function hebrewYearLabel(date: Date = new Date()): string {
  return String(gematriya(new HDate(date).getFullYear() % 1000))
}

/** מוסיף שנה עברית אחרי שם הפרשה, אלא אם כבר כתובה שם. */
export function withHebrewYear(parasha: string, date: Date = new Date()): string {
  const p = parasha.trim()
  if (!p || /תש[א-ת]?[׳״"']?[א-ת]/.test(p.split(/\s+/).slice(-1)[0] ?? '')) return p
  return `${p} ${hebrewYearLabel(date)}`
}
