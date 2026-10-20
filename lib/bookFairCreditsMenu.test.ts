import { describe, it, expect } from 'vitest'
import { mainMenuTurn, CM_MENU, CM_INQ, CR_OK, type CreditCallContext } from './bookFairCredits'

const credit: CreditCallContext = { name: 'דוד', books: 'ספר', amountAgorot: 5000, alreadyDone: false }

describe('mainMenuTurn', () => {
  it('בלי זיכוי: תפריט עם מקש 1 בלבד, בלי אפשרות זיכויים', () => {
    const r = mainMenuTurn({}, null)
    expect(r.reply).toContain(`read=`)
    expect(r.reply).toContain('להשארת פנייה')
    expect(r.reply).not.toContain('זיכוי')
    expect(r.reply).toMatch(/,1,?[,]*&?$/)
    expect(r.action).toBeNull()
  })
  it('עם זיכוי: התפריט כולל גם 2', () => {
    const r = mainMenuTurn({}, credit)
    expect(r.reply).toContain('הקישו 2')
    expect(r.reply).toContain('1.2')
  })
  it('פנייה: קודם הקלטה, אחר כך שמירה', () => {
    const rec = mainMenuTurn({ [CM_MENU]: '1' }, null)
    expect(rec.reply).toContain(`${CM_INQ},,record`)
    expect(rec.action).toBeNull()
    const saved = mainMenuTurn({ [CM_MENU]: '1', [CM_INQ]: '/9/001.wav' }, null)
    expect(saved.action).toEqual({ kind: 'inquiry', recording: '/9/001.wav' })
  })
  it('2 עם זיכוי: הזרימה הקיימת', () => {
    const r = mainMenuTurn({ [CM_MENU]: '2' }, credit)
    expect(r.reply).toContain(CR_OK)
    expect(r.action).toEqual({ kind: 'answered' })
  })
  it('2 בלי זיכוי: לא חושף שום דבר', () => {
    const r = mainMenuTurn({ [CM_MENU]: '2' }, null)
    expect(r.reply).toContain('go_to_folder=hangup')
    expect(r.reply).not.toContain(CR_OK)
  })
})

describe('הודעת פתיחה', () => {
  it('נשמעת בתחילת התפריט לפני האפשרויות, ולא אחרי בחירה', () => {
    const r = mainMenuTurn({}, null, 'f-rec_x')
    expect(r.reply).toContain('read=f-rec_x.t-')
    expect(mainMenuTurn({ [CM_MENU]: '1' }, null, 'f-rec_x').reply).not.toContain('f-rec_x')
  })
})
