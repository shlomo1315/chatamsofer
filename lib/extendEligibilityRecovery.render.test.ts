// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }))

import ExtendEligibility from '../app/admin/maternity/ExtendEligibility'
import { StaffPermissionsProvider } from '../components/StaffPermissions'
import { recoveryWindowEnd } from './maternity'

const settle = async (fn: () => void) => { flushSync(fn); for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)) }
const btn = (label: string) => [...document.body.querySelectorAll('button')].find(b => b.textContent?.includes(label))!

let root: Root | null = null
let host: HTMLElement
afterEach(() => { root?.unmount(); root = null; host?.remove(); vi.unstubAllGlobals(); refresh.mockReset() })

// יולדת שזכאות בית ההחלמה שלה (35 יום) כבר נגמרה
const aid = { id: 'a1', birth_date: '2026-09-01', six_weeks_end: null, eligibility_extended: false, eligibility_extension_reason: null }

describe('הארכת זכאות מלשונית בית החלמה', () => {
  it('נפתח על "בית החלמה" ושולח לשרת היקף recovery', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: {
      action: 'extend', scope: 'recovery', recoveryFrom: '2026-10-06', recoveryTo: '2026-10-06', recoveryChanged: true, cardChanged: false,
    } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    host = document.createElement('div'); document.body.appendChild(host)
    root = createRoot(host)
    await settle(() => root!.render(createElement(StaffPermissionsProvider, { isAdmin: true, permissions: {} },
      createElement(ExtendEligibility, { aid, defaultScope: 'recovery' }))))

    await settle(() => btn('הארכת זכאות').click())
    // "בית החלמה" מסומן מראש (מסגרת זהב)
    expect(btn('הזכאות לשהות ולהחזר').className).toContain('border-gold')
    expect(btn('תוקף הכרטיס').className).not.toContain('border-gold')

    await settle(() => btn('המשך').click())
    await settle(() => btn('סיימתי').click())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ aidId: 'a1', action: 'extend', scope: 'recovery' })
    expect(body.endDate).toBe('2026-10-06')
    expect(refresh).toHaveBeenCalled()
    expect(document.body.textContent).toContain('ההארכה בוצעה')
  })

  it('בלי defaultScope — נשאר "שניהם" כמו בכל שאר המקומות', async () => {
    host = document.createElement('div'); document.body.appendChild(host)
    root = createRoot(host)
    await settle(() => root!.render(createElement(StaffPermissionsProvider, { isAdmin: true, permissions: {} },
      createElement(ExtendEligibility, { aid }))))
    await settle(() => btn('הארכת זכאות').click())
    expect(btn('כרטיס המזון וגם בית החלמה').className).toContain('border-gold')
  })

  it('התאריך שנשמר (recovery_end_override) הוא התאריך שמוצג בלשונית', () => {
    expect(recoveryWindowEnd({ ...aid, recovery_end_override: '2026-12-15' })?.toISOString().slice(0, 10)).toBe('2026-12-15')
  })
})
