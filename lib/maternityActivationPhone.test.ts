import { describe, it, expect } from 'vitest'
import { maternityCardEmail } from '@/lib/emailTemplates'

describe('מספר הפעלת הכרטיס במייל השובר', () => {
  const mail = maternityCardEmail({ full_name: 'שרה לוי' }, { centerName: 'מוקד א', phones: ['0501234567'] })
  const html = (mail as any).html as string

  it('המספר החדש מופיע בגוף המייל ומודגש', () => {
    expect(html).toContain('02-376-6363')
    expect(html).toContain('מספר הטלפון הוחלף')
  })
  it('המספר הישן לא נשאר', () => {
    expect(html).not.toContain('3131325')
  })
})

describe('חובת שובר באיסוף', () => {
  it('ההודעה מופיעה בגוף המייל', () => {
    const html = (maternityCardEmail({ full_name: 'שרה לוי' }, { centerName: 'מוקד א' }) as any).html as string
    expect(html).toContain('אין אפשרות לאסוף את הכרטיס במוקדים ללא הצגת השובר שקיבלתם במייל, ללא שובר לא יינתן כרטיס.')
  })
})

import { readFileSync } from 'fs'
describe('המספר הישן לא נשאר בטקסטים שמוצגים למשתמש', () => {
  it.each(['app/PublicPortalPage.tsx', 'app/api/portal/request-status-email/route.ts', 'lib/holidayVoucher.ts', 'lib/publicTextsReview.ts', 'lib/maternityVoucher.ts', 'lib/voucherTextsCatalog.ts'])('%s', f => {
    const s = readFileSync(f, 'utf8')
    expect(s).not.toMatch(/02-?3131325|02-313-1325|023131325/)
  })
})
