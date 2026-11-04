import { describe, it, expect } from 'vitest'
import { rewriteSupabaseUrl } from './internalFetch'

const pub = 'https://chasamsofer.co.il'
const internal = 'http://supabase.chasamsofer.internal:8000'

describe('rewriteSupabaseUrl', () => {
  it('מחליף origin בנתיבי Supabase', () => {
    expect(rewriteSupabaseUrl(`${pub}/auth/v1/token?grant_type=pkce`, pub, internal)).toBe(`${internal}/auth/v1/token?grant_type=pkce`)
    expect(rewriteSupabaseUrl(`${pub}/rest/v1/profiles?select=id`, pub, internal)).toBe(`${internal}/rest/v1/profiles?select=id`)
    expect(rewriteSupabaseUrl(`${pub}/storage/v1/object/x`, pub, internal)).toBe(`${internal}/storage/v1/object/x`)
  })
  it('לא נוגע בנתיבים אחרים של האתר', () => {
    expect(rewriteSupabaseUrl(`${pub}/api/health`, pub, internal)).toBe(`${pub}/api/health`)
    expect(rewriteSupabaseUrl(`${pub}/auth/callback`, pub, internal)).toBe(`${pub}/auth/callback`)
  })
  it('לא נוגע בדומיינים אחרים', () => {
    expect(rewriteSupabaseUrl('https://example.com/rest/v1/x', pub, internal)).toBe('https://example.com/rest/v1/x')
  })
  it('בלי משתנה פנימי אין שינוי', () => {
    expect(rewriteSupabaseUrl(`${pub}/auth/v1/user`, pub, undefined)).toBe(`${pub}/auth/v1/user`)
  })
})
