import { describe, it, expect } from 'vitest'
import { loanSiblings } from './loanSiblings'

describe('loanSiblings', () => {
  it('אמצע הרשימה', () => expect(loanSiblings(['a', 'b', 'c'], 'b')).toEqual({ prev: 'a', next: 'c' }))
  it('מעגלי בקצוות', () => {
    expect(loanSiblings(['a', 'b', 'c'], 'c')).toEqual({ prev: 'b', next: 'a' })
    expect(loanSiblings(['a', 'b', 'c'], 'a')).toEqual({ prev: 'c', next: 'b' })
  })
  it('תיק יחיד — אין לאן לנווט', () => expect(loanSiblings(['a'], 'a')).toEqual({ prev: null, next: null }))
  it('תיק שהוכרע (לא ברשימה)', () => expect(loanSiblings(['a', 'b'], 'x')).toEqual({ prev: 'b', next: 'a' }))
  it('רשימה ריקה', () => expect(loanSiblings([], 'x')).toEqual({ prev: null, next: null }))
})
