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
