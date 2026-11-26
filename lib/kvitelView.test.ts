import { describe, it, expect } from 'vitest'
import { asApproved, bulkApproval, exportLockReason, bulkApprovalMessage, byKvitelTab, countByStatus, needsApproval, nextToApprove, hebrewDay, KVITEL_DEFAULT_TAB, kvitelRowActions, kvitelRowTone, parseRawFields, patchKvitelStatus, pendingForPrint, reviewReason, scopeKvitelRows, cleanTranscript, MAX_TRANSCRIPT } from './kvitelView'
import { kvitelExportLines, type KvitelRequestRow } from './kvitelQuery'

describe('kvitelRowActions — כפתורי השורה', () => {
  it('כפתור אישור רק בבקשה לבדיקה; בבקשה שאושרה או נשלחה תווית מצב ולא כפתור מת', () => {
    expect(kvitelRowActions({ status: 'pending', needsReview: true }, true)).toEqual({ approve: 'button', edit: true, remove: true })
    expect(kvitelRowActions({ status: 'review' }, true)).toEqual({ approve: 'button', edit: true, remove: true })
    expect(kvitelRowActions({ status: 'pending' }, true)).toEqual({ approve: 'approved', edit: true, remove: true })
    expect(kvitelRowActions({ status: 'done' }, true)).toEqual({ approve: 'sent', edit: true, remove: true })
    expect(kvitelRowActions({ status: 'cancelled' }, true)).toEqual({ approve: null, edit: true, remove: false })
    expect(kvitelRowActions({ status: 'pending', needsReview: true }, false)).toEqual({ approve: null, edit: false, remove: false })
  })
})

describe('patchKvitelStatus — לחיצה על אישור', () => {
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  it('אישור בקשה לבדיקה שולח status=pending ומחזיר כמה עודכנו', async () => {
    let sent: unknown = null
    const f = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response(JSON.stringify({ ok: true, updated: 1 })) }) as unknown as typeof fetch
    expect(await patchKvitelStatus(['r1'], 'pending', f)).toEqual({ updated: 1 })
    expect(sent).toEqual({ ids: ['r1'], status: 'pending' })
  })
  it('כישלון לא שקט: שגיאת שרת, הרשאה, אפס עודכנו ואין חיבור — כולם מחזירים הודעה', async () => {
    expect(await patchKvitelStatus(['r1'], 'pending', reply(500, { error: 'העדכון נכשל' }))).toEqual({ error: 'העדכון נכשל' })
    expect(await patchKvitelStatus(['r1'], 'pending', reply(403, {}))).toEqual({ error: 'אין לך הרשאה לעדכן בקשות' })
    expect('error' in await patchKvitelStatus(['r1'], 'pending', reply(200, { ok: true, updated: 0 }))).toBe(true)
    const down = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    expect(await patchKvitelStatus(['r1'], 'pending', down)).toEqual({ error: 'העדכון נכשל: אין חיבור לשרת' })
  })
})

const line = (o: Partial<{ name: string; parent_name: string; flagged: boolean; flag_reason: string | null }> = {}) =>
  ({ id: '1', position: 0, name: 'משה', relation: 'ben', parent_name: 'שרה', request_type: 'refua', request_note: null, flagged: false, flag_reason: null, ...o })
const req = (o: Record<string, unknown> = {}) =>
  ({ contact_name: 'דוד', contact_phone: '0501234567', contact_email: null, kvitel_request_lines: [line()], ...o }) as Parameters<typeof reviewReason>[0]

describe('reviewReason', () => {
  it('בקשה תקינה', () => expect(reviewReason(req())).toBeNull())
  it('בלי שמות', () => expect(reviewReason(req({ kvitel_request_lines: [] }))).toBe('לא נקלטו שמות'))
  it('שם חסר', () => expect(reviewReason(req({ kvitel_request_lines: [line({ parent_name: '' })] }))).toBe('שם חסר'))
  it('שורה מסומנת', () => expect(reviewReason(req({ kvitel_request_lines: [line({ flagged: true, flag_reason: 'כתיב' })] }))).toBe('כתיב'))
  it('מגיש לא ידוע', () => expect(reviewReason(req({ contact_name: null, contact_phone: null }))).toBe('מגיש לא ידוע'))
})

describe('hebrewDay', () => {
  it('תאריך עברי', () => expect(hebrewDay('2026-11-05T10:00:00Z')).toBe('כ״ה חשוון'))
  it('תאריך לא תקין', () => { expect(hebrewDay('x')).toBe(''); expect(hebrewDay(null)).toBe('') })
})

it('countByStatus', () => {
  expect(countByStatus([{ status: 'review' }, { status: 'done' }, { status: 'review' }])).toEqual({ all: 3, review: 2, pending: 0, done: 1, cancelled: 0 })
})

describe('parseRawFields', () => {
  it('שדות', () => expect(parseRawFields('Field1: דוד\nField2: 050\n\nFieldX:')).toEqual([{ key: 'Field1', value: 'דוד' }, { key: 'Field2', value: '050' }]))
  it('טקסט חופשי', () => expect(parseRawFields('שלום רב')).toEqual([]))
  it('ריק', () => expect(parseRawFields(null)).toEqual([]))
})

describe('pendingForPrint', () => {
  const row = (id: string, status: string, lines = [line()]) =>
    ({ id, status, submitted_at: '2026-11-05T08:00:00Z', kvitel_request_lines: lines }) as unknown as KvitelRequestRow
  const rows = [row('a', 'pending'), row('b', 'done'), row('c', 'review'), row('d', 'pending', []), row('e', 'pending')]

  it('רק ממתינות עם שמות', () => expect(pendingForPrint(rows).map(r => r.id)).toEqual(['a', 'e']))
  it('המזהים לסימון תואמים בדיוק לשורות שהודפסו', () => {
    const list = pendingForPrint(rows)
    expect(kvitelExportLines(list)).toHaveLength(list.length)
  })
  it('אין חדשות: רשימה ריקה', () => expect(pendingForPrint([row('b', 'done')])).toEqual([]))
})

describe('cleanTranscript', () => {
  it('מנקה רווחים ומחזיר null לריק', () => {
    expect(cleanTranscript('  שלום \r\nעולם ')).toBe('שלום \nעולם')
    expect(cleanTranscript('   ')).toBeNull()
  })
  it('דוחה טקסט ארוך מדי ולא-מחרוזת', () => {
    expect(cleanTranscript('א'.repeat(MAX_TRANSCRIPT + 1))).toBeUndefined()
    expect(cleanTranscript(5)).toBeUndefined()
  })
})

describe('טבלת הבקשות במסך השבוע', () => {
  const r = (id: string, channel: string, status: string, o: Record<string, unknown> = {}) =>
    ({ id, channel, status, contact_name: 'דוד', contact_phone: '0501234567', kvitel_request_lines: [line()], ...o }) as unknown as KvitelRequestRow
  const rows = [r('a', 'email', 'pending'), r('b', 'phone', 'pending'), r('c', 'email', 'done'), r('d', 'nedarim', 'cancelled'),
    r('e', 'nedarim', 'pending', { kvitel_request_lines: [line({ name: 'יוסף', parent_name: 'מרים' })] })]
  const ids = (xs: KvitelRequestRow[]) => xs.map(x => x.id)

  it('סינון לפי מקור', () => {
    expect(ids(scopeKvitelRows(rows, { channel: 'email' }))).toEqual(['a', 'c'])
    expect(ids(scopeKvitelRows(rows, { channel: '' }))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('מקור וחיפוש יחד', () => expect(ids(scopeKvitelRows(rows, { channel: 'nedarim', q: 'מרים' }))).toEqual(['e']))
  it('ברירת המחדל: רק מה שלא נשלח לציון', () => {
    expect(KVITEL_DEFAULT_TAB).toBe('pending')
    expect(ids(byKvitelTab(rows, KVITEL_DEFAULT_TAB))).toEqual(['a', 'b', 'e'])
  })
  it('אחרי שליחה לציון הבקשה עוברת ל"נשלח" ויוצאת מברירת המחדל', () => {
    const after = rows.map(x => (x.id === 'a' ? { ...x, status: 'done' as const } : x))
    expect(ids(byKvitelTab(after, KVITEL_DEFAULT_TAB))).toEqual(['b', 'e'])
    expect(ids(byKvitelTab(after, 'done'))).toEqual(['a', 'c'])
    expect(byKvitelTab(after, 'all')).toHaveLength(5)
  })
})

describe('אישור מהיר שם אחרי שם', () => {
  const r = (id: string, status: string, needsReview = false) =>
    ({ id, channel: 'nedarim', status, needsReview, contact_name: 'דוד', kvitel_request_lines: [line()] }) as unknown as KvitelRequestRow
  const ids = (xs: KvitelRequestRow[]) => xs.map(x => x.id)

  it('לשונית "לבדיקה" מציגה רק מה שמחכה לאישור, והספירה כוללת את מה שמוצג כ"לא נשלח"', () => {
    const rows = [r('a', 'pending', true), r('b', 'pending'), r('c', 'review'), r('d', 'done')]
    expect(ids(byKvitelTab(rows, 'review'))).toEqual(['a', 'c'])
    expect(countByStatus(rows)).toMatchObject({ review: 2, pending: 2, done: 1, all: 4 })
  })

  it('הבאה בתור: אחרי הנוכחית, ואם אין — הראשונה שלפניה', () => {
    const rows = [r('a', 'pending', true), r('b', 'pending'), r('c', 'pending', true), r('d', 'pending', true)]
    expect(nextToApprove(rows, 'a')).toBe('c')
    expect(nextToApprove(rows, 'd')).toBe('a')
    expect(nextToApprove([r('a', 'pending', true)], 'a')).toBeNull()
  })

  it('אישור ברצף עובר על כל הבקשות עד שהלשונית מתרוקנת', () => {
    let rows = [r('a', 'pending', true), r('b', 'pending', true), r('c', 'pending', true)]
    const order: string[] = []
    let cur: string | null = 'a'
    while (cur) {
      const id: string = cur
      order.push(id)
      rows = rows.map(x => (x.id === id ? asApproved(x) : x))
      cur = rows.some(needsApproval) ? nextToApprove(rows, id) : null
    }
    expect(order).toEqual(['a', 'b', 'c'])
    expect(byKvitelTab(rows, 'review')).toEqual([])
    expect(ids(byKvitelTab(rows, 'pending'))).toEqual(['a', 'b', 'c'])
  })

  it('בקשה שאושרה כאן נשארת בלשונית "לבדיקה" במקומה, ומסומנת כמאושרת', () => {
    const rows = [r('a', 'pending', true), r('b', 'pending', true), r('c', 'pending')].map(x => (x.id === 'a' ? asApproved(x) : x))
    expect(ids(byKvitelTab(rows, 'review', new Set(['a'])))).toEqual(['a', 'b'])
    expect(ids(byKvitelTab(rows, 'review'))).toEqual(['b'])
    expect(ids(byKvitelTab(rows, 'pending', new Set(['a'])))).toEqual(['a', 'b', 'c'])
    expect(kvitelRowTone(rows[0])).toBe('approved')
    expect(kvitelRowTone(rows[1])).toBeNull()
  })

  it('צבע השורה נגזר מהסטטוס במסד, ולכן נשאר גם אחרי רענון', () => {
    expect(kvitelRowTone({ status: 'pending' })).toBe('approved')
    expect(kvitelRowTone({ status: 'pending', needsReview: true })).toBeNull()
    expect(kvitelRowTone({ status: 'review' })).toBeNull()
    expect(kvitelRowTone({ status: 'done' })).toBe('sent')
    expect(kvitelRowTone({ status: 'cancelled' })).toBeNull()
  })
})

describe('bulkApproval — אישור קבוצתי מהסרגל', () => {
  const r = (id: string, status: KvitelRequestRow['status'], needsReview = false) => ({ id, status, needsReview })
  it('רק בקשות לבדיקה עוברות לאישור; נשלחו, בוטלו וכבר מאושרות מדולגות', () => {
    const { todo, skipped } = bulkApproval([r('a', 'review'), r('b', 'pending', true), r('c', 'pending'), r('d', 'done', true), r('e', 'cancelled', true), r('f', 'done')])
    expect(todo.map(x => x.id)).toEqual(['a', 'b'])
    expect(skipped).toBe(4)
  })
  it('הודעה עם מספר שאושרו ומספר שדולגו', () => {
    expect(bulkApprovalMessage(3, 0)).toBe('אושרו 3 בקשות')
    expect(bulkApprovalMessage(3, 2)).toBe('אושרו 3 בקשות · 2 דולגו (כבר מאושרות, נשלחו או בוטלו)')
    expect(bulkApprovalMessage(1, 1)).toBe('אושרה בקשה אחת · 1 דולגו (כבר מאושרות, נשלחו או בוטלו)')
  })
})

describe('exportLockReason — למה "ייצוא לקוויטל" נעול', () => {
  const base = { canEdit: true, loaded: true, isCurrent: true, fileCount: 0, reviewCount: 0 }
  it('אין בקשות מאושרות אבל יש לבדיקה: מסביר שצריך לאשר', () => {
    expect(exportLockReason({ ...base, reviewCount: 348 })).toBe('הכפתור ייפתח אחרי שתאשרו בקשות: כרגע 348 בקשות מחכות לבדיקה, ובקובץ נכללות רק בקשות מאושרות.')
  })
  it('אין בקשות בכלל', () => {
    expect(exportLockReason(base)).toBe('אין השבוע בקשות מאושרות לייצוא.')
  })
  it('יש בקשות מאושרות: לא נעול', () => {
    expect(exportLockReason({ ...base, fileCount: 3, reviewCount: 5 })).toBeNull()
  })
  it('בלי הרשאה, או שבוע שכבר נשלח (מוסבר בשורה נפרדת)', () => {
    expect(exportLockReason({ ...base, fileCount: 3, canEdit: false })).toBe('אין לך הרשאה לייצא.')
    expect(exportLockReason({ ...base, fileCount: 3, isCurrent: false })).toBeNull()
  })
})
