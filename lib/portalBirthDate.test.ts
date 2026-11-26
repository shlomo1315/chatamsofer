import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateBirthDate, formatBirthDate } from './portalBirthDate'

// מסד דמה בזיכרון: שתי משפחות בדיקה, בלי נתונים חיים
const db: Record<string, Record<string, unknown>[]> = {}
let sessionId: string | null = null

vi.mock('@/lib/portalSession', () => ({ getPortalBeneficiaryId: () => sessionId }))
vi.mock('@/lib/apiAuth', () => ({
  getServiceClient: () => ({
    from: (t: string) => {
      const rows = (db[t] ??= [])
      let patch: Record<string, unknown> | null = null
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => { patch = p; return q },
        eq: async (c: string, v: unknown) => {
          if (patch) { rows.filter(r => r[c] === v).forEach(r => Object.assign(r, patch)); return { error: null } }
          return { data: rows.find(r => r[c] === v) ?? null }
        },
      }
      // select().eq().maybeSingle()
      const sel = { eq: (c: string, v: unknown) => ({ maybeSingle: async () => ({ data: rows.find(r => r[c] === v) ?? null }) }) }
      return { select: () => sel, update: q.update }
    },
  }),
}))

import { POST } from '@/app/api/portal/birth-date/route'

const req = (body: unknown) => ({ json: async () => body }) as never
const row = (id: string) => db.beneficiaries.find(r => r.id === id)!

beforeEach(() => {
  db.beneficiaries = [
    { id: 'b1', birth_date: '1985-03-14', spouse_birth_date: null, eligibility_status: 'approved' },
    { id: 'b2', birth_date: '1970-01-01', spouse_birth_date: '1972-02-02', eligibility_status: 'approved' },
  ]
  sessionId = 'b1'
})

describe('ולידציה של תאריך לידה', () => {
  const today = new Date('2026-11-26T10:00:00Z')
  it('תאריך תקין מתקבל, גם בפורמט DD/MM/YYYY', () => {
    expect(validateBirthDate('1985-03-14', today)).toEqual({ ok: true, iso: '1985-03-14' })
    expect(validateBirthDate('14/03/1985', today)).toEqual({ ok: true, iso: '1985-03-14' })
    expect(validateBirthDate('2026-11-26', today).ok).toBe(true)
  })
  it('תאריך עתידי, לא קיים, ריק או רחוק מדי נדחה', () => {
    expect(validateBirthDate('2026-11-27', today)).toEqual({ ok: false, error: 'תאריך הלידה לא יכול להיות בעתיד' })
    expect(validateBirthDate('1985-02-30', today).ok).toBe(false)
    expect(validateBirthDate('', today).ok).toBe(false)
    expect(validateBirthDate(19850314, today).ok).toBe(false)
    expect(validateBirthDate('1900-01-01', today).ok).toBe(false)
  })
})

describe('תצוגת תאריך לידה', () => {
  it('מציג לועזי ועברי, וריק או פגום מוחזר null', () => {
    const f = formatBirthDate('1985-03-14')
    expect(f?.greg).toBe('14.03.1985')
    expect(f?.hebrew).toContain('אדר')
    expect(formatBirthDate('1985-03-14T00:00:00+00:00')?.greg).toBe('14.03.1985')
    expect(formatBirthDate(null)).toBeNull()
    expect(formatBirthDate('לא ידוע')).toBeNull()
  })
})

describe('שמירת תיקון תאריך לידה מהאזור האישי', () => {
  it('בלי סשן: 401 ולא משתנה דבר', async () => {
    sessionId = null
    expect((await POST(req({ who: 'self', birth_date: '1986-04-15' }))).status).toBe(401)
    expect(row('b1').birth_date).toBe('1985-03-14')
  })
  it('שומר את תאריך הנרשם ואת תאריך בת הזוג של המשתמש המחובר', async () => {
    const res = await POST(req({ who: 'self', birth_date: '1986-04-15' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, birth_date: '1986-04-15' })
    expect(row('b1').birth_date).toBe('1986-04-15')
    expect((await POST(req({ who: 'spouse', birth_date: '1988-09-01' }))).status).toBe(200)
    expect(row('b1').spouse_birth_date).toBe('1988-09-01')
  })
  it('אי אפשר לתקן תאריך של משפחה אחרת: מזהה בגוף הבקשה מתעלמים ממנו', async () => {
    const res = await POST(req({ who: 'self', birth_date: '1990-05-05', beneficiary_id: 'b2', id: 'b2' }))
    expect(res.status).toBe(200)
    expect(row('b2').birth_date).toBe('1970-01-01')
    expect(row('b1').birth_date).toBe('1990-05-05')
  })
  it('תאריך עתידי או שדה לא מוכר: 400 ולא נשמר', async () => {
    expect((await POST(req({ who: 'self', birth_date: '2999-01-01' }))).status).toBe(400)
    expect((await POST(req({ who: 'id_number', birth_date: '1986-04-15' }))).status).toBe(400)
    expect(row('b1').birth_date).toBe('1985-03-14')
  })
  it('חשבון שנדחה: 403', async () => {
    row('b1').eligibility_status = 'rejected'
    expect((await POST(req({ who: 'self', birth_date: '1986-04-15' }))).status).toBe(403)
    expect(row('b1').birth_date).toBe('1985-03-14')
  })
})
