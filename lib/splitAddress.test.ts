import { describe, it, expect } from 'vitest'
import { splitAddress } from './splitAddress'

const BB = ['רח 282', 'רח 288', 'רח 293', 'סם רחל', 'רבי עקיבא', '339']

describe('splitAddress', () => {
  it('רחוב ששמו מסתיים במספר נשמר שלם (רח 288)', () => {
    expect(splitAddress('רח 288 339/3', BB)).toEqual({ street: 'רח 288', houseNumber: '339', apartment: '3' })
    expect(splitAddress('רח 288 339', BB)).toEqual({ street: 'רח 288', houseNumber: '339', apartment: '' })
  })

  it('רחוב שכולו מספר', () => {
    expect(splitAddress('339 12/4', BB)).toEqual({ street: '339', houseNumber: '12', apartment: '4' })
  })

  it('רחוב רגיל', () => {
    expect(splitAddress('רבי עקיבא 12/3', BB)).toEqual({ street: 'רבי עקיבא', houseNumber: '12', apartment: '3' })
  })

  it('רחוב בלי מספר בית', () => {
    expect(splitAddress('רח 288', BB)).toEqual({ street: 'רח 288', houseNumber: '', apartment: '' })
  })

  it('עדיפות לרחוב שמשאיר מספר בית תקין', () => {
    expect(splitAddress('X 5 7', ['X', 'X 5'])).toEqual({ street: 'X 5', houseNumber: '7', apartment: '' })
    expect(splitAddress('X 5', ['X', 'X 5'])).toEqual({ street: 'X', houseNumber: '5', apartment: '' })
  })

  it('בלי רשימה — חוזר ל-regex', () => {
    expect(splitAddress('הרצל 12/3')).toEqual({ street: 'הרצל', houseNumber: '12', apartment: '3' })
    expect(splitAddress('339 12')).toEqual({ street: '339', houseNumber: '12', apartment: '' })
    expect(splitAddress('12')).toEqual({ street: '12', houseNumber: '', apartment: '' })
    expect(splitAddress('')).toEqual({ street: '', houseNumber: '', apartment: '' })
  })

  it('רחוב שאינו ברשימה — regex (השרת ידחה אותו בבדיקת הרשימה)', () => {
    expect(splitAddress('רחוב מומצא 5', BB)).toEqual({ street: 'רחוב מומצא', houseNumber: '5', apartment: '' })
  })
})
