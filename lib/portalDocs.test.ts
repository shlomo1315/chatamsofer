import { describe, it, expect } from 'vitest'
import { isOwnDoc, ownDocsOnly } from './portalDocs'

const ME = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const BASE = 'https://x.supabase.co/storage/v1/object/public/documents/'

describe('🔴 isOwnDoc', () => {
  it('נתיב שלי — יחסי או URL אחסון', () => {
    expect(isOwnDoc(`${ME}/1700-abc.pdf`, ME)).toBe(true)
    expect(isOwnDoc(`${BASE}${ME}/1700-abc.pdf`, ME)).toBe(true)
  })
  it('🔴 נתיב של משפחה אחרת ⇒ נדחה', () => {
    expect(isOwnDoc(`${OTHER}/1700-abc.pdf`, ME)).toBe(false)
    expect(isOwnDoc(`${BASE}${OTHER}/x.jpg`, ME)).toBe(false)
  })
  it('🔴 מיילים / מעבר תיקיות / קישור חיצוני ⇒ נדחה', () => {
    expect(isOwnDoc('mail/abc/0_x.pdf', ME)).toBe(false)
    expect(isOwnDoc(`${ME}/../${OTHER}/x.pdf`, ME)).toBe(false)
    expect(isOwnDoc('https://evil.example/x.pdf', ME)).toBe(false)
  })
  it('ריק ⇒ נדחה', () => {
    expect(isOwnDoc('', ME)).toBe(false)
    expect(isOwnDoc(null, ME)).toBe(false)
  })
})

describe('ownDocsOnly', () => {
  it('משאיר רק את שלי', () => {
    const out = ownDocsOnly([{ url: `${ME}/a.pdf` }, { url: `${OTHER}/b.pdf` }, null, 'x'], ME)
    expect(out).toEqual([{ url: `${ME}/a.pdf` }])
  })
})
