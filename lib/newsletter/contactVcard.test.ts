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

import { googleContactLink, buildCampaignHtml } from './blocks'

describe('קישור Google Contacts', () => {
  it('מקודד עברית וכתובת מייל', () => {
    expect(googleContactLink('מייל מיוזיק', 'music@mailmusic.co.il')).toBe(
      'https://contacts.google.com/new?givenname=%D7%9E%D7%99%D7%99%D7%9C%20%D7%9E%D7%99%D7%95%D7%96%D7%99%D7%A7&email=music%40mailmusic.co.il',
    )
  })
  it('התבנית כוללת את הקישור ואת גיבוי ה-vCard', () => {
    const html = buildCampaignHtml({
      mode: 'blocks', blocks: [], unsubscribeUrl: 'https://x/u',
      fromDepartment: 'mailing', fromEmail: 'a@b.co', fromName: 'שם',
    })
    expect(html).toContain('contacts.google.com/new?givenname=')
    expect(html).toContain('/api/newsletter-contact?d=mailing')
  })
})
