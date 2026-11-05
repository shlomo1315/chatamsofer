// ה-API של לשונית טכנוליין בממשק היריד: הרשאות, ולידציה, והפרדה מוחלטת ממפתחות המרכזיה.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const requirePermission = vi.fn()
const store = new Map<string, string>()
const uploadRecording = vi.fn()
const applyTree = vi.fn()

vi.mock('@/lib/apiAuth', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  forbidden: () => new Response(JSON.stringify({ error: 'אין הרשאה' }), { status: 403 }),
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: (_c: string, key: string) => ({ maybeSingle: async () => ({ data: store.has(key) ? { value: store.get(key) } : null }) }) }),
      upsert: async (row: { key: string; value: string }) => { store.set(row.key, row.value); return { error: null } },
    }),
  }),
}))
vi.mock('@/lib/telephony/admin', () => ({
  systemStatus: (id: string) => ({ id, label: 'יריד', hasSecret: true, hasApiKey: true, hasNumber: false, missing: ['TECHNOLINE_YERID_NUMBER'] }),
  maskedUrls: (_b: string, id: string) => [{ ext: 'menu', label: 'תפריט', digit: '', url: `x/${id}/<סוד>/menu` }],
  callConfigured: () => false,
  uploadRecording: (...a: unknown[]) => uploadRecording(...a),
  applyTree: (...a: unknown[]) => applyTree(...a),
}))

const route = await import('@/app/api/admin/book-fair/technoline/route')
const { BOOK_FAIR_MSG_KEY, TECHNOLINE_YERID_MSG_KEY, BOOK_FAIR_MESSAGE_META } = await import('@/lib/bookFairPhoneMessages')

const post = (body: object) => route.POST(new NextRequest('http://x/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
const tl = () => JSON.parse(store.get(TECHNOLINE_YERID_MSG_KEY) ?? '{}')
const audioKey = BOOK_FAIR_MESSAGE_META.find((m) => m.allowAudio && !m.placeholders?.length)!.key
const varMeta = BOOK_FAIR_MESSAGE_META.find((m) => m.placeholders?.length)!

beforeEach(() => {
  store.clear()
  requirePermission.mockReset().mockResolvedValue({ userId: 's1', role: 'admin' })
  uploadRecording.mockReset().mockResolvedValue({ ok: true, data: {} })
  applyTree.mockReset().mockResolvedValue([{ ext: 'menu', label: 'תפריט', ok: true }])
})

describe('API טכנוליין של היריד', () => {
  it('GET דורש הרשאת צפייה ביריד, ומחזיר מצב בלי ערכי סודות', async () => {
    const res = await route.GET()
    expect(requirePermission).toHaveBeenCalledWith('book_fair', 'view')
    const j = await res.json()
    expect(j.status.missing).toEqual(['TECHNOLINE_YERID_NUMBER'])
    expect(j.urls[0].url).toContain('<סוד>')
    expect(j.meta.length).toBe(BOOK_FAIR_MESSAGE_META.length)
  })

  it('בלי הרשאת עריכה: 403 ושום דבר לא נשמר', async () => {
    requirePermission.mockResolvedValue(null)
    const res = await post({ action: 'messages', messages: { [audioKey]: { text: 'שלום' } } })
    expect(res.status).toBe(403)
    expect(requirePermission).toHaveBeenCalledWith('book_fair', 'edit')
    expect(store.size).toBe(0)
  })

  it('שמירת נוסח נכתבת רק למפתח של טכנוליין, ולא נוגעת בנוסחי המרכזיה', async () => {
    store.set(BOOK_FAIR_MSG_KEY, JSON.stringify({ [audioKey]: { text: 'ישן', audio: 'rec_old' } }))
    const res = await post({ action: 'messages', messages: { [audioKey]: { text: 'נוסח חדש', audio: 'injected' } } })
    expect(res.status).toBe(200)
    expect(tl()[audioKey]).toEqual({ text: 'נוסח חדש', audio: null })
    expect(JSON.parse(store.get(BOOK_FAIR_MSG_KEY)!)[audioKey].text).toBe('ישן')
  })

  it('נוסח שאיבד משתנה חובה נדחה', async () => {
    const res = await post({ action: 'messages', messages: { [varMeta.key]: { text: 'בלי משתנה' } } })
    expect(res.status).toBe(400)
    expect(store.has(TECHNOLINE_YERID_MSG_KEY)).toBe(false)
  })

  it('העתקת נוסחים קודמים מעתיקה טקסט בלבד, בלי הקלטות של המרכזיה', async () => {
    store.set(BOOK_FAIR_MSG_KEY, JSON.stringify({ [audioKey]: { text: 'מהמסד', audio: 'rec_old' } }))
    expect((await post({ action: 'import' })).status).toBe(200)
    expect(tl()[audioKey]).toEqual({ text: 'מהמסד', audio: null })
  })

  it('העלאת הקלטה עולה לשלוחת היריד בטכנוליין ונרשמת בנוסחים שלה; הסרה מוחקת אותה', async () => {
    const f = new FormData()
    f.set('key', audioKey); f.set('extensionId', '555'); f.set('file', new File([new Uint8Array([1, 2])], 'a.mp3'))
    const res = await route.POST(new NextRequest('http://x/api', { method: 'POST', body: f }))
    expect(res.status).toBe(200)
    expect(uploadRecording.mock.calls[0].slice(0, 2)).toEqual(['yerid', '555'])
    const name = uploadRecording.mock.calls[0][2] as string
    expect(name).toMatch(new RegExp(`^rec_${audioKey}_\\d+$`))
    expect(tl()[audioKey].audio).toBe(name)

    await post({ action: 'clear-audio', key: audioKey })
    expect(tl()[audioKey].audio).toBeNull()
  })

  it('קובץ שאינו שמע נדחה בלי העלאה', async () => {
    const f = new FormData()
    f.set('key', audioKey); f.set('extensionId', '555'); f.set('file', new File(['x'], 'a.exe'))
    const res = await route.POST(new NextRequest('http://x/api', { method: 'POST', body: f }))
    expect(res.status).toBe(400)
    expect(uploadRecording).not.toHaveBeenCalled()
  })

  it('בניית שלוחה רק למערכת yerid ורק עם מזהה מספרי', async () => {
    expect((await post({ action: 'tree', rootId: 'abc' })).status).toBe(400)
    await post({ action: 'tree', rootId: '123', system: 'main' })
    expect(applyTree).toHaveBeenCalledWith('yerid', '123', expect.any(String))
  })
})
