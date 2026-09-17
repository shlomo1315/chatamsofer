import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 אכיפת קבוצת הגבלת החנויות בטעינת כרטיסי החגים.
//
// ⚠️ הבאג שהבדיקות האלה שומרות עליו (16-17.09): getHolidayLimitedId החזירה
// מחרוזת ריקה כשלא הוגדרה קבוצה, ו-addTlush נשלחה עם LimitedId ריק. אצל
// נדרים תלוש בלי LimitedId ניתן למימוש **בכל בית עסק ברשת** — 3,878 טעינות
// (08.09–16.09) יצאו כך, והמשפחות קנו בחנויות שמחוץ לרשימה שהוגדרה.
//
// ⚠️ מה שהסתיר את זה: הקטגוריה "חלוקת חגים" בנדרים (Groupe) תויגה נכון,
// אבל היא תיוג לדוחות ואינה אוכפת חנויות. בממשק הכול נראה מסודר.
//
// 🔴 הכלל שנקבע כאן: בלי LimitedId הטעינה **נחסמת**, ולא יוצאת בלי אכיפה.
// שדה ריק אינו החלטה "בלי הגבלה" — הוא היעדר אכיפה.
// ─────────────────────────────────────────────────────────────────────────────

const addTlush = vi.fn()
const getHolidayLimitedId = vi.fn()

vi.mock('./nedarim', () => ({
  getHolidayNedarimCreds: async () => ({ mosadId: '7014553', apiPassword: 'pw' }),
  getHolidayLimitedId: () => getHolidayLimitedId(),
  addTlush: (...a: unknown[]) => addTlush(...a),
  findClientByZeout: async () => 'client-1',
  normalizeZeout: (s: string) => s,
  saveClientCard: async () => ({ ok: true, clientId: 'client-1', message: '' }),
  getClientCardFull: async () => ({}),
}))

/** מסד מדומה — שרשרת ה-.from().update().eq() שהטעינה משתמשת בה. */
const fakeDb = () => {
  const chain: Record<string, unknown> = {}
  // ⚠️ eq מחזירה את השרשרת *וגם* נענית כ-Promise: הקוד קורא לה גם כסוף
  // השרשרת (await ...eq()) וגם כחוליה שאחריה .is().
  chain.update = () => chain
  chain.eq = () => chain
  chain.is = () => Promise.resolve({ error: null })
  chain.select = () => chain
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null })
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res)
  return { from: () => chain } as never
}

const target = {
  recipientId: 'r1',
  beneficiaryId: 'b1',
  nedarimIdHoliday: 'client-1',
  idNumber: '123456789',
  name: 'משפחת בדיקה',
}

describe('טעינת חגים — אכיפת קבוצת הגבלת חנויות', () => {
  beforeEach(() => {
    addTlush.mockReset()
    getHolidayLimitedId.mockReset()
    addTlush.mockResolvedValue({ ok: true, tlushId: 'T1', message: 'OK' })
  })
  afterEach(() => vi.restoreAllMocks())

  it('🔴 נחסמת כשלא הוגדרה קבוצת הגבלה — ולא יוצאת בלי אכיפה', async () => {
    getHolidayLimitedId.mockResolvedValue('')
    const { runLoadBatch } = await import('./holidayCardLoad')

    await expect(
      runLoadBatch(fakeDb(), [target], 500, {}),
    ).rejects.toThrow(/הגבלת חנויות/)

    // ⚠️ העיקר: נדרים לא נגעה כלל. חסימה שמתרחשת *אחרי* הטעינה הראשונה
    // הייתה משאירה בדיוק את הבעיה שנמצאה — תלוש אחד בלי הגבלה.
    expect(addTlush).not.toHaveBeenCalled()
  })

  it('מעבירה את מזהה הקבוצה ל-AddTlush כשהוגדר', async () => {
    getHolidayLimitedId.mockResolvedValue('901')
    const { runLoadBatch } = await import('./holidayCardLoad')

    await runLoadBatch(fakeDb(), [target], 500, {})

    expect(addTlush).toHaveBeenCalledTimes(1)
    // ⚠️ הפרמטר האחרון הוא LimitedId — זה מה שאוכף בקופה בפועל.
    expect(addTlush.mock.calls[0].at(-1)).toBe('901')
  })

  it('מצב בדיקה אינו נחסם ואינו פונה לנדרים', async () => {
    // ⚠️ מצב הבדיקה נועד לרוץ *לפני* שההגדרות הושלמו. חסימתו הייתה מונעת
    // בדיוק את הבדיקה שמגלה שהקבוצה חסרה.
    getHolidayLimitedId.mockResolvedValue('')
    const { runLoadBatch } = await import('./holidayCardLoad')

    const summary = await runLoadBatch(fakeDb(), [target], 500, { testMode: true })

    expect(summary.loaded).toBe(1)
    expect(addTlush).not.toHaveBeenCalled()
  })
})
