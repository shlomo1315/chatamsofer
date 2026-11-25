import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const fetchRows = vi.fn()
const ingestKvitel = vi.fn()
const reprocessKvitelRequest = vi.fn()
vi.mock('./gilyonotNedarimPull', async orig => ({ ...(await orig<typeof import('./gilyonotNedarimPull')>()), fetchRows: (...a: unknown[]) => fetchRows(...a) }))
vi.mock('./kvitelIngest', () => ({ ingestKvitel: (...a: unknown[]) => ingestKvitel(...a), reprocessKvitelRequest: (...a: unknown[]) => reprocessKvitelRequest(...a) }))

import { kvitelExportLines, kvitelRequestLines, type KvitelRequestRow } from './kvitelQuery'
import { autoKvitelBody, nedarimCreatedAt, rawRowText, reprocessKvitelFromNedarim, configFields, getKvitelPullView, mapKvitelRow, pullKvitelFromNedarim, saveKvitelPullConfig, validateKvitelConfig, type KvitelNedarimConfig } from './kvitelNedarimPull'

// מסד מדומה: רק app_settings
function fakeDb(init: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]))
  const db = {
    store,
    from: () => ({
      select: () => ({ eq: (_: string, key: string) => ({ maybeSingle: async () => ({ data: store.has(key) ? { value: store.get(key) } : null }) }) }),
      upsert: async (row: { key: string; value: string }) => { store.set(row.key, row.value); return { error: null } },
    }),
  }
  return db as unknown as SupabaseClient & { store: Map<string, string> }
}

const base: KvitelNedarimConfig = {
  mosadId: '7014553', apiKey: 'npk_abcdef', tofesId: '123', contactField: 'Field1', phoneField: 'Field2', emailField: 'Field3', textField: 'Field9',
  lines: [
    { name: 'Field4', mother: 'Field5', relation: 'Field6', request: 'Field7' },
    { name: 'Field8', mother: '', relation: '', request: '' },
  ],
}

describe('kvitelNedarimPull: מיפוי רשומה', () => {
  it('שורות מובנות, שורת שם מלא וטקסט חופשי', () => {
    const p = mapKvitelRow({
      ID: '55', Field1: 'משה כהן', Field2: '050-1234567', Field3: 'Moshe@Gmail.com',
      Field4: 'יעקב', Field5: 'מרים', Field6: 'בן', Field7: 'רפואה שלמה',
      Field8: 'שרה בת רחל לזיווג', Field9: '',
    }, base)
    expect(p.sourceRef).toBe('nedarim-form:55')
    expect(p.contactName).toBe('משה כהן')
    expect(p.email).toBe('moshe@gmail.com')
    expect(p.phone).toBeTruthy()
    expect(p.lines.map(l => [l.name, l.relation, l.parentName, l.requestType])).toEqual([
      ['יעקב', 'ben', 'מרים', 'refua'], ['שרה', 'bat', 'רחל', 'zivug'],
    ])
  })

  it('רק טקסט חופשי', () => {
    const p = mapKvitelRow({ ID: '7', Field9: 'מאיר בן לאה - פרנסה' }, { ...base, lines: [] })
    expect(p.lines.map(l => [l.name, l.requestType])).toEqual([['מאיר', 'parnasa']])
  })

  it('חסר בן/בת — נקלט מסומן', () => {
    const p = mapKvitelRow({ ID: '8', Field4: 'יעקב', Field5: 'מרים', Field7: 'הצלחה' }, base)
    expect(p.lines).toHaveLength(1)
    expect(p.flags[0]).toContain('בן או בת')
  })

  it('אימות הגדרות', () => {
    expect(validateKvitelConfig(base)).toBeNull()
    expect(validateKvitelConfig({ ...base, mosadId: '12' })).toContain('7 ספרות')
    expect(validateKvitelConfig({ ...base, apiKey: 'abc' })).toContain('npk_')
    expect(validateKvitelConfig({ ...base, textField: 'Field1; drop' })).toContain('לא תקין')
    expect(validateKvitelConfig({ ...base, textField: '', lines: [] })).toContain('לפחות עמודה')
  })
})

describe('kvitelNedarimPull: הגדרות ומפתח', () => {
  it('המפתח לא חוזר במסך, ומפתח ריק שומר את הקיים', async () => {
    const db = fakeDb({ kvitel_nedarim_config: base })
    const view = await getKvitelPullView(db)
    expect(view).not.toHaveProperty('apiKey')
    expect(view.hasKey).toBe(true)
    expect(JSON.stringify(view)).not.toContain('npk_')
    expect(await saveKvitelPullConfig(db, { ...base, apiKey: '' })).toEqual({ ok: true })
    expect(JSON.parse(db.store.get('kvitel_nedarim_config')!).apiKey).toBe('npk_abcdef')
  })

  it('בלי מפתח משלו, לוקח את המפתח של הגיליונות כשהמוסד זהה', async () => {
    const db = fakeDb({ kvitel_nedarim_config: { ...base, apiKey: '' }, gilyonot_nedarim_config: { mosadId: '7014553', apiKey: 'npk_shared', tofesId: '9' } })
    const view = await getKvitelPullView(db)
    expect(view.sharedKey).toBe(true)
    const other = fakeDb({ kvitel_nedarim_config: { ...base, apiKey: '' }, gilyonot_nedarim_config: { mosadId: '7018265', apiKey: 'npk_shared', tofesId: '9' } })
    expect((await getKvitelPullView(other)).hasKey).toBe(false)
  })

  it('החלפת טופס מאפסת את המשיכה', async () => {
    const db = fakeDb({ kvitel_nedarim_config: base, kvitel_nedarim_state: { lastId: 90, totalAdded: 3 } })
    await saveKvitelPullConfig(db, { ...base, tofesId: '124' })
    expect(JSON.parse(db.store.get('kvitel_nedarim_state')!).lastId).toBe(0)
  })
})

describe('kvitelNedarimPull: המשיכה', () => {
  beforeEach(() => { fetchRows.mockReset(); ingestKvitel.mockReset() })

  it('ממשיך מה-ID האחרון, מדלג על ריקות, וסופר כפילויות', async () => {
    const db = fakeDb({ kvitel_nedarim_config: base, kvitel_nedarim_state: { lastId: 10, lastRunAt: null, lastAdded: 0, totalAdded: 4, lastError: null } })
    fetchRows.mockResolvedValueOnce({ ok: true, rows: [
      { ID: '9', Field4: 'ישן', Field5: 'ישנה', Field6: 'בן', Field7: 'הצלחה' },
      { ID: '12', Field1: 'דוד', Field4: 'יעקב', Field5: 'מרים', Field6: 'בן', Field7: 'רפואה' },
      { ID: '11', Field1: 'בלי שמות' },
      { ID: '13', Field9: 'מאיר בן לאה - פרנסה' },
    ] })
    ingestKvitel.mockResolvedValueOnce({ ok: true, requestId: 'a', status: 'pending' })
      .mockResolvedValueOnce({ ok: true, requestId: 'b', status: 'pending', duplicate: true })
    const r = await pullKvitelFromNedarim(db)
    expect(fetchRows.mock.calls[0][2]).toMatchObject({ lastId: 10 })
    expect(fetchRows.mock.calls[0][0].apiKey).toBe('npk_abcdef')
    expect(r).toMatchObject({ ok: true, added: 1, exists: 1, empty: 1, lastId: 13 })
    expect(ingestKvitel.mock.calls.map(c => c[1].sourceRef)).toEqual(['nedarim-form:12', 'nedarim-form:13'])
    expect(ingestKvitel.mock.calls[0][1].channel).toBe('nedarim')
    const st = JSON.parse(db.store.get('kvitel_nedarim_state')!)
    expect(st).toMatchObject({ lastId: 13, lastAdded: 1, totalAdded: 5, lastError: null })
  })

  it('שמירה שנכשלה עוצרת לפני הרשומה, כדי לנסות שוב', async () => {
    const db = fakeDb({ kvitel_nedarim_config: base })
    fetchRows.mockResolvedValueOnce({ ok: true, rows: [
      { ID: '1', Field9: 'מאיר בן לאה - פרנסה' }, { ID: '2', Field9: 'דוד בן חנה - פרנסה' },
    ] })
    ingestKvitel.mockResolvedValueOnce({ ok: true, requestId: 'a', status: 'review' }).mockResolvedValueOnce({ ok: false, error: 'x' })
    const r = await pullKvitelFromNedarim(db)
    expect(r).toMatchObject({ ok: false, added: 1, review: 1, lastId: 1 })
  })

  it('בלי הגדרות לא פונה לנדרים', async () => {
    const r = await pullKvitelFromNedarim(fakeDb())
    expect(r.skipped).toBe('not_configured')
    expect(fetchRows).not.toHaveBeenCalled()
  })

  it('בלי בחירת עמודות: מושך את כל העמודות ומזהה מייל, טלפון ושמות לבד', async () => {
    const auto = { ...base, contactField: '', phoneField: '', emailField: '', textField: '', lines: [] }
    expect(configFields(auto)).toHaveLength(110)
    const db = fakeDb({ kvitel_nedarim_config: auto })
    fetchRows.mockResolvedValueOnce({ ok: true, rows: [
      { ID: '5', Field1: 'דוד כהן', Field2: '050-1234567', Field3: 'a@b.co', Field4: 'יעקב בן מרים - רפואה', Field5: '18' },
    ] })
    ingestKvitel.mockResolvedValueOnce({ ok: true, requestId: 'a', status: 'pending' })
    const r = await pullKvitelFromNedarim(db)
    expect(r).toMatchObject({ ok: true, added: 1, lastId: 5 })
    const p = ingestKvitel.mock.calls[0][1]
    expect(p).toMatchObject({ sourceRef: 'nedarim-form:5', email: 'a@b.co' })
    expect(JSON.stringify(p)).toContain('יעקב')
  })
})

describe('kvitelNedarimPull: זיהוי אוטומטי', () => {
  it('מזהה מייל, טלפון וטקסט עם בן/בת, ומתעלם משאר העמודות', () => {
    expect(autoKvitelBody({ ID: '1', Field1: 'שלום', Field2: '0501234567', Field3: 'x@y.com', Field4: 'שרה בת רחל', Field7: 'משה בן לאה' }))
      .toMatchObject({ Phone: '0501234567', Mail: 'x@y.com', Comments: 'שרה בת רחל\nמשה בן לאה' })
  })

  it('עמודות נפרדות של שם, בן/בת, שם האם ובקשה, והמגיש מזוהה', () => {
    const b = autoKvitelBody({ ID: '9', Field1: 'דוד לוי', Field2: '052-1112233', Field3: 'd@l.co', Field4: 'יוסף', Field5: 'בן', Field6: 'רחל', Field7: 'רפואה שלמה' })
    expect(b).toMatchObject({ Phone: '052-1112233', Mail: 'd@l.co', name1: expect.any(String) })
    const p = mapKvitelRow({ ID: '9', Field1: 'יוסף', Field2: 'בן', Field3: 'רחל', Field4: 'רפואה שלמה', Field5: '0521112233' }, { ...base, textField: '', contactField: '', phoneField: '', emailField: '', lines: [] })
    expect(p.lines[0]).toMatchObject({ name: 'יוסף', relation: 'ben', parentName: 'רחל' })
    expect(p.phone).toBe('0521112233')
  })

  it('שם עם קו נטוי ("משה/נחמה גיטל") נקלט ולא נספר כהגשה ריקה (הגשה 4517093)', () => {
    const p = mapKvitelRow({ ID: '4517093', Field20: 'משה/נחמה גיטל', Field21: 'בן', Field22: 'חנה טובא/רייזל', Field23: '' }, { ...base, textField: '', contactField: '', phoneField: '', emailField: '', lines: [] })
    expect(p.lines).toHaveLength(1)
    expect(p.lines[0]).toMatchObject({ name: 'משה נחמה גיטל', relation: 'ben', parentName: 'חנה טובא רייזל' })
  })

  it('מועד ההגשה נלקח מ-CreatedDate של נדרים, בשעון ישראל (קיץ וחורף)', () => {
    expect(nedarimCreatedAt('24/11/2026 20:24:19')).toBe('2026-11-24T18:24:19.000Z')
    expect(nedarimCreatedAt('09/09/2026 11:34:13')).toBe('2026-09-09T08:34:13.000Z')
    expect(nedarimCreatedAt('')).toBeNull()
    expect(nedarimCreatedAt('01/01/2999 10:00:00')).toBeNull()
  })

  it('שומר את כל השורה הגולמית ללא סודות', () => {
    const t = rawRowText({ ID: '3', Field1: 'א', Field2: '', Token: 'secret', Field3: 'ב' })
    expect(t).toContain('Field1: א')
    expect(t).toContain('Field3: ב')
    expect(t).not.toContain('secret')
  })
})

describe('kvitelNedarimPull: עיבוד מחדש', () => {
  function reDb(rows: { id: string; source_ref: string }[]) {
    const q = { select: () => q, eq: () => q, like: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) } as Record<string, unknown>
    return Object.assign(fakeDb({ kvitel_nedarim_config: base }), { from: (t: string) => (t === 'kvitel_requests' ? q : fakeDb({ kvitel_nedarim_config: base }).from()) }) as unknown as SupabaseClient
  }
  beforeEach(() => { fetchRows.mockReset(); reprocessKvitelRequest.mockReset() })

  it('בלי הגדרת חיבור מחזיר שגיאה ולא נוגע בבקשות', async () => {
    const r = await reprocessKvitelFromNedarim(fakeDb())
    expect(r.ok).toBe(false)
    expect(reprocessKvitelRequest).not.toHaveBeenCalled()
  })
})

// רשומה 4498102 מנדרים ("קויטל לציון הקדוש"): "זהות כניסה" ריק, שתי שורות שם, ופרטי בקשה ארוכים.
const REQ_4498102 = 'להצלחה בכל העניינים ברו"ג ולנחת מכל יוצ"ח ושיגמור עם כל חובותיו במהרה'
const ROW_4498102 = {
  ID: '4498102', Field19: '', Field20: 'מאיר נחמיה', Field21: 'בן', Field22: 'קילה', Field23: REQ_4498102,
  Field24: 'בת', Field25: 'שרה דבורה', Field26: 'רחל',
}

// כמו ingestKvitel: השורות המפוענחות נשמרות ב-kvitel_request_lines
function savedRow(p: ReturnType<typeof mapKvitelRow>): KvitelRequestRow {
  return {
    id: 'r1', channel: 'nedarim', status: 'pending', contact_name: null, contact_phone: null, contact_email: null,
    raw_text: p.rawText, recording_url: null, note: null, submitted_at: '2026-11-19T12:35:41Z', done_at: null,
    kvitel_request_lines: p.lines.map((l, i) => ({
      id: `l${i}`, position: i, name: l.name, relation: l.relation, parent_name: l.parentName,
      request_type: l.requestType, request_note: l.requestNote ?? null, flagged: false, flag_reason: null,
    })),
  }
}

describe('kvitelNedarimPull: רשומה 4498102 מהשליפה עד הטבלה והקובץ', () => {
  const expected = [`מאיר נחמיה בן קילה - ${REQ_4498102}`, 'שרה דבורה בת רחל']

  it('בלי בחירת עמודות (זיהוי אוטומטי): פרטי הבקשה והשמות מגיעים במלואם', () => {
    const p = mapKvitelRow(ROW_4498102, { ...base, contactField: '', phoneField: '', emailField: '', textField: '', lines: [] })
    expect(p.freeText).toBe('')
    expect(p.lines[0]).toMatchObject({ name: 'מאיר נחמיה', relation: 'ben', parentName: 'קילה', requestType: 'other', requestNote: REQ_4498102 })
    expect(p.lines[1]).toMatchObject({ name: 'שרה דבורה', relation: 'bat', parentName: 'רחל' })
    const row = savedRow(p)
    expect(kvitelRequestLines(row)).toEqual(expected)   // התצוגה בטבלה
    expect(kvitelExportLines([row])).toEqual(expected)  // הקובץ
    expect(p.rawText).toContain(`Field23: ${REQ_4498102}`)
  })

  it('עם בחירת עמודות: פרטי הבקשה לא מקוצרים לסוג "הצלחה"', () => {
    const p = mapKvitelRow(ROW_4498102, {
      ...base, contactField: '', phoneField: '', emailField: '', textField: '',
      lines: [
        { name: 'Field20', relation: 'Field21', mother: 'Field22', request: 'Field23' },
        { name: 'Field25', relation: 'Field24', mother: 'Field26', request: '' },
      ],
    })
    expect(kvitelExportLines([savedRow(p)])).toEqual(expected)
  })

  it('בקשה קצרה עדיין מזוהה כסוג קבוע', () => {
    const p = mapKvitelRow({ ID: '9', Field4: 'יעקב', Field5: 'מרים', Field6: 'בן', Field7: 'לרפואה שלמה' }, { ...base, lines: [base.lines[0]] })
    expect(p.lines[0]).toMatchObject({ requestType: 'refua' })
  })
})

describe('kvitelNedarimPull: עיבוד מחדש של בקשה שנשמרה בלי פרטי הבקשה', () => {
  type L = { id: string; position: number; name: string; relation: string; parent_name: string | null; request_type: string | null; request_note: string | null }
  type R = { id: string; source_ref: string; status: string; kvitel_request_lines: L[] }
  let updates: Record<string, unknown>[] = []
  function reDb(rows: R[]) {
    const q = { select: () => q, eq: () => q, like: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) } as Record<string, unknown>
    const lines = { update: (patch: Record<string, unknown>) => ({ eq: (_: string, id: string) => ({ is: async () => { updates.push({ id, ...patch }); return { error: null } } }) }) }
    return Object.assign(fakeDb({ kvitel_nedarim_config: base }), {
      from: (t: string) => (t === 'kvitel_requests' ? q : t === 'kvitel_request_lines' ? lines : fakeDb({ kvitel_nedarim_config: base }).from()),
    }) as unknown as SupabaseClient
  }
  const line = (id: string, name: string, parent: string, note: string | null = null): L =>
    ({ id, position: 0, name, relation: 'ben', parent_name: parent, request_type: null, request_note: note })
  const row = { ID: '4498102', Field4: 'מאיר נחמיה', Field5: 'קילה', Field6: 'בן', Field7: REQ_4498102 }
  beforeEach(() => {
    updates = []
    fetchRows.mockReset(); reprocessKvitelRequest.mockReset()
    fetchRows.mockResolvedValue({ ok: true, rows: [row] })
    reprocessKvitelRequest.mockResolvedValue({ ok: true, status: 'pending', lines: 1 })
  })

  it('בקשה פתוחה: רק שדה הבקשה מתמלא בשורה הקיימת, בלי למחוק שורות ובלי לשנות סטטוס', async () => {
    const r = await reprocessKvitelFromNedarim(reDb([{ id: 'a', source_ref: 'nedarim-form:4498102', status: 'review', kvitel_request_lines: [line('l1', 'מאיר נחמיה', 'קילה')] }]))
    expect(r).toMatchObject({ ok: true, checked: 1, notes: 1, noRequest: 0 })
    expect(updates).toEqual([{ id: 'l1', request_type: 'other', request_note: REQ_4498102 }])
    expect(reprocessKvitelRequest).not.toHaveBeenCalled()
  })

  it('שם שתוקן ידנית: הבקשה נכנסת לפי המיקום כשמספר השורות זהה', async () => {
    await reprocessKvitelFromNedarim(reDb([{ id: 'a', source_ref: 'nedarim-form:4498102', status: 'pending', kvitel_request_lines: [line('l1', 'מאיר נחמי', 'קיילה')] }]))
    expect(updates).toEqual([{ id: 'l1', request_type: 'other', request_note: REQ_4498102 }])
  })

  it('אין בקשה גם בנדרים: נספר, ושום דבר לא משתנה', async () => {
    fetchRows.mockResolvedValue({ ok: true, rows: [{ ...row, Field7: '' }] })
    const r = await reprocessKvitelFromNedarim(reDb([{ id: 'a', source_ref: 'nedarim-form:4498102', status: 'review', kvitel_request_lines: [line('l1', 'מאיר נחמיה', 'קילה')] }]))
    expect(r).toMatchObject({ notes: 0, noRequest: 1 })
    expect(updates).toEqual([])
  })

  it('בקשה שכבר נשלחה או בוטלה, או שכבר יש בה פרטי בקשה, לא נוגעים בה', async () => {
    const r = await reprocessKvitelFromNedarim(reDb([
      { id: 'b', source_ref: 'nedarim-form:4498102', status: 'done', kvitel_request_lines: [line('l1', 'מאיר נחמיה', 'קילה')] },
      { id: 'x', source_ref: 'nedarim-form:4498102', status: 'cancelled', kvitel_request_lines: [line('l2', 'מאיר נחמיה', 'קילה')] },
      { id: 'c', source_ref: 'nedarim-form:4498103', status: 'pending', kvitel_request_lines: [line('l3', 'מאיר נחמיה', 'קילה', 'ידני')] },
    ]))
    expect(r.checked).toBe(0)
    expect(fetchRows).not.toHaveBeenCalled()
    expect(updates).toEqual([])
    expect(reprocessKvitelRequest).not.toHaveBeenCalled()
  })

  it('כמה בקשות נמשכות מנדרים במנה אחת, מה-ID הנמוך', async () => {
    fetchRows.mockResolvedValue({ ok: true, rows: [row, { ...row, ID: '4498110', Field7: 'לרפואה שלמה' }] })
    const r = await reprocessKvitelFromNedarim(reDb([
      { id: 'a', source_ref: 'nedarim-form:4498110', status: 'review', kvitel_request_lines: [line('l1', 'מאיר נחמיה', 'קילה')] },
      { id: 'b', source_ref: 'nedarim-form:4498102', status: 'review', kvitel_request_lines: [line('l2', 'מאיר נחמיה', 'קילה')] },
    ]))
    expect(fetchRows).toHaveBeenCalledTimes(1)
    expect(fetchRows.mock.calls[0][2]).toMatchObject({ lastId: 4498101 })
    expect(r.notes).toBe(2)
    expect(updates).toContainEqual({ id: 'l1', request_type: 'refua', request_note: null })
  })
})

describe('kvitelNedarimPull: פרטי הבקשה בעמודות הטקסט הארוך (FieldNMax)', () => {
  const auto = { ...base, contactField: '', phoneField: '', emailField: '', textField: '', lines: [] }

  it('בלי בחירת עמודות מבקשים מנדרים גם את Field1Max..Field10Max', () => {
    const f = configFields(auto)
    expect(f).toContain('Field1Max')
    expect(f).toContain('Field10Max')
    expect(f).toContain('Field100')
  })

  it('בקשה אחת בטקסט הארוך חלה על כל השמות, והשמות לא זזים', () => {
    const p = mapKvitelRow({ ID: '4521910', Field20: 'משה', Field21: 'בן', Field22: 'שרה', Field23: 'רבקה', Field24: 'בת', Field25: 'לאה', Field1Max: REQ_4498102 }, auto)
    expect(p.lines).toHaveLength(2)
    expect(p.lines[0]).toMatchObject({ name: 'משה', relation: 'ben', parentName: 'שרה', requestNote: REQ_4498102 })
    expect(p.lines[1]).toMatchObject({ name: 'רבקה', relation: 'bat', parentName: 'לאה', requestNote: REQ_4498102 })
  })

  it('בקשה לכל שם: לפי הסדר', () => {
    const p = mapKvitelRow({ ID: '1', Field20: 'משה', Field21: 'בן', Field22: 'שרה', Field23: 'רבקה', Field24: 'בת', Field25: 'לאה', Field2Max: 'לזיווג הגון בקרוב', Field1Max: REQ_4498102 }, auto)
    expect(p.lines[0]).toMatchObject({ requestNote: REQ_4498102 })
    expect(p.lines[1]).toMatchObject({ requestType: 'zivug' })
  })
})

describe('kvitelNedarimPull: השלמת שמות שחסרו בקליטה ישירה', () => {
  const RAW = 'TransactionId: T1\nname1: דוד\nmother1: לאה\nrelation1: בן\nComments: משה בן שרה\nיוסף בן רחל'
  const david = { name: 'דוד', relation: 'ben', parent_name: 'לאה', request_note: null }
  function reDb(rows: unknown[]) {
    const q = { select: () => q, eq: () => q, like: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) } as Record<string, unknown>
    return Object.assign(fakeDb({ kvitel_nedarim_config: base }), { from: (t: string) => (t === 'kvitel_requests' ? q : fakeDb({ kvitel_nedarim_config: base }).from()) }) as unknown as SupabaseClient
  }
  beforeEach(() => {
    fetchRows.mockReset(); reprocessKvitelRequest.mockReset()
    reprocessKvitelRequest.mockResolvedValue({ ok: true, status: 'pending', lines: 2 })
  })

  it('בקשה פתוחה שנקלט בה רק השם מהשדות: השמות מהטקסט החופשי מתווספים אחרי הקיים', async () => {
    const r = await reprocessKvitelFromNedarim(reDb([{ id: 'd', source_ref: 'T1', status: 'pending', raw_text: RAW, kvitel_request_lines: [david] }]))
    expect(r).toMatchObject({ ok: true, checked: 1, completed: 1 })
    const [, id, sub, opts] = reprocessKvitelRequest.mock.calls[0]
    expect(id).toBe('d')
    expect(opts).toEqual({ appendAfter: 1 })
    expect(sub.lines.map((l: { name: string }) => l.name)).toEqual(['משה', 'יוסף'])
    expect(sub).toMatchObject({ rawText: RAW, sourceRef: 'T1' })
    expect(fetchRows).not.toHaveBeenCalled()
  })

  it('בקשה שכבר שלמה, או שכבר נשלחה, לא נוגעים בה', async () => {
    const all = [david, { name: 'משה', relation: 'ben', parent_name: 'שרה', request_note: null }, { name: 'יוסף', relation: 'ben', parent_name: 'רחל', request_note: null }]
    const r = await reprocessKvitelFromNedarim(reDb([
      { id: 'e', source_ref: 'T1', status: 'pending', raw_text: RAW, kvitel_request_lines: all },
      { id: 'f', source_ref: 'T2', status: 'done', raw_text: RAW, kvitel_request_lines: [david] },
    ]))
    expect(r).toMatchObject({ ok: true, checked: 0, completed: 0 })
    expect(reprocessKvitelRequest).not.toHaveBeenCalled()
  })

  it('קליטה ישירה בלי שמות: נקלטים מהמקור השמור, בלי לפנות לנדרים', async () => {
    const r = await reprocessKvitelFromNedarim(reDb([{ id: 'g', source_ref: 'T3', status: 'review', raw_text: RAW, kvitel_request_lines: [] }]))
    expect(r).toMatchObject({ checked: 1, fixed: 1 })
    expect(reprocessKvitelRequest.mock.calls[0][2].lines).toHaveLength(3)
    expect(reprocessKvitelRequest.mock.calls[0][3]).toEqual({ appendAfter: 0 })
  })
})
