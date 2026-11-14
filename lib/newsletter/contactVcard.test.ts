import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/newsletter-contact/route'
import { mailFor } from '@/lib/departments'

describe('GET /api/newsletter-contact', () => {
  it('מחזיר vCard להורדה עם כתובת השולח', async () => {
    const res = GET(new NextRequest('http://x/api/newsletter-contact?d=mailing'))
    expect(res.headers.get('content-type')).toContain('text/vcard')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    const text = await res.text()
    expect(text).toContain('BEGIN:VCARD')
    expect(text).toContain('END:VCARD')
    expect(text).toContain(`EMAIL;TYPE=INTERNET,WORK:${mailFor('mailing').fromEmail}`)
  })
})
