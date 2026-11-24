import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LINEAGE_FAULT_TEMPLATE, NAME_TOKEN, normalizeLineageFaultTemplate, planLineageFaultNotice, recipientNameOf, requestErrorMessage,
  type FaultRow,
} from './lineageFaultNotice'
import { lineageFaultEmail } from './lineageFaultEmail'

const row = (id: string, over: Partial<FaultRow> = {}): FaultRow => ({
  id, full_name: 'משה', family_name: 'כהן', spouse_name: null,
  email: `${id}@example.com`, lineage_node_id: `n-${id}`, ...over,
})

describe('planLineageFaultNotice', () => {
  it('מחלק לפי: כבר קיבל, בלי מייל, בלי שיוך לעץ, ולשליחה', () => {
    const plan = planLineageFaultNotice([
      row('a'),
      row('b', { email: null }),
      row('c', { email: 'לא-מייל' }),
      row('d', { lineage_node_id: null }),
      row('e'),
    ], new Set(['e']))
    expect(plan.toSend.map(r => r.id)).toEqual(['a'])
    expect(plan.noEmail.map(r => r.id)).toEqual(['b', 'c'])
    expect(plan.noLineage.map(r => r.id)).toEqual(['d'])
    expect(plan.alreadySent.map(r => r.id)).toEqual(['e'])
  })

  it('משפחה שכבר קיבלה לא נשלחת שוב גם אם אין לה מייל עכשיו', () => {
    const plan = planLineageFaultNotice([row('a', { email: null })], new Set(['a']))
    expect(plan.alreadySent).toHaveLength(1)
    expect(plan.noEmail).toHaveLength(0)
  })

  it('מנקה רווחים מהמייל', () => {
    const plan = planLineageFaultNotice([row('a', { email: '  x@y.com ' })], new Set())
    expect(plan.toSend[0].email).toBe('x@y.com')
  })
})

describe('recipientNameOf', () => {
  it('משפחה + שם בן/בת הזוג או השם המלא', () => {
    expect(recipientNameOf({ family_name: 'כהן', spouse_name: 'שרה', full_name: 'משה' })).toBe('כהן שרה')
    expect(recipientNameOf({ family_name: 'כהן', spouse_name: null, full_name: 'משה' })).toBe('כהן משה')
    expect(recipientNameOf({ family_name: null, spouse_name: null, full_name: null })).toBe('משפחה יקרה')
  })
})

describe('lineageFaultEmail', () => {
  it('מודיע על תקלה, כולל את הקישור, ומנקה את שם הנמען', () => {
    const m = lineageFaultEmail({ recipientName: 'כהן <b>', link: 'https://chasamsofer.co.il/lineage-review/abc' })
    expect(m.subject).toContain('תקלה בסדר הדורות')
    expect(m.html).toContain('התגלתה תקלה')
    expect(m.html).toContain('לא תהיה אפשרות לקבל את הכרטיס של מענק חג החנוכה')
    expect(m.html).toContain('https://chasamsofer.co.il/lineage-review/abc')
    expect(m.html).not.toContain('כהן <b>')
    expect(m.html).toContain('לכבוד משפחת כהן &lt;b&gt;,')
  })

  it('בונה מנוסח ערוך: נושא, כותרת, גוף, כפתור והערה', () => {
    const m = lineageFaultEmail({
      recipientName: 'לוי',
      link: 'https://chasamsofer.co.il/lineage-review/xyz',
      template: {
        subject: `עדכון ל${NAME_TOKEN}`, title: 'כותרת חדשה', bodyHtml: `<p>שלום ${NAME_TOKEN}</p><img src=x onerror="alert(1)">`,
        buttonLabel: 'לחצו כאן', note: '',
      },
    })
    expect(m.subject).toBe('עדכון ללוי')
    expect(m.html).toContain('כותרת חדשה')
    expect(m.html).toMatch(/<p[^>]*>שלום לוי<\/p>/)
    expect(m.html).toContain('לחצו כאן')
    expect(m.html).toContain('href="https://chasamsofer.co.il/lineage-review/xyz"')
    expect(m.html).not.toContain('onerror')
    expect(m.html).not.toContain('הקישור אישי ותקף')
  })
})

describe('normalizeLineageFaultTemplate', () => {
  it('שדות חובה ריקים חוזרים לברירת המחדל, הערה ריקה נשארת ריקה', () => {
    const t = normalizeLineageFaultTemplate({ subject: '  ', title: '', bodyHtml: '', buttonLabel: '', note: '' })
    expect(t).toEqual({ ...DEFAULT_LINEAGE_FAULT_TEMPLATE, note: '' })
  })

  it('מסיר מעברי שורה מהנושא ומגביל אורך', () => {
    const t = normalizeLineageFaultTemplate({ subject: 'א\nב', buttonLabel: 'x'.repeat(500) })
    expect(t.subject).toBe('א ב')
    expect(t.buttonLabel).toHaveLength(60)
    expect(t.note).toBe(DEFAULT_LINEAGE_FAULT_TEMPLATE.note)
  })

  it('קלט שאינו אובייקט מחזיר את ברירת המחדל', () => {
    expect(normalizeLineageFaultTemplate(null)).toEqual(DEFAULT_LINEAGE_FAULT_TEMPLATE)
  })
})

describe('requestErrorMessage', () => {
  it('הודעה מהשרת מוצגת כמו שהיא', () => {
    expect(requestErrorMessage(400, { error: 'שם המשפחה חסר' })).toBe('שם המשפחה חסר')
  })
  it('חסימת WAF (403 בלי JSON) מוצגת במפורש', () => {
    expect(requestErrorMessage(403, {})).toMatch(/חומת ההגנה/)
  })
  it('כשל אחר מציג את קוד התשובה', () => {
    expect(requestErrorMessage(502, null)).toMatch(/502/)
  })
})
