import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/nedarim', () => ({ getClientCardFull: vi.fn() }))
import { acquireLoadGuard, tlushimOf, previousTlushStillActive } from './maternityLoadGuard'
import { getClientCardFull } from '@/lib/nedarim'

// מדמה אינדקס ייחודי חלקי: שורה פעילה אחת לכל aid
function fakeDb() {
  const active = new Set<string>()
  return { from: () => ({ insert: async (r: { aid_id: string }) => {
    await Promise.resolve()
    if (active.has(r.aid_id)) return { error: { code: '23505', message: 'dup' } }
    active.add(r.aid_id); return { error: null }
  } }) } as never
}

describe('חסם טעינה כפולה', () => {
  it('שתי טעינות מקבילות: רק אחת מקבלת את החסם', async () => {
    const db = fakeDb()
    const r = await Promise.all([acquireLoadGuard(db, 'a1'), acquireLoadGuard(db, 'a1')])
    expect(r.sort()).toEqual(['acquired', 'held'])
  })
  it('נעילה שנתקעה ופגה: ניסיון חוזר עדיין נחסם כי החסם נשאר', async () => {
    const db = fakeDb()
    expect(await acquireLoadGuard(db, 'a2')).toBe('acquired') // טעינה ראשונה נתקעה
    expect(await acquireLoadGuard(db, 'a2')).toBe('held')     // אחרי 10 דקות
  })
  it('שגיאת מסד אחרת: נכשל-סגור', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '42P01', message: 'x' } }) }) } as never
    expect(await acquireLoadGuard(db, 'a3')).toBe('error')
  })
  it('פריט יחיד מוחזר כאובייקט', () => { expect(tlushimOf({ Tlushim: { Id: 1 } })).toHaveLength(1) })
  it('תלוש קודם עדיין פעיל / לא קריא → לא טוענים', async () => {
    vi.mocked(getClientCardFull).mockResolvedValueOnce({ Tlushim: [{ Id: '55' }] } as never)
    expect(await previousTlushStillActive({} as never, 'c', '55')).toBe(true)
    vi.mocked(getClientCardFull).mockResolvedValueOnce({ Tlushim: [{ Id: '56' }] } as never)
    expect(await previousTlushStillActive({} as never, 'c', '55')).toBe(false)
    vi.mocked(getClientCardFull).mockResolvedValueOnce(null)
    expect(await previousTlushStillActive({} as never, 'c', '55')).toBeNull()
  })
})
