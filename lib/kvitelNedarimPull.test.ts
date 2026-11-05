import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const fetchRows = vi.fn()
const ingestKvitel = vi.fn()
const reprocessKvitelRequest = vi.fn()
vi.mock('./gilyonotNedarimPull', async orig => ({ ...(await orig<typeof import('./gilyonotNedarimPull')>()), fetchRows: (...a: unknown[]) => fetchRows(...a) }))
vi.mock('./kvitelIngest', () => ({ ingestKvitel: (...a: unknown[]) => ingestKvitel(...a), reprocessKvitelRequest: (...a: unknown[]) => reprocessKvitelRequest(...a) }))

import { autoKvitelBody, rawRowText, reprocessKvitelFromNedarim, configFields, getKvitelPullView, mapKvitelRow, pullKvitelFromNedarim, saveKvitelPullConfig, validateKvitelConfig, type KvitelNedarimConfig } from './kvitelNedarimPull'

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
    expect(configFields(auto)).toHaveLength(100)
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
