import { describe, it, expect, vi, beforeEach } from 'vitest'

const marker = { value: '' }
vi.mock('@/lib/apiAuth', () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: marker.value } }) }) }),
    }),
  }),
}))
vi.mock('@/lib/creditsAnnouncement', () => ({ announcementToken: async () => 'f-rec_test' }))

import { GET } from './route'
import { NextRequest } from 'next/server'

const call = (qs: string) => GET(new NextRequest(`http://x/api/webhooks/yemot-credits?${qs}`))

describe('webhook הודעה קולית: ימות מתקשרת למספר שבשליחה', () => {
  beforeEach(() => {
    process.env.YEMOT_CREDITS_SECRET = 's3'
    marker.value = JSON.stringify({ until: new Date(Date.now() + 600000).toISOString(), phones: ['0501234567'] })
  })
  it('משמיע את ההקלטה ומנתק, בלי תפריט', async () => {
    const t = await (await call('ApiToken=s3&ApiPhone=0501234567')).text()
    expect(t).toBe('id_list_message=f-rec_test&go_to_folder=hangup&')
  })
  it('מספר שאינו ברשימה לא מקבל את ההשמעה הישירה', async () => {
    const t = await (await call('ApiToken=s3&ApiPhone=0507654321')).text()
    expect(t).not.toBe('id_list_message=f-rec_test&go_to_folder=hangup&')
  })
})
