import { describe, it, expect } from 'vitest'
import type { KvitelLineRow, KvitelRequestRow } from './kvitelQuery'
import { duplicateIndex, findDuplicateGroups, mergedRequest, nameWords, planMerge, samePerson } from './kvitelDuplicates'

let seq = 0
const line = (person: string, over: Partial<KvitelLineRow> = {}): KvitelLineRow => {
  const [name, rel, parent] = person.split(/ (בן|בת) /)
  return {
    id: `l${++seq}`, position: 0, name, relation: rel === 'בת' ? 'bat' : 'ben', parent_name: parent ?? '',
    request_type: 'refua', request_note: null, flagged: false, flag_reason: null, ...over,
  }
}
const req = (lines: KvitelLineRow[], over: Partial<KvitelRequestRow> = {}): KvitelRequestRow => ({
  id: `r${++seq}`, channel: 'nedarim', status: 'pending', contact_name: 'מגיש', contact_phone: null, contact_email: null,
  raw_text: null, recording_url: null, note: null, submitted_at: new Date(Date.UTC(2026, 10, 1, 0, seq)).toISOString(), done_at: null,
  kvitel_request_lines: lines.map((l, i) => ({ ...l, position: i })), ...over,
})

describe('kvitelDuplicates', () => {
  it('ניקוי תארים, גרשיים, ניקוד ואותיות סופיות', () => {
    expect(nameWords('מרן אדמו"ר ישראל שליט״א')).toEqual(['ישראל'])
    expect(nameWords('כ״ק הרה"ק רבי יְשְׂרָאֵל')).toEqual(['ישראל'])
    expect(nameWords('הרב ר\' אברהם')).toEqual(['אברהמ'])
    expect(nameWords('יאיר נ"י')).toEqual(['יאיר'])
  })

  it('ישראל בן לאה אסתר בכל הצורות — קבוצה אחת', () => {
    const rows = [
      req([line('ישראל בן לאה אסתר')]),
      req([line('מרן ישראל בן לאה אסתר'), line('משה בן שרה')]),
      req([line('אדמו"ר ישראל בן לאה אסתר')], { status: 'review' }),
      req([line('כ"ק אדמו״ר ישראל הגר שליט"א בן לאה-אסתר')]),
      req([line('ישראל בן לאה  אסתר', { request_type: 'parnasa' })]),
    ]
    const groups = findDuplicateGroups(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].lines).toHaveLength(5)
    expect(groups[0].exact).toBe(false)   // "ישראל הגר" — צורה שונה
    expect(groups[0].lines[0].line.name).toBe('ישראל')   // הראשון שהוגש
  })

  it('לא מסמן אנשים שונים: שם אם אחר, בן מול בת, שם אחר, בלי שם אם', () => {
    expect(samePerson(line('ישראל בן לאה אסתר'), line('ישראל בן לאה'))).toBe(false)
    expect(samePerson(line('ישראל בן לאה'), line('ישראל בת לאה'))).toBe(false)
    expect(samePerson(line('ישראל בן לאה'), line('יעקב בן לאה'))).toBe(false)
    expect(samePerson(line('ישראל בן'), line('ישראל בן'))).toBe(false)
    expect(findDuplicateGroups([req([line('ישראל בן רחל')]), req([line('ישראל בן לאה')])])).toEqual([])
  })

  it('כתיב מלא וחסר', () => {
    expect(samePerson(line('דויד בן חיה'), line('דוד בן חייה'))).toBe(true)
  })

  it('רק בקשות שעוד לא נשלחו', () => {
    const rows = [
      req([line('ישראל בן לאה אסתר')], { status: 'done' }),
      req([line('מרן ישראל בן לאה אסתר')], { status: 'cancelled' }),
      req([line('ישראל בן לאה אסתר')]),
    ]
    expect(findDuplicateGroups(rows)).toEqual([])
  })

  it('צורות זהות אחרי ניקוי — exact, ואינדקס לפי שורה', () => {
    const a = line('ישראל בן לאה אסתר'), b = line('מרן ישראל בן לאה אסתר')
    const groups = findDuplicateGroups([req([a]), req([b])])
    expect(groups[0].exact).toBe(true)
    const idx = duplicateIndex(groups)
    expect(idx.get(a.id)).toBe(groups[0])
    expect(idx.get(b.id)).toBe(groups[0])
  })

  it('איחוד הבקשות לא מאבד אף בקשה', () => {
    const refua = { request_type: 'refua', request_note: null }
    expect(mergedRequest(refua, [refua])).toEqual({ request_type: 'refua', request_note: null })
    expect(mergedRequest({ request_type: '', request_note: null }, [refua])).toEqual({ request_type: 'refua', request_note: null })
    expect(mergedRequest(refua, [{ request_type: 'parnasa', request_note: null }, { request_type: 'other', request_note: 'אריכות ימים' }]))
      .toEqual({ request_type: 'other', request_note: 'לרפואה שלימה, פרנסה ברווח, אריכות ימים' })
    expect(mergedRequest({ request_type: 'other', request_note: 'א'.repeat(200) }, [{ request_type: 'other', request_note: 'ב'.repeat(200) }])).toHaveProperty('error')
  })
})

describe('planMerge', () => {
  it('משאיר אחת, מוחק את השאר, מבטל בקשה שהתרוקנה ומאחד בקשות', () => {
    const a = line('ישראל בן לאה אסתר'), b = line('מרן ישראל בן לאה אסתר', { request_type: 'parnasa' }), c = line('משה בן שרה')
    const ra = req([a], { contact_name: 'ראובן' }), rb = req([b]), rc = req([line('אדמו"ר ישראל בן לאה אסתר'), c])
    const d = rc.kvitel_request_lines[0]
    const plan = planMerge([ra, rb, rc], a.id, [b.id, d.id])
    if ('error' in plan) throw new Error(plan.error)
    expect(plan.keep).toEqual({ id: a.id, request_type: 'other', request_note: 'לרפואה שלימה, פרנסה ברווח' })
    expect(plan.deleteIds).toEqual([b.id, d.id])
    expect(plan.requests.find(r => r.id === rb.id)).toMatchObject({ cancel: true })
    expect(plan.requests.find(r => r.id === rc.id)).toMatchObject({ cancel: false })
    expect(plan.requests.find(r => r.id === rb.id)?.note).toContain('ראובן')
    expect(plan.removed.map(r => r.name)).toEqual(['מרן ישראל', 'אדמו"ר ישראל'])
  })
  it('מסרב לאנשים שונים, לבקשות שנשלחו ולשורות שלא קיימות', () => {
    const a = line('ישראל בן לאה'), b = line('ישראל בן רחל'), c = line('ישראל בן לאה'), e = line('מרן ישראל בן לאה')
    expect(planMerge([req([a]), req([b])], a.id, [b.id])).toHaveProperty('error')
    expect(planMerge([req([a]), req([c], { status: 'done' })], a.id, [c.id])).toHaveProperty('error')
    expect(planMerge([req([a])], a.id, ['nope'])).toHaveProperty('error')
    expect(planMerge([req([a])], a.id, [a.id])).toHaveProperty('error')
    expect(planMerge([req([a]), req([e])], a.id, [e.id])).not.toHaveProperty('error')
  })
})
