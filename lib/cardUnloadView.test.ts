import { describe, it, expect } from 'vitest'
import { getCardUnloadView, getCardWalletView } from './cardUnloadView'

describe('getCardWalletView', () => {
  // המקרה מהצילום: נטען 600, קנתה 220+12+74, בנדרים נשארו 294 — ו-card_balance נשאר 600
  it('יתרה מנדרים עכשיו גוברת על card_balance שלא התעדכן', () => {
    expect(getCardWalletView({ card_load_amount: 600, card_balance: 600 }, 294))
      .toEqual({ loadedAmount: 600, balance: 294, used: 306 })
  })
  it('בלי שליפה חיה — live_balance מהרענון השעתי', () => {
    expect(getCardWalletView({ card_load_amount: '600', card_balance: '600', live_balance: '294' }))
      .toEqual({ loadedAmount: 600, balance: 294, used: 306 })
  })
  it('יתרה חיה 0 היא 0 ולא נופלת ל-card_balance', () => {
    expect(getCardWalletView({ card_load_amount: 600, card_balance: 600, live_balance: 0 }))
      .toMatchObject({ balance: 0, used: 600 })
  })
  it('אין יתרה חיה בכלל — card_balance', () => {
    expect(getCardWalletView({ card_load_amount: 600, card_balance: 600, live_balance: null }, null))
      .toMatchObject({ balance: 600, used: 0 })
  })
  it('אין שום יתרה — נוצל לא ידוע', () => {
    expect(getCardWalletView({ card_load_amount: 600 })).toEqual({ loadedAmount: 600, balance: null, used: null })
  })
})

describe('getCardUnloadView', () => {
  it('תיק שנטען רגיל — אין מצב פריקה', () => {
    expect(getCardUnloadView({ card_load_status: 'loaded', card_load_amount: 600 })).toBeNull()
  })
  it('נפרק: נוצלו = טעינה פחות סכום שנפרק', () => {
    const v = getCardUnloadView({ card_load_status: 'unloaded', card_load_amount: 600, card_unloaded_at: '2026-10-01', card_unloaded_amount: 150 })
    expect(v).toMatchObject({ unloadedAmount: 150, used: 450, fullySpent: false })
  })
  it('נוצל במלואו (0) — לא נפרק סכום', () => {
    const v = getCardUnloadView({ card_load_status: 'unloaded', card_load_amount: 600, card_unloaded_amount: 0 })
    expect(v).toMatchObject({ unloadedAmount: 0, used: 600, fullySpent: true })
  })
  it('סכום לא ידוע (null) — לא מוצג כ-0', () => {
    const v = getCardUnloadView({ card_load_status: 'unloaded', card_load_amount: 600, card_unloaded_amount: null })
    expect(v).toMatchObject({ unloadedAmount: null, used: null, fullySpent: false })
  })
  it('card_unloaded_at ישן אחרי טעינה מחדש — לא נחשב נפרק', () => {
    expect(getCardUnloadView({ card_load_status: 'loaded', card_unloaded_at: '2026-01-01' })).toBeNull()
  })
})
