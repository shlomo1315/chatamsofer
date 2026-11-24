import { describe, it, expect } from 'vitest'
import { mentionsLineageOrder, mentionsLink } from './lineageMention'

describe('mentionsLink', () => {
  it('מזהה "מצ"ב קישור" ו"לינק"', () => {
    expect(mentionsLink('נא לתקן. מצ"ב קישור')).toBe(true)
    expect(mentionsLink('שלחתי לינק')).toBe(true)
    expect(mentionsLink('בקישור הבא')).toBe(true)
  })
  it('הודעה רגילה בלי קישור', () => {
    expect(mentionsLink('נא לשלוח תעודת לידה')).toBe(false)
  })
})

describe('mentionsLineageOrder', () => {
  it('ההודעה מ-16.11 מצרפת את הקישור אוטומטית', () => {
    expect(mentionsLineageOrder('נא לתקן את סדר הדורות שוב. מצ"ב קישור')).toBe(true)
  })
})
