import { describe, expect, it } from 'vitest'
import { buildGilyonHtml, defaultSubject } from './gilyonotMail'
import { hebrewYearLabel, withHebrewYear } from './gilyonotYear'

const nov = new Date('2026-11-18T12:00:00Z')
const base = { title: 'גיליון החתם סופר', parasha: 'פרשת ויצא', unsubscribeUrl: null, date: nov }

describe('שנה עברית בגיליון', () => {
  it('שורת המשנה בכותרת כוללת פרשה ושנה', () => {
    expect(buildGilyonHtml(base)).toContain('פרשת ויצא תשפ״ז')
  })
  it('שורת משנה ידנית גוברת', () => {
    const html = buildGilyonHtml({ ...base, design: { headerSub: 'מיוחד' } })
    expect(html).toContain('מיוחד')
    expect(html).not.toContain('תשפ״ז')
  })
  it('הנושא הדיפולטי כולל פרשה ושנה, בלי כפילות', () => {
    expect(defaultSubject('גיליון החתם סופר', 'פרשת ויצא', nov)).toBe('גיליון החתם סופר · פרשת ויצא תשפ״ז')
    expect(withHebrewYear('פרשת ויצא תשפ״ז', nov)).toBe('פרשת ויצא תשפ״ז')
  })
  it('השנה מתחלפת בראש השנה', () => {
    expect(hebrewYearLabel(new Date('2026-09-11T12:00:00Z'))).toBe('תשפ״ו')
    expect(hebrewYearLabel(new Date('2026-09-13T12:00:00Z'))).toBe('תשפ״ז')
    expect(hebrewYearLabel(new Date('2027-10-02T12:00:00Z'))).toBe('תשפ״ח')
  })
})
