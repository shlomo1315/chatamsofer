import { describe, it, expect } from 'vitest'
import {
  planSync, collapseHistory, isHistoryExpired, readStateAfter, UNREAD_LABEL,
  type GmailHistoryPage,
} from './gmailHistorySync'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ הבדיקות כאן שומרות על שני דברים שכישלון בהם אינו נראה לעין:
//
//   1. נפילה להתאמה מלאה כש-historyId פג. בלעדיה המערכת נראית עובדת חודשים
//      ואז מפספסת הודעות בשקט אחרי כל הפסקה ארוכה — בדיוק כשהכי חשוב שלא.
//   2. כיווץ נכון של אותה הודעה שמופיעה בכמה רשומות היסטוריה. בלעדיו נוצר
//      מצב ביניים שגוי על המסך וקריאות מיותרות ל-Gmail.
// ─────────────────────────────────────────────────────────────────────────────

const msg = (id: string, thread = 't1') => ({ message: { id, threadId: thread } })

describe('planSync — מתי מצטבר ומתי מלא', () => {
  it('🔴 בלי סמן — התאמה מלאה, לא סנכרון ריק', () => {
    // סנכרון ראשון. "אין שינויים" כאן היה משאיר תיבה שלמה מחוץ לאינדקס.
    expect(planSync(null, [])).toEqual({ mode: 'full', reason: 'no-cursor' })
    expect(planSync('', [])).toEqual({ mode: 'full', reason: 'no-cursor' })
    expect(planSync(undefined, [])).toEqual({ mode: 'full', reason: 'no-cursor' })
  })

  it('עם סמן — מצטבר', () => {
    const plan = planSync('100', [{ history: [{ messagesAdded: [msg('m1')] }], historyId: '120' }])
    expect(plan.mode).toBe('incremental')
    if (plan.mode !== 'incremental') return
    expect(plan.changes.map(c => c.messageId)).toEqual(['m1'])
    expect(plan.nextHistoryId).toBe('120')
  })

  it('🔴 הסמן הבא נלקח מהדף האחרון ולא מהשינוי האחרון', () => {
    // Gmail מקדם את המונה גם על שינויים שאינם מעניינים אותנו. שמירת מזהה של
    // שינוי בודד הייתה גורמת לסנכרון הבא לחזור על טווח שכבר טופל.
    const plan = planSync('100', [
      { history: [{ id: '101', messagesAdded: [msg('m1')] }], historyId: '110' },
      { history: [{ id: '105', messagesAdded: [msg('m2')] }], historyId: '190' },
    ])
    if (plan.mode !== 'incremental') throw new Error('expected incremental')
    expect(plan.nextHistoryId).toBe('190')
  })

  it('אין שינויים אך יש סמן — מצטבר ריק, ולא התאמה מלאה', () => {
    const plan = planSync('100', [{ history: [], historyId: '100' }])
    expect(plan.mode).toBe('incremental')
    if (plan.mode !== 'incremental') return
    expect(plan.changes).toEqual([])
  })
})

describe('isHistoryExpired — הזיהוי שמפעיל את ההתאמה המלאה', () => {
  it('404 בכל צורה שהלקוח עוטף אותו', () => {
    expect(isHistoryExpired({ code: 404 })).toBe(true)
    expect(isHistoryExpired({ status: 404 })).toBe(true)
    expect(isHistoryExpired({ response: { status: 404 } })).toBe(true)
  })

  it('לפי נוסח ההודעה, כשהסטטוס נבלע', () => {
    expect(isHistoryExpired({ message: 'Invalid startHistoryId' })).toBe(true)
    expect(isHistoryExpired({ message: 'history is too old' })).toBe(true)
  })

  it('🔴 שגיאות אחרות אינן מפעילות התאמה מלאה', () => {
    // חשוב לא פחות: סריקה מלאה על כל תקלת רשת היא עומס מיותר על Gmail
    // ועל המכסה, ומסתירה תקלה אמיתית מאחורי "הכל מסונכרן".
    expect(isHistoryExpired({ code: 500 })).toBe(false)
    expect(isHistoryExpired({ code: 429 })).toBe(false)
    expect(isHistoryExpired({ message: 'network timeout' })).toBe(false)
    expect(isHistoryExpired(null)).toBe(false)
    expect(isHistoryExpired(undefined)).toBe(false)
  })
})

describe('collapseHistory — הודעה אחת, שינוי אחד', () => {
  it('אותה הודעה בכמה רשומות מתכווצת לאחת', () => {
    const pages: GmailHistoryPage[] = [{
      history: [
        { messagesAdded: [msg('m1')] },
        { labelsRemoved: [{ ...msg('m1'), labelIds: [UNREAD_LABEL] }] },
        { labelsAdded: [{ ...msg('m1'), labelIds: ['IMPORTANT'] }] },
      ],
    }]
    const out = collapseHistory(pages)
    expect(out).toHaveLength(1)
    expect(out[0].labelsRemoved).toEqual([UNREAD_LABEL])
    expect(out[0].labelsAdded).toEqual(['IMPORTANT'])
  })

  it('🔴 מחיקה גוברת על הכל — אין טעם למשוך הודעה שאיננה', () => {
    const out = collapseHistory([{
      history: [
        { messagesAdded: [msg('m1')] },
        { labelsAdded: [{ ...msg('m1'), labelIds: ['X'] }] },
        { messagesDeleted: [msg('m1')] },
      ],
    }])
    expect(out[0].kind).toBe('deleted')
  })

  it('הוספה גוברת על תוויות — המטא-דאטה המלאה ממילא כוללת אותן', () => {
    const out = collapseHistory([{
      history: [
        { labelsAdded: [{ ...msg('m1'), labelIds: ['X'] }] },
        { messagesAdded: [msg('m1')] },
      ],
    }])
    expect(out[0].kind).toBe('added')
  })

  it('הודעות שונות נשארות נפרדות, ו-threadId נשמר', () => {
    const out = collapseHistory([{
      history: [{ messagesAdded: [msg('m1', 'tA'), msg('m2', 'tB')] }],
    }])
    expect(out.map(c => c.messageId).sort()).toEqual(['m1', 'm2'])
    expect(out.find(c => c.messageId === 'm2')!.threadId).toBe('tB')
  })

  it('תווית כפולה אינה נרשמת פעמיים', () => {
    const out = collapseHistory([{
      history: [
        { labelsAdded: [{ ...msg('m1'), labelIds: ['X'] }] },
        { labelsAdded: [{ ...msg('m1'), labelIds: ['X', 'Y'] }] },
      ],
    }])
    expect(out[0].labelsAdded).toEqual(['X', 'Y'])
  })

  it('רשומות פגומות או ריקות אינן מפילות', () => {
    expect(collapseHistory([])).toEqual([])
    expect(collapseHistory([{}])).toEqual([])
    expect(collapseHistory([{ history: null }])).toEqual([])
    expect(collapseHistory([{ history: [{ messagesAdded: [{ message: null }] }] }])).toEqual([])
    expect(collapseHistory([{ history: [{ messagesAdded: [{ message: { id: null } }] }] }])).toEqual([])
  })
})

describe('readStateAfter — הציר שהופך את הסנכרון לדו-כיווני', () => {
  const base = { messageId: 'm', threadId: null, kind: 'labels' as const }

  it('הורדת UNREAD = נקרא', () => {
    expect(readStateAfter({ ...base, labelsAdded: [], labelsRemoved: [UNREAD_LABEL] })).toBe(true)
  })

  it('הוספת UNREAD = סומן כלא-נקרא', () => {
    expect(readStateAfter({ ...base, labelsAdded: [UNREAD_LABEL], labelsRemoved: [] })).toBe(false)
  })

  it('שינוי שאינו נוגע בנקרא — לא משנים כלום', () => {
    // ⚠️ null ולא false: ברירת מחדל שגויה כאן הייתה מסמנת הודעות כלא-נקראות
    // בכל שינוי תווית אקראי.
    expect(readStateAfter({ ...base, labelsAdded: ['IMPORTANT'], labelsRemoved: [] })).toBeNull()
    expect(readStateAfter({ ...base, labelsAdded: [], labelsRemoved: [] })).toBeNull()
  })
})
