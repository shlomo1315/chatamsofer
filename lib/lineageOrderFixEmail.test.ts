import { describe, it, expect } from 'vitest'
import { lineageOrderFixEmail } from './emailTemplates'

describe('lineageOrderFixEmail — נוסח מחייב', () => {
  const { subject, html } = lineageOrderFixEmail({ recipientName: 'כהן <b>', link: 'https://chasamsofer.co.il/lineage-review?t=abc' })

  it('מודיע שזוהה רישום שגוי ושלא ניתן לאשר עד לתיקון', () => {
    expect(html).toContain('המערכת האוטומטית שלנו זיהתה רישום שגוי')
    expect(html).toContain('עד לתיקון סדר הדורות הנכון, דור אחר דור עד לרבינו החתם סופר, לא נוכל לאשר את רישומכם באיגוד הצאצאים')
    expect(html).toContain('לתיקון סדר הדורות הקישו כאן')
  })

  it('לא נשאר הנוסח הרשותי הישן', () => {
    expect(html).not.toContain('נבקשכם לעבור')
    expect(html).not.toContain('במידת הצורך')
  })

  it('שאר המייל נשמר: נושא, 30 יום, אין להשיב, שם מנוקה', () => {
    expect(subject).toBe('תיקון סדר הדורות — איגוד צאצאי החתם סופר')
    expect(html).toContain('הקישור אישי ותקף 30 יום')
    expect(html).toContain('אין להשיב למייל זה')
    expect(html).toContain('כהן &lt;b&gt;')
  })
})
