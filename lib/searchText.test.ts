import { describe, it, expect } from 'vitest'
import { normalizeSearch, digitsQuery, digitsKey, stripInvisible } from './searchText'

describe('searchText', () => {
  it('מסיר סימני כיווניות שנדבקים בהעתקה', () => {
    expect(normalizeSearch('‎123456782‏')).toBe('123456782')
    expect(normalizeSearch('‪123456782‬ ')).toBe('123456782')
    expect(normalizeSearch('﻿כהן')).toBe('כהן')
  })
  it('רווח קשיח הופך לרווח רגיל', () => {
    expect(stripInvisible('a b')).toBe('a b')
  })
  it('מספר עם מקפים/רווחים/אפס מוביל', () => {
    expect(digitsQuery('123-456-782')).toBe('123456782')
    expect(digitsQuery('0123456782')).toBe('123456782')
    expect(digitsQuery(' 123 456 782‎')).toBe('123456782')
  })
  it('לא מספר או קצר מדי — null', () => {
    expect(digitsQuery('כהן')).toBeNull()
    expect(digitsQuery('12')).toBeNull()
    expect(digitsQuery('AB-1234567')).toBeNull()
  })
  it('digitsKey מיישר ת"ז שמורה עם אפס מוביל', () => {
    expect(digitsKey('012345678')).toBe('12345678')
    expect(digitsKey(null)).toBe('')
  })
})
