import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildColumns } from '@/app/admin/beneficiaries/BeneficiariesTable'
import type { Beneficiary } from '@/types'

// 🔴 רגרסיה: שם ארוך עם תווית "חזר מבירור - בדיקה מעמיקה" נשבר לאות אחת בשורה
// והשורה נמתחה לגובה עצום — התווית (flex-none) ישבה באותה שורה עם השם,
// והתא מגדיר overflow-wrap:anywhere שמכווץ את השם עד אות אחת.
const row = {
  id: '00000000-0000-0000-0000-000000000001',
  family_name: 'קראוס',
  full_name: '(קראוס) עקיבא משה',
  eligibility_status: 'deep_review',
  lineage_link_sent_at: '2026-11-20T10:00:00Z',
  lineage_inquiry_returned_at: '2026-11-22T10:00:00Z',
  is_active: true,
} as unknown as Beneficiary

const nameCol = buildColumns(() => {}).find((c) => c.key === 'full_name')!
const html = renderToStaticMarkup(createElement('div', null, nameCol.render!(row, 0)))

describe('עמודת השם בצאצאים — שם ארוך עם תווית בירור', () => {
  it('התווית מוצגת', () => {
    expect(html).toContain('חזר מבירור - בדיקה מעמיקה')
  })

  it('התווית בשורה נפרדת מתחת לשם, לא באותה שורת flex', () => {
    expect(html).toMatch(/^<div><div class="flex flex-col/)
    const nameRow = html.slice(html.indexOf('<div class="flex w-full'), html.indexOf('animate-inquiry-blink'))
    // שורת השם נסגרת לפני שהתווית מתחילה
    expect(nameRow).toContain('קראוס) עקיבא משה</span></div>')
  })

  it('השם נשבר רק בין מילים (break-word, לא anywhere)', () => {
    expect(html).toContain('[overflow-wrap:break-word]')
    expect(html).not.toContain('overflow-wrap:anywhere')
  })

  it('רוחב המינימום של העמודה מספיק לתווית הארוכה ביותר', () => {
    expect(nameCol.minWidth).toBeGreaterThanOrEqual(200)
  })
})
