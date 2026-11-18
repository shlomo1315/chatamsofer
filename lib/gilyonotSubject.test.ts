import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const send = vi.fn(async () => ({ error: null }))
vi.mock('resend', () => ({ Resend: class { emails = { send } } }))

import { sendGilyonTest, type IssueRow } from './gilyonotSender'
import { buildGilyonHtml } from './gilyonotMail'

const db = {
  storage: { from: () => ({ download: async () => ({ data: new Blob([new Uint8Array(5)]), error: null }) }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), limit: () => ({ maybeSingle: async () => ({ data: null }) }) }), in: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
} as unknown as SupabaseClient

const issue = {
  id: '1', title: 'גיליון היכל החתם סופר', parasha: 'תולדות', subject: 'גיליון היכל החתם סופר · פרשת ויצא',
  intro: null, body_html: '<p>x</p>', design: null, file_path: 'a/b.pdf', file_name: 'b.pdf', status: 'draft',
} as IssueRow

describe('נושא ידני במייל ניסיון', () => {
  it('הנושא השמור (הידני) הוא שנשלח', async () => {
    process.env.RESEND_API_KEY = 'k'
    await sendGilyonTest(db, issue, 'a@b.co')
    const arg = (send.mock.calls[0] as unknown as [{ subject: string; html: string }])[0]
    expect(arg.subject).toBe('[ניסיון] גיליון היכל החתם סופר · פרשת ויצא')
    expect(arg.html).toContain('לאנשי הקשר שלכם')
  })
  it('שורת אנשי הקשר מופיעה רק עם כתובת שולח', () => {
    const base = { title: 'ט', parasha: 'נח', unsubscribeUrl: null }
    expect(buildGilyonHtml({ ...base, senderEmail: 'd@x.il' })).toContain('d@x.il')
    expect(buildGilyonHtml({ ...base, senderEmail: 'd@chasamsofer.info', senderName: 'היכל החתם סופר' }))
      .toContain('https://contacts.google.com/new?givenname=%D7%94%D7%99%D7%9B%D7%9C%20%D7%94%D7%97%D7%AA%D7%9D%20%D7%A1%D7%95%D7%A4%D7%A8&amp;email=d%40chasamsofer.info')
    expect(buildGilyonHtml(base)).not.toContain('אנשי הקשר')
  })
})
