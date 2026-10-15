import { describe, expect, it } from 'vitest'
import { DM_GUESTS, DM_LEAVE, DM_MENU, DM_PICK, DM_QTY, DM_REC, distributorPhoneTurn, type PhoneContext, type PhoneDistributor } from './gilyonotDistributorPhone'

const d1: PhoneDistributor = { id: 'd1', full_name: 'משה כהן', quantity: 40, city: 'בני ברק', synagogue: 'אהל משה' }
const d2: PhoneDistributor = { id: 'd2', full_name: 'משה כהן', quantity: 10, city: 'אלעד', synagogue: 'זכרון משה' }
const ctx = (p: Partial<PhoneContext> = {}): PhoneContext => ({ distributors: [d1], hasPhone: true, agentPhone: '03-1234567', agentOpen: false, ...p })

describe('שלוחת המפיצים', () => {
  it('מפיץ מוכר שומע את הכמות ואת התפריט', () => {
    const r = distributorPhoneTurn({}, ctx())
    expect(r.reply).toMatch(new RegExp(`^read=.*40 גיליונות.*=${DM_MENU},`))
    expect(r.action).toBeNull()
  })

  it('כמה מקומות: קודם בוחרים מקום, ואז הפעולה על המקום שנבחר', () => {
    expect(distributorPhoneTurn({}, ctx({ distributors: [d1, d2] })).reply).toContain(`=${DM_PICK},`)
    const r = distributorPhoneTurn({ [DM_PICK]: '2', [DM_MENU]: '1', [DM_QTY]: '10' }, ctx({ distributors: [d1, d2] }))
    expect(r.action).toEqual({ kind: 'quantity', distributorId: 'd2', action: 'received', quantity: 10 })
  })

  it('קבלה: שואל כמות ואז רושם', () => {
    expect(distributorPhoneTurn({ [DM_MENU]: '1' }, ctx()).reply).toContain(`=${DM_QTY},`)
    expect(distributorPhoneTurn({ [DM_MENU]: '1', [DM_QTY]: '35' }, ctx()).action).toEqual({ kind: 'quantity', distributorId: 'd1', action: 'received', quantity: 35 })
  })

  it('תוספת והפחתה חייבות לשנות לכיוון הנכון', () => {
    expect(distributorPhoneTurn({ [DM_MENU]: '3', [DM_QTY]: '30' }, ctx()).action).toBeNull()
    expect(distributorPhoneTurn({ [DM_MENU]: '3', [DM_QTY]: '60' }, ctx()).action).toMatchObject({ action: 'increase', quantity: 60 })
    expect(distributorPhoneTurn({ [DM_MENU]: '4', [DM_QTY]: '50' }, ctx()).action).toBeNull()
    expect(distributorPhoneTurn({ [DM_MENU]: '4', [DM_QTY]: '20' }, ctx()).action).toMatchObject({ action: 'decrease', quantity: 20 })
  })

  it('כתובת: הקלטה עם תמלול; הקשות במקום הקלטה לא נרשמות', () => {
    expect(distributorPhoneTurn({ [DM_MENU]: '5' }, ctx()).reply).toContain(`=${DM_REC},,record,`)
    const r = distributorPhoneTurn({ [DM_MENU]: '5', [DM_REC]: '/ApiFiles/a.wav', [`${DM_REC}_voice`]: 'רחוב רבי עקיבא 5' }, ctx())
    expect(r.action).toEqual({ kind: 'recording', distributorId: 'd1', purpose: 'address', path: '/ApiFiles/a.wav', transcript: 'רחוב רבי עקיבא 5' })
    expect(distributorPhoneTurn({ [DM_MENU]: '5', [DM_REC]: 'Digits-12' }, ctx()).action).toBeNull()
  })

  it('התנתקות רק אחרי אישור 1', () => {
    expect(distributorPhoneTurn({ [DM_MENU]: '6' }, ctx()).reply).toContain(`=${DM_LEAVE},`)
    expect(distributorPhoneTurn({ [DM_MENU]: '6', [DM_LEAVE]: '2' }, ctx()).action).toBeNull()
    expect(distributorPhoneTurn({ [DM_MENU]: '6', [DM_LEAVE]: '1' }, ctx()).action).toEqual({ kind: 'leave', distributorId: 'd1' })
  })

  it('הילולא: מפיץ נרשם עם המזהה שלו, ומספר משתתפים מוגבל', () => {
    expect(distributorPhoneTurn({ [DM_MENU]: '7' }, ctx()).reply).toContain(`=${DM_GUESTS},`)
    expect(distributorPhoneTurn({ [DM_MENU]: '7', [DM_GUESTS]: '4' }, ctx()).action).toEqual({ kind: 'hilula', distributorId: 'd1', guests: 4 })
    expect(distributorPhoneTurn({ [DM_MENU]: '7', [DM_GUESTS]: '0' }, ctx()).action).toBeNull()
    expect(distributorPhoneTurn({ [DM_MENU]: '7', [DM_GUESTS]: '51' }, ctx()).action).toBeNull()
  })

  it('נציג: בשעות הפעילות מעביר, מחוץ להן משאירים הודעה', () => {
    expect(distributorPhoneTurn({ [DM_MENU]: '8' }, ctx({ agentOpen: true })).reply).toContain('routing_yemot=031234567')
    const off = distributorPhoneTurn({ [DM_MENU]: '8' }, ctx())
    expect(off.reply).not.toContain('routing_yemot')
    expect(off.reply).toContain(`=${DM_REC},,record,`)
    expect(distributorPhoneTurn({ [DM_MENU]: '8', [DM_REC]: '/ApiFiles/b.wav' }, ctx()).action).toMatchObject({ purpose: 'note' })
  })

  it('מתקשר לא מוכר: הילולא בלי קדימות, ונציג רק בשעות', () => {
    const unknown = ctx({ distributors: [] })
    expect(distributorPhoneTurn({}, unknown).reply).not.toContain('לשיחה עם נציג')
    expect(distributorPhoneTurn({}, { ...unknown, agentOpen: true }).reply).toContain('לשיחה עם נציג')
    expect(distributorPhoneTurn({ [DM_MENU]: '1', [DM_GUESTS]: '2' }, unknown).action).toEqual({ kind: 'hilula', distributorId: null, guests: 2 })
    expect(distributorPhoneTurn({ [DM_MENU]: '2' }, unknown).reply).not.toContain('routing_yemot')
  })

  it('מספר חסוי לא יכול להירשם להילולא', () => {
    const hidden = ctx({ distributors: [], hasPhone: false })
    expect(distributorPhoneTurn({ [DM_MENU]: '1', [DM_GUESTS]: '2' }, hidden).action).toBeNull()
    expect(distributorPhoneTurn({}, hidden).reply).toContain('go_to_folder=hangup')
  })
})
