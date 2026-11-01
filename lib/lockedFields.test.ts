import { describe, it, expect } from 'vitest'
import { lockedFieldsInBody } from './lockedFields'

describe('lockedFieldsInBody', () => {
  it('מזהה ת"ז, דרכון ושמות', () => {
    expect(lockedFieldsInBody({ id_number: '1', passport: 'x', full_name: 'א', family_name: 'ב' }))
      .toEqual(['id_number', 'passport', 'full_name', 'family_name'])
  })
  it('שדות מותרים לא נחסמים', () => {
    expect(lockedFieldsInBody({ phone: '050', email: 'a@b.c', address: 'x', city: 'y' })).toEqual([])
  })
})
