import { describe, it, expect } from 'vitest'
import { sanitizeCampaignHtml, sanitizeCampaignPatch } from './sanitizeCampaign'

describe('sanitizeCampaignHtml', () => {
  it('משאיר עיצוב, קישורים ומשתני מיזוג', () => {
    const html = '<p style="color:red">שלום <strong>{{שם_משפחה}}</strong> <a href="https://x.co/?a=1&amp;b=2" target="_blank">כאן</a></p>{{#מוקד}}<div>{{מוקד}}</div>{{/מוקד}}'
    expect(sanitizeCampaignHtml(html)).toBe(html)
  })

  it('משאיר מייל HTML מלא עם head, style ו-doctype', () => {
    const html = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><style>td{color:#333}</style></head><body><table width="600"><tr><td>טקסט</td></tr></table></body></html>'
    const out = sanitizeCampaignHtml(html)
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out).toContain('<style>td{color:#333}</style>')
    expect(out).toContain('<table width="600">')
  })

  it('מסיר סקריפטים, מאפייני on* וקישורי javascript', () => {
    const out = sanitizeCampaignHtml('<p onclick="x()">א<script>alert(1)</script><a href=" javascript:alert(1)">ב</a><img src="x" onerror="y()"><iframe src="https://e.vil"></iframe></p>')
    expect(out).not.toMatch(/script|onclick|onerror|javascript|iframe/i)
    expect(out).toContain('א')
    expect(out).toContain('<a>ב</a>')
  })
})

describe('sanitizeCampaignPatch', () => {
  it('מנקה תוכן בלוקים וכתובות בלי לשנות את המבנה', () => {
    const patch = sanitizeCampaignPatch({
      name: 'קמפיין',
      content: { mode: 'blocks', blocks: [
        { id: '1', type: 'text', content: '<b>שלום</b><img src=x onerror=alert(1)>' },
        { id: '2', type: 'button', label: 'לחצו', url: 'javascript:alert(1)' },
        { id: '3', type: 'image', src: 'https://x.co/a.png', href: 'https://x.co' },
      ] },
      raw_html: '<p>ok</p><script>bad()</script>',
    })
    const blocks = (patch.content as { mode: string; blocks: Record<string, unknown>[] }).blocks
    expect((patch.content as { mode: string }).mode).toBe('blocks')
    expect(blocks[0].content).toBe('<b>שלום</b><img src="x" />')
    expect(blocks[1]).toEqual({ id: '2', type: 'button', label: 'לחצו', url: '' })
    expect(blocks[2].src).toBe('https://x.co/a.png')
    expect(patch.raw_html).toBe('<p>ok</p>')
    expect(patch.name).toBe('קמפיין')
  })
})
