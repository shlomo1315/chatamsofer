import { beforeEach, describe, expect, it, vi } from 'vitest'

// גיליון היכלות: מספר רץ (פ''א, פ''ב...), קטע "הקובץ החדש" רק עם התיבה, ועריכה ידנית גוברת.
type Row = Record<string, unknown>
const tables: Record<string, Row[]> = { gilyonot_settings: [], gilyonot_issues: [] }

// מסד דמה בזיכרון: select/update/upsert/insert עם eq ו-maybeSingle
function table(name: string) {
  const rows = tables[name]
  let filters: [string, unknown][] = []
  let op: 'select' | 'update' = 'select'
  let patch: Row = {}
  const match = () => rows.filter(r => filters.every(([k, v]) => r[k] === v))
  const q: Record<string, unknown> = {
    select: () => q,
    update: (v: Row) => { op = 'update'; patch = v; return q },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return q },
    maybeSingle: async () => {
      const m = match()[0]
      if (!m) return { data: null, error: null }
      if (op === 'update') Object.assign(m, patch)
      return { data: m, error: null }
    },
    upsert: async (v: Row) => {
      const m = rows.find(r => r.key === v.key)
      if (m) Object.assign(m, v); else rows.push({ ...v })
      return { error: null }
    },
    insert: async (v: Row) => { rows.push({ ...v }); return { error: null } },
  }
  filters = []
  return q
}
const db = {
  from: (t: string) => table(t),
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({}) }) },
}

vi.mock('@/lib/apiAuth', () => ({
  requirePermission: async () => ({ userId: 'u1', email: 'me@x.co' }),
  forbidden: () => new Response(null, { status: 403 }),
  serverMisconfigured: () => new Response(null, { status: 500 }),
  getServiceClient: () => db,
}))
vi.mock('@/lib/activityLog', () => ({ logActivity: async () => {} }))

const { heichalotSubject, issueNumberLabel, getNextIssueNumber, setNextIssueNumber, advanceIssueCounter, heichalotMissingError, HEICHALOT_DIR } = await import('@/lib/gilyonotHeichalot')
const { POST } = await import('@/app/api/admin/gilyonot/issues/route')

// 18.11.2026 = ט' כסלו תשפ״ז
const DATE = new Date('2026-11-18T10:00:00Z')

describe('נושא אוטומטי', () => {
  it('מספר בגימטריה: פ\'\'א, פ\'\'ב, פ\'\'ג', () => {
    expect([81, 82, 83].map(issueNumberLabel)).toEqual(["פ''א", "פ''ב", "פ''ג"])
  })

  it('בלי התיבה: אין קטע היכלות', () => {
    const s = heichalotSubject({ number: 81, parasha: 'פרשת תולדות', heichalotNew: false, date: DATE })
    expect(s).toBe('גיליון "היכל החתם סופר", גיליון פ\'\'א, פרשת תולדות')
    expect(s).not.toContain('|')
    expect(s).not.toContain('היכלות')
  })

  it('עם התיבה: מתווסף הקובץ החדש והחודש העברי', () => {
    expect(heichalotSubject({ number: 81, parasha: 'פרשת תולדות', heichalotNew: true, date: DATE }))
      .toBe('גיליון "היכל החתם סופר", גיליון פ\'\'א, פרשת תולדות | הקובץ החדש "היכלות" - חודש כסלו')
  })

  it('פרשה בלי המילה "פרשת": היא מתווספת', () => {
    expect(heichalotSubject({ number: 82, parasha: 'ויצא', heichalotNew: false })).toContain(', פרשת ויצא')
  })
})

describe('מונה הגיליונות', () => {
  beforeEach(() => { tables.gilyonot_settings.length = 0; tables.gilyonot_issues.length = 0 })

  it('פ\'\'א -> פ\'\'ב -> פ\'\'ג, וקידום פעם אחת לגיליון', async () => {
    await setNextIssueNumber(db, 81)
    for (const id of ['a', 'b', 'c']) {
      const n = (await getNextIssueNumber(db))!
      tables.gilyonot_issues.push({ id, issue_number: n, number_counted: false })
      await advanceIssueCounter(db, id)
      await advanceIssueCounter(db, id) // שליחה כפולה/חוזרת לא מקדמת שוב
    }
    expect(tables.gilyonot_issues.map(i => i.issue_number)).toEqual([81, 82, 83])
    expect(await getNextIssueNumber(db)).toBe(84)
  })

  it('גיליון בלי מספר לא משנה את המונה', async () => {
    await setNextIssueNumber(db, 81)
    tables.gilyonot_issues.push({ id: 'x', issue_number: null, number_counted: false })
    await advanceIssueCounter(db, 'x')
    expect(await getNextIssueNumber(db)).toBe(81)
  })

  it('המונה לא יורד כששולחים גיליון ישן', async () => {
    await setNextIssueNumber(db, 90)
    tables.gilyonot_issues.push({ id: 'old', issue_number: 81, number_counted: false })
    await advanceIssueCounter(db, 'old')
    expect(await getNextIssueNumber(db)).toBe(90)
  })
})

describe('יצירת גיליון', () => {
  beforeEach(() => { tables.gilyonot_settings.length = 0; tables.gilyonot_issues.length = 0 })

  const create = (extra: Record<string, string>) => {
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array(5)], 'g.pdf', { type: 'application/pdf' }))
    fd.set('title', 'גיליון החתם סופר'); fd.set('parasha', 'פרשת תולדות')
    for (const [k, v] of Object.entries(extra)) fd.set(k, v)
    if (extra.heichalot_new) fd.set('file2', new File([new Uint8Array(7)], 'h.pdf', { type: 'application/pdf' }))
    return POST(new Request('http://x', { method: 'POST', body: fd }))
  }

  it('סימון "יש היכלות חדש" בלי קובץ: נדחה', async () => {
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array(5)], 'g.pdf', { type: 'application/pdf' }))
    fd.set('title', 'ג'); fd.set('parasha', 'תולדות'); fd.set('heichalot_new', '1')
    expect((await POST(new Request('http://x', { method: 'POST', body: fd }))).status).toBe(400)
    expect(tables.gilyonot_issues).toHaveLength(0)
  })

  it('היכלות חדש נשמר כנוכחי, ומצורף אוטומטית לגיליון הבא בלי סימון, עם הפסקה המתאימה', async () => {
    expect((await create({ heichalot_new: '1' })).status).toBe(200)
    expect((await create({})).status).toBe(200)
    const [first, second] = tables.gilyonot_issues
    expect(String(first.intro)).toContain('ראו זה חדש!')
    expect(String(second.intro)).toContain('לטובת חובבי תורת משה צירפנו שוב')
    expect(second.file2_path).toBe(first.file2_path)
    expect(String(first.file2_path).startsWith(HEICHALOT_DIR)).toBe(true)
    expect(second.heichalot_new).toBeUndefined()
  })

  it('בלי קובץ שמור ובלי סימון: נוצר בלי היכלות ובלי פסקה', async () => {
    expect((await create({})).status).toBe(200)
    expect(tables.gilyonot_issues[0].file2_path).toBeUndefined()
    expect(tables.gilyonot_issues[0].intro).toBeNull()
  })

  it('שליחה נחסמת לגיליון מסומן בלי קובץ', () => {
    expect(heichalotMissingError({ heichalot_new: true, file2_path: null })).toContain('יש היכלות חדש')
    expect(heichalotMissingError({ heichalot_new: true, file2_path: 'x' })).toBeNull()
    expect(heichalotMissingError({ heichalot_new: false, file2_path: null })).toBeNull()
  })

  it('בלי נושא ידני: נושא אוטומטי עם המספר, ועם התיבה גם קטע היכלות; יצירה לא מקדמת את המונה', async () => {
    await setNextIssueNumber(db, 81)
    expect((await create({ heichalot_new: '1' })).status).toBe(200)
    expect((await create({})).status).toBe(200)
    const [withBox, without] = tables.gilyonot_issues
    expect(String(withBox.subject)).toContain('גיליון פ\'\'א')
    expect(String(withBox.subject)).toContain('| הקובץ החדש "היכלות" - חודש ')
    expect(withBox.heichalot_new).toBe(true)
    expect(String(without.subject)).not.toContain('|')
    expect(await getNextIssueNumber(db)).toBe(81)
  })

  it('נושא ידני גובר ולא נדרס, גם עם התיבה', async () => {
    await setNextIssueNumber(db, 81)
    await create({ subject: 'הנושא שלי', heichalot_new: '1' })
    expect(tables.gilyonot_issues[0].subject).toBe('הנושא שלי')
  })
})
