import { beforeEach, describe, expect, it, vi } from 'vitest'

// ספירת הורדות: המייל מכיל קישור אישי, והלחיצה עליו נרשמת ומפנה לקובץ.
const TOKEN = '3c3916f2-4a39-41c8-9c93-b1b904b754d3'
const tracked: { token: string; kind: string }[] = []
let trackResult: string | null = 'issue-1'

vi.mock('@/lib/apiAuth', () => ({
  getServiceClient: () => ({
    rpc: async (_fn: string, a: { p_token: string; p_kind: string }) => {
      tracked.push({ token: a.p_token, kind: a.p_kind })
      return { data: trackResult, error: null }
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { file_path: 'g/a.pdf', file_name: 'a.pdf', title: 'גיליון', parasha: 'וירא' } }) }) }) }),
    storage: { from: () => ({ download: async () => ({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), error: null }) }) },
  }),
}))

import { GET } from '@/app/api/gilyonot/d/[token]/route'
import { issueEmail } from '@/lib/gilyonotSender'

const ctx = (token: string) => ({ params: Promise.resolve({ token }) })

describe('קישור הורדה', () => {
  beforeEach(() => { tracked.length = 0; trackResult = 'issue-1' })

  it('הלחיצה נרשמת כהורדה ומגישה את הקובץ בשם עברי תקין', async () => {
    const res = await GET(new Request('http://x'), ctx(TOKEN))
    expect(res.status).toBe(200)
    const cd = res.headers.get('content-disposition') ?? ''
    expect(cd).toContain(`filename*=UTF-8''${encodeURIComponent('פרשת וירא.pdf')}`)
    expect(decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)![1])).toBe('פרשת וירא.pdf')
    expect(cd).not.toMatch(/filename="[^"]*%/)
    expect(await res.text()).toBe('%PDF-1.4')
    expect(tracked).toEqual([{ token: TOKEN, kind: 'download' }])
  })

  it('טוקן לא תקין או לא מוכר: 404 ובלי הפניה', async () => {
    expect((await GET(new Request('http://x'), ctx('abc'))).status).toBe(404)
    expect(tracked).toHaveLength(0)
    trackResult = null
    expect((await GET(new Request('http://x'), ctx(TOKEN))).status).toBe(404)
  })
})

describe('המייל לנמען', () => {
  const issue = { title: 'גיליון', parasha: 'וירא', intro: '', body_html: '<p>שלום</p>', design: null } as never
  it('כולל פיקסל, בלי כפתור הורדה (הקובץ מצורף), ובלי שם ובלי "לכבוד"', () => {
    const { html } = issueEmail(issue, { deliveryToken: TOKEN, subscriberToken: null })
    expect(html).not.toContain(`/api/gilyonot/d/${TOKEN}`)
    expect(html).toContain(`/api/gilyonot/o/${TOKEN}`)
    expect(html).not.toContain('להורדת הגיליון')
    expect(html).not.toContain('לכבוד')
  })
})
