import { describe, it, expect } from 'vitest'
import { personKey, type KvitelLineInput } from './kvitel'
import { RECENT_DAYS, dropDuplicateLines, reviewLines, withinOneEdit } from './kvitelReview'

const l = (name: string, parentName = 'רחל', over: Partial<KvitelLineInput> = {}): KvitelLineInput =>
  ({ name, relation: 'ben', parentName, requestType: 'refua', requestNote: null, ...over })
const ctx = (dictionary: string[] = [], recent: KvitelLineInput[] = []) =>
  ({ dictionary, recentKeys: new Set(recent.map(personKey)) })

describe('kvitelReview', () => {
  it('withinOneEdit', () => {
    expect(withinOneEdit('פעשא', 'פעשא')).toBe(true)
    expect(withinOneEdit('פעשא', 'פשא')).toBe(true)
    expect(withinOneEdit('יצחק', 'יצחאק')).toBe(true)
    expect(withinOneEdit('יצחק', 'יעקב')).toBe(false)
  })

  it('שורות תקינות לא מסומנות', () => {
    expect(reviewLines([l('מאיר', 'פעשא לאה'), l('שרה', 'רחל', { relation: 'bat' })], ctx(['מאיר', 'פעשא לאה', 'שרה', 'רחל']))).toEqual([null, null])
  })

  it('כפילות באותה הגשה ובשבוע האחרון', () => {
    expect(reviewLines([l('מאיר'), l('מאיר')], ctx())).toEqual([null, 'כפילות באותה הגשה'])
    expect(reviewLines([l('מאיר')], ctx([], [l('מאיר')]))).toEqual([`כבר הוגש ב-${RECENT_DAYS} הימים האחרונים`])
  })

  it('כתיב מול המילון — רק כשיש מילון', () => {
    expect(reviewLines([l('מאיר', 'פעשה לאה')], ctx(['פעשא לאה']))).toEqual(['כתיב: אולי "פעשא" במקום "פעשה"'])
    expect(reviewLines([l('מאיר', 'פעשה לאה')], ctx())).toEqual([null])
  })

  it('שם לא בעברית ובקשה חריגה', () => {
    expect(reviewLines([l('Meir')], ctx())).toEqual(['שם לא בעברית'])
    expect(reviewLines([l('מאיר', 'רחל', { requestType: 'other', requestNote: 'שימות השכן' })], ctx())).toEqual(['בקשה חריגה: נוסח לא מכובד'])
    expect(reviewLines([l('מאיר', 'רחל', { requestType: 'other', requestNote: 'www.x.com' })], ctx())).toEqual(['בקשה חריגה: קישור או כתובת'])
    expect(reviewLines([l('מאיר', 'רחל', { requestType: 'other', requestNote: 'לישועות' })], ctx())).toEqual([null])
  })

  it('כמה סיבות מחוברות', () => {
    expect(reviewLines([l('Meir'), l('Meir')], ctx())[1]).toBe('כפילות באותה הגשה · שם לא בעברית')
  })
})

describe('dropDuplicateLines', () => {
  it('מוחק כפילות באותה הגשה ומשאיר את הראשונה', () => {
    const r = dropDuplicateLines([l('משה'), l('דוד'), l('משה')])
    expect(r.kept.map(x => x.name)).toEqual(['משה', 'דוד'])
    expect(r.keptIndexes).toEqual([0, 1])
    expect(r.dropped).toBe(1)
  })
  it('שם אחר או שם אם אחר אינם כפילות', () => {
    expect(dropDuplicateLines([l('משה', 'רחל'), l('משה', 'לאה')]).dropped).toBe(0)
  })
  it('מוחק מול שם שכבר ממתין לשליחה', () => {
    const r = dropDuplicateLines([l('משה'), l('דוד')], new Set([personKey(l('משה'))]))
    expect(r.kept.map(x => x.name)).toEqual(['דוד'])
    expect(r.dropped).toBe(1)
  })
})
