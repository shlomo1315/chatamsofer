import { describe, it, expect } from 'vitest'
import { dirtyMessageKeys } from './dirtyMessages'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 אילו הודעות שונו ולא נשמרו.
//
// ⚠️ ההשוואה היא על *הטקסט בלבד*. שדה ה-audio משתנה מצד השרת (יצירת קול,
// העלאה, הסרה) ואינו עריכה של המשתמש — הכללתו הייתה מדליקה את סרגל
// השמירה מיד אחרי יצירת קול, על שינוי שכבר נשמר.
// ─────────────────────────────────────────────────────────────────────────────

describe('dirtyMessageKeys — אין שינוי', () => {
  it('מצב זהה', () => {
    const m = { a: { text: 'שלום' } }
    expect(dirtyMessageKeys(m, m)).toEqual([])
  })

  it('⚠️ רווחים בקצוות אינם שינוי', () => {
    expect(dirtyMessageKeys({ a: { text: ' שלום ' } }, { a: { text: 'שלום' } })).toEqual([])
  })

  it('🔴 שינוי ב-audio בלבד אינו נחשב — הוא נשמר בשרת', () => {
    const cur = { a: { text: 'שלום', audio: 'tts_a' } }
    const saved = { a: { text: 'שלום', audio: null } }
    expect(dirtyMessageKeys(cur, saved)).toEqual([])
  })

  it('שני האובייקטים ריקים', () => {
    expect(dirtyMessageKeys({}, {})).toEqual([])
  })
})

describe('dirtyMessageKeys — 🔴 יש שינוי', () => {
  it('טקסט שהשתנה', () => {
    expect(dirtyMessageKeys({ a: { text: 'חדש' } }, { a: { text: 'ישן' } })).toEqual(['a'])
  })

  it('מחזיר רק את מה שהשתנה', () => {
    const cur = { a: { text: 'חדש' }, b: { text: 'זהה' }, c: { text: 'גם חדש' } }
    const saved = { a: { text: 'ישן' }, b: { text: 'זהה' }, c: { text: 'ישן' } }
    expect(dirtyMessageKeys(cur, saved).sort()).toEqual(['a', 'c'])
  })

  it('⚠️ מפתח חדש שאין לו מקבילה שמורה', () => {
    expect(dirtyMessageKeys({ a: { text: 'חדש' } }, {})).toEqual(['a'])
  })

  it('⚠️ ניקוי טקסט לריק *כן* שינוי', () => {
    expect(dirtyMessageKeys({ a: { text: '' } }, { a: { text: 'היה' } })).toEqual(['a'])
  })
})
