import { describe, it, expect } from 'vitest'
import { cleanOutgoingHtml, stripInvisibleChars, preheaderHtml } from './emailSanitize'
import { buildCampaignHtml } from './newsletter/blocks'
import { shell } from './emailTemplates'

const ch = (...codes: number[]) => String.fromCharCode(...codes)
const ZWSP = ch(0x200b), WJ = ch(0x2060), BOM = ch(0xfeff)
const ZWJ = ch(0x200d), RLM = ch(0x200f), LRM = ch(0x200e), RLE = ch(0x202b), PDF = ch(0x202c)

describe('cleanOutgoingHtml', () => {
  it('מסיר רווחים ברוחב אפס, גם כתווים וגם כישויות', () => {
    const html = `<p>חנוכה${ZWSP}${ZWSP}${WJ} שמח&#8203;&#x200B;&ZeroWidthSpace;${BOM}!</p>`
    expect(cleanOutgoingHtml(html)).toBe('<p>חנוכה שמח!</p>')
  })

  it('משאיר ZWJ של אימוג׳י ותווי כיוון', () => {
    const s = `👨${ZWJ}👩${ZWJ}👧 ${RLM}שלום${LRM} ${RLE}abc${PDF}`
    expect(cleanOutgoingHtml(s)).toBe(s)
    expect(stripInvisibleChars(s)).toBe(s)
  })
})

describe('preheaderHtml', () => {
  it('ריק = בלי אלמנט נסתר בכלל', () => {
    expect(preheaderHtml('')).toBe('')
    expect(preheaderHtml('   ')).toBe('')
  })

  it('בלי גופן 1px ובלי צבע זהה לרקע', () => {
    const h = preheaderHtml('תצוגה מקדימה')
    expect(h).toContain('תצוגה מקדימה')
    expect(h).not.toMatch(/font-size:1px|color:/)
  })
})

describe('תבניות המייל', () => {
  const camouflaged = /font-size:1px;color:#eef2f7/

  it('ניוזלטר: בלוק כותרת לא עוטף בתגית h2, ואין טקסט מוסתר בצבע הרקע', () => {
    const html = buildCampaignHtml({
      mode: 'blocks', unsubscribeUrl: 'https://x/u', preheader: '',
      blocks: [{ id: '1', type: 'heading', content: 'חנוכה שמח' }],
    })
    expect(html).not.toMatch(/<h[1-6][\s>]/)
    expect(html).toContain('חנוכה שמח')
    expect(html).not.toMatch(camouflaged)
    expect(html).not.toContain('display:none')
  })

  it('המעטפת הכללית: preheader בלי הסוואה', () => {
    const html = shell({ preheader: 'שלום', accent: '#000', title: 'כותרת', subtitle: 'משנה', body: '<p>גוף</p>' })
    expect(html).not.toMatch(camouflaged)
    expect(html).toContain('שלום')
  })
})
