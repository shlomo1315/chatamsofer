import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ המנוע נוגע ברשת ובמסד, ולכן הבדיקות כאן נעולות על ההכרעות שאם יישברו —
// יישברו *בשקט*: הודעות שאובדות, סמן שמתקדם מוקדם מדי, וגוף הודעה שנשמר
// למסד בניגוד לכל מה שהמעבר ל-Gmail נועד לפתור.
// ─────────────────────────────────────────────────────────────────────────────

const gmailMock = vi.hoisted(() => ({
  usersMessagesGet: vi.fn(),
  usersMessagesList: vi.fn(),
  usersHistoryList: vi.fn(),
  usersGetProfile: vi.fn(),
}))

vi.mock('./gmail', () => ({
  parseMessage: (m: { id?: string }) => ({
    id: String(m?.id ?? ''), subject: null, from: null, date: null, attachments: [],
  }),
  getGmailClientForToken: () => ({
    users: {
      messages: { get: gmailMock.usersMessagesGet, list: gmailMock.usersMessagesList },
      history: { list: gmailMock.usersHistoryList },
      getProfile: gmailMock.usersGetProfile,
    },
  }),
}))

import { syncAccount } from './gmailIndexSync'

/** מסד מדומה שמתעד כל כתיבה, כדי שאפשר יהיה לבדוק *מה* נכתב. */
function fakeDb() {
  const upserts: Record<string, unknown>[][] = []
  const updates: { table: string; patch: Record<string, unknown> }[] = []

  const chain = (table: string) => {
    const self: Record<string, unknown> = {}
    const ret = () => self
    Object.assign(self, {
      select: ret, eq: ret, in: ret, is: ret, order: ret, maybeSingle: () => ({ data: null, error: null }),
      upsert: (rows: Record<string, unknown>[]) => { upserts.push(rows); return { error: null } },
      update: (patch: Record<string, unknown>) => { updates.push({ table, patch }); return self },
      then: undefined,
    })
    // gmail_accounts.select מחזיר רשימת חשבונות למיפוי המחלקות
    if (table === 'gmail_accounts') {
      self.select = () => ({ eq: () => ({ data: [{ email: 'igud@x.com', department: 'igud' }], error: null }) })
    }
    return self
  }

  return {
    from: (t: string) => chain(t),
    upserts, updates,
    get upsertedRows() { return upserts.flat() },
  }
}

const account = (over: Record<string, unknown> = {}) => ({
  id: 'A1', email: 'igud@x.com', refresh_token: 'tok', last_history_id: null, ...over,
} as { id: string; email: string; refresh_token: string; last_history_id: string | null })

const message = (id: string, labels: string[] = []) => ({
  data: {
    id, threadId: `T-${id}`, labelIds: labels, snippet: 'תקציר',
    payload: { headers: [
      { name: 'From', value: 'שלמה <a@b.com>' },
      { name: 'To', value: 'igud@x.com' },
      { name: 'Subject', value: 'נושא' },
      { name: 'Date', value: '2026-08-12T10:00:00Z' },
    ] },
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  gmailMock.usersGetProfile.mockResolvedValue({ data: { historyId: '9000' } })
  gmailMock.usersMessagesGet.mockImplementation(({ id }: { id: string }) => Promise.resolve(message(id, ['UNREAD'])))
})

describe('🔴 האינדקס אינו עותק — הגוף לעולם אינו נשמר', () => {
  it('שורות האינדקס אינן מכילות גוף הודעה', async () => {
    // זו כל ההצדקה של המעבר. עמודת גוף הייתה הופכת את הטבלה לעותק שלישי
    // שיכול להתיישן ולסתור את Gmail.
    gmailMock.usersMessagesList.mockResolvedValue({ data: { messages: [{ id: 'm1' }, { id: 'm2' }] } })
    const db = fakeDb()
    await syncAccount(db as never, account())

    expect(db.upsertedRows.length).toBe(2)
    for (const row of db.upsertedRows) {
      for (const forbidden of ['body', 'html', 'text', 'payload', 'raw']) {
        expect(row).not.toHaveProperty(forbidden)
      }
    }
  })

  it('🔴 ההודעות נמשכות ללא הגוף (format=metadata)', async () => {
    // משיכת 'full' מביאה את הגוף לזיכרון, ומשם הדרך לשמירתו בטעות קצרה מדי.
    gmailMock.usersMessagesList.mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    await syncAccount(fakeDb() as never, account())

    const call = gmailMock.usersMessagesGet.mock.calls[0][0]
    expect(call.format).toBe('metadata')
    expect(call.format).not.toBe('full')
  })
})

describe('🔴 נפילה-לאחור כשההיסטוריה פגה', () => {
  it('404 מ-Gmail מפעיל סנכרון מלא ואינו מאבד הודעות', async () => {
    // Gmail שומר היסטוריה כשבוע. בלי המסלול הזה המערכת נראית עובדת חודשים
    // ואז מפספסת הודעות בשקט אחרי כל הפסקה ארוכה.
    gmailMock.usersHistoryList.mockRejectedValue({ code: 404 })
    gmailMock.usersMessagesList.mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })

    const db = fakeDb()
    const res = await syncAccount(db as never, account({ last_history_id: 'ישן-מדי' }))

    expect(res.mode).toBe('full')
    expect(res.upserted).toBe(1)
  })

  it('שגיאה שאינה 404 אינה גוררת סריקה מלאה', async () => {
    // כשל רשת זמני אינו סיבה לסרוק 500 הודעות מחדש.
    gmailMock.usersHistoryList.mockRejectedValue({ code: 500, message: 'server error' })
    const res = await syncAccount(fakeDb() as never, account({ last_history_id: 'H1' }))

    expect(res.mode).toBe('incremental')
    expect(res.error).toBeTruthy()
    expect(gmailMock.usersMessagesList).not.toHaveBeenCalled()
  })

  it('🔴 שגיאה אינה מקדמת את הסמן', async () => {
    // סמן שמתקדם על כישלון מדלג בשקט על כל מה שלא הוחל, ואין דרך לגלות.
    gmailMock.usersHistoryList.mockRejectedValue({ code: 500, message: 'boom' })
    const res = await syncAccount(fakeDb() as never, account({ last_history_id: 'H1' }))
    expect(res.historyId).toBe('H1')
  })
})

describe('סנכרון מלא — הסמן', () => {
  it('🔴 ה-historyId נלקח מהפרופיל אחרי הסריקה', async () => {
    // לקיחתו לפני הסריקה הייתה מדלגת על כל מה שהגיע במהלכה.
    gmailMock.usersMessagesList.mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const res = await syncAccount(fakeDb() as never, account())

    expect(res.historyId).toBe('9000')
    const listOrder = gmailMock.usersMessagesList.mock.invocationCallOrder[0]
    const profileOrder = gmailMock.usersGetProfile.mock.invocationCallOrder[0]
    expect(profileOrder).toBeGreaterThan(listOrder)
  })

  it('חשבון ללא סמן עובר לסנכרון מלא', async () => {
    gmailMock.usersMessagesList.mockResolvedValue({ data: { messages: [] } })
    const res = await syncAccount(fakeDb() as never, account({ last_history_id: null }))
    expect(res.mode).toBe('full')
    expect(gmailMock.usersHistoryList).not.toHaveBeenCalled()
  })

  it('תיבה ריקה אינה נחשבת כשל', async () => {
    gmailMock.usersMessagesList.mockResolvedValue({ data: { messages: [] } })
    const res = await syncAccount(fakeDb() as never, account())
    expect(res.error).toBeUndefined()
    expect(res.upserted).toBe(0)
  })
})

describe('סנכרון מצטבר', () => {
  it('הודעה חדשה נמשכת ונכתבת', async () => {
    gmailMock.usersHistoryList.mockResolvedValue({
      data: { history: [{ messagesAdded: [{ message: { id: 'new1', threadId: 'T1' } }] }], historyId: '5100' },
    })
    const db = fakeDb()
    const res = await syncAccount(db as never, account({ last_history_id: '5000' }))

    expect(res.mode).toBe('incremental')
    expect(res.upserted).toBe(1)
    expect(res.historyId).toBe('5100')
  })

  it('🔴 מחיקה היא רכה בלבד', async () => {
    // מחיקה קשה הייתה מוחקת את השיוך לכרטסת ואת התיעוד שנבנו על ההודעה —
    // עבודה אנושית שנמחקת בגלל לחיצה בטלפון.
    gmailMock.usersHistoryList.mockResolvedValue({
      data: { history: [{ messagesDeleted: [{ message: { id: 'gone' } }] }], historyId: '5200' },
    })
    const db = fakeDb()
    const res = await syncAccount(db as never, account({ last_history_id: '5000' }))

    expect(res.removed).toBe(1)
    const softDelete = db.updates.find(u => u.table === 'gmail_messages' && 'deleted_at' in u.patch)
    expect(softDelete).toBeTruthy()
  })

  it('🔴 הסרת UNREAD מסמנת כנקרא — הציר הדו-כיווני', async () => {
    // פתיחה בטלפון מורידה את UNREAD, וההודעה מסומנת כנקראה כאן בלי שאיש
    // לחץ דבר במערכת.
    gmailMock.usersHistoryList.mockResolvedValue({
      data: {
        history: [{ labelsRemoved: [{ message: { id: 'm1' }, labelIds: ['UNREAD'] }] }],
        historyId: '5300',
      },
    })
    const db = fakeDb()
    const res = await syncAccount(db as never, account({ last_history_id: '5000' }))

    expect(res.touched).toBe(1)
    const patch = db.updates.find(u => 'is_unread' in u.patch)?.patch
    expect(patch?.is_unread).toBe(true)
    // שינוי תווית בלבד אינו מושך את ההודעה מחדש מ-Gmail.
    expect(gmailMock.usersMessagesGet).not.toHaveBeenCalled()
  })

  it('שינוי תוויות שאינו נוגע ב-UNREAD אינו נחשב שינוי מצב', async () => {
    gmailMock.usersHistoryList.mockResolvedValue({
      data: {
        history: [{ labelsAdded: [{ message: { id: 'm1' }, labelIds: ['IMPORTANT'] }] }],
        historyId: '5400',
      },
    })
    const res = await syncAccount(fakeDb() as never, account({ last_history_id: '5000' }))
    expect(res.touched).toBe(0)
  })
})

describe('עמידות', () => {
  it('🔴 הודעה בודדת שנכשלה אינה מפילה את המנה', async () => {
    // כישלון של אחת אינו סיבה לאבד את כל השאר — היא תיקלט בסנכרון הבא.
    gmailMock.usersMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'ok1' }, { id: 'bad' }, { id: 'ok2' }] },
    })
    gmailMock.usersMessagesGet.mockImplementation(({ id }: { id: string }) =>
      id === 'bad' ? Promise.reject(new Error('נכשל')) : Promise.resolve(message(id)))

    const db = fakeDb()
    const res = await syncAccount(db as never, account())

    expect(res.upserted).toBe(2)
    const ids = db.upsertedRows.map(r => r.gmail_message_id)
    expect(ids).toContain('ok1')
    expect(ids).toContain('ok2')
    expect(ids).not.toContain('bad')
  })

  it('שיוך המחלקה נגזר מכתובת היעד', async () => {
    gmailMock.usersMessagesList.mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const db = fakeDb()
    await syncAccount(db as never, account())
    expect(db.upsertedRows[0].department).toBe('igud')
  })
})
