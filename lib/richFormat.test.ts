import { describe, it, expect } from 'vitest'
import { toggleTag, setValueTag, stepSize, toggleBold, clearFormat, setBlock, hasFormat, applyLinkTo } from './richFormat'
import { richToHtml } from './richText'

const sel = (value: string, a: string): { value: string; start: number; end: number } => {
  const start = value.indexOf(a)
  return { value, start, end: start + a.length }
}

describe('פעולות עיצוב', () => {
  it('נטוי: הדלקה וכיבוי חוזר לטקסט המקורי', () => {
    const on = toggleTag(sel('שלום עולם', 'עולם'), 'i')
    expect(on.value).toBe('שלום {i}עולם{/i}')
    expect(hasFormat(on, 'i')).toBe(true)
    expect(toggleTag(on, 'i').value).toBe('שלום עולם')
  })

  it('בחירה רב-שורתית עוטפת כל שורה בנפרד', () => {
    const r = toggleTag(sel('א\n\nב', 'א\n\nב'), 'u')
    expect(r.value).toBe('{u}א{/u}\n\n{u}ב{/u}')
  })

  it('צבע מוחלף ולא מוערם', () => {
    const a = setValueTag(sel('טקסט', 'טקסט'), 'color', '#c00')
    const b = setValueTag(a, 'color', '#0a0')
    expect(b.value).toBe('{color=#0a0}טקסט{/color}')
  })

  it('גודל: הגדלה והקטנה בצעדים', () => {
    const a = stepSize(sel('א', 'א'), 1)
    expect(a.value).toBe('{size=16}א{/size}')
    expect(stepSize(a, 1).value).toBe('{size=18}א{/size}')
    expect(stepSize(stepSize(a, -1), -1).value).toBe('{size=12}א{/size}')
  })

  it('הדגשה נדלקת ונכבית', () => {
    const on = toggleBold(sel('א ב', 'ב'))
    expect(on.value).toBe('א **ב**')
    expect(toggleBold(on).value).toBe('א ב')
  })

  it('ניקוי עיצוב מסיר הכול', () => {
    const v = '{center}{i}**א**{/i} [ק](https://a.co) {color=#c00}ב{/color}'
    expect(clearFormat({ value: v, start: 10, end: 12 }).value).toBe('א ק ב')
  })

  it('יישור ורשימה מתחלפים ומתבטלים', () => {
    const a = setBlock(sel('שלום', 'שלום'), 'center')
    expect(a.value).toBe('{center}שלום')
    expect(setBlock(a, 'center').value).toBe('שלום')
    expect(setBlock(a, 'li').value).toBe('{center}{li}שלום')
    expect(setBlock(a, 'left').value).toBe('{left}שלום')
  })

  it('קישור והתוצאה מרונדרת', () => {
    const r = applyLinkTo(sel('לחצו כאן', 'כאן'), 'https://a.co')
    expect(richToHtml(r.value)).toContain('href="https://a.co"')
  })
})

import { setBlock as _setBlock, BRAND_COLORS } from './richFormat'
import { richToHtml as _html, richToPlain as _plain } from './richText'

describe('מספור ופלטה', () => {
  it('מספור: מוסיף ומחליף תבליט', () => {
    const a = _setBlock({ value: 'א\nב', start: 0, end: 3 }, 'ol')
    expect(a.value).toBe('{ol}א\n{ol}ב')
    const b = _setBlock({ value: '{li}א', start: 0, end: 4 }, 'ol')
    expect(b.value).toBe('{ol}א')
  })
  it('רינדור מספור רציף ואיפוס', () => {
    expect(_html('{ol}א\n{ol}ב\nג\n{ol}ד')).toContain('1. א')
    expect(_html('{ol}א\n{ol}ב\nג\n{ol}ד')).toContain('2. ב')
    expect(_plain('{ol}א\n{ol}ב\nג\n{ol}ד')).toBe('1. א\n2. ב\nג\n1. ד')
  })
  it('12 צבעים, כולם hex', () => {
    expect(BRAND_COLORS).toHaveLength(12)
    BRAND_COLORS.forEach(c => expect(c).toMatch(/^#[0-9A-F]{6}$/i))
  })
  it('קישור javascript: נחסם', () => {
    const h = _html('[לחץ](javascript:alert(1))')
    expect(h).not.toMatch(/href/i)
    expect(_html('{color=red}x{/color}')).not.toContain('style')
  })
})
