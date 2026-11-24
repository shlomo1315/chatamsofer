import { describe, it, expect } from 'vitest'
import {
  MAIN_MENU_MESSAGE_META, defaultMainMenuMessages, mergeMainMenuMessages, toStoredMainMenuMessages,
} from './mainMenuPhone'

// ─────────────────────────────────────────────────────────────────────────────
// התפריט הראשי הוא נקודת הכניסה היחידה למערכת הטלפונית. הודעה חסרה כאן
// פירושה שקט בטלפון — המתקשר שומע כלום ומנתק.
// ─────────────────────────────────────────────────────────────────────────────

describe('הודעות התפריט הראשי', () => {
  it('לכל הודעה יש ברירת מחדל לא ריקה', () => {
    const d = defaultMainMenuMessages()
    for (const m of MAIN_MENU_MESSAGE_META) {
      expect(d[m.key]?.text, `${m.key} ריק`).toBeTruthy()
    }
  })

  it('הודעה 9 מסתיימת בניתוק — בלי "הקישו" שאי אפשר להקיש בה', () => {
    const notice = defaultMainMenuMessages().notice.text
    expect(notice).toContain('חנוכה')
    expect(notice).toContain('התקשרו שוב לקו זה והקישו 1')
    expect(notice).not.toMatch(/כעת הקישו|הקישו 2/)
  })

  it('נוסח שנשמר גובר על ברירת המחדל', () => {
    const out = mergeMainMenuMessages({ menu: { text: 'לחגים הקישו 1' } })
    expect(out.menu.text).toBe('לחגים הקישו 1')
  })

  // ⚠️ הודעה שנוספה לקוד אחרי השמירה האחרונה חייבת לקבל ברירת מחדל ולא
  // להיעלם — אחרת התפריט משמיע שקט במקום מקש שקיים.
  it('הודעה שלא נשמרה מקבלת את ברירת המחדל', () => {
    const out = mergeMainMenuMessages({ menu: { text: 'רק זו נשמרה' } })
    for (const m of MAIN_MENU_MESSAGE_META) {
      expect(out[m.key]?.text, `${m.key} נעלם`).toBeTruthy()
    }
  })

  it('מחרוזת ריקה נשמרת כפי שהיא — "ריק = דלג" הוא בחירה', () => {
    const out = mergeMainMenuMessages({ welcome: { text: '' } })
    expect(out.welcome.text).toBe('')
  })

  it('קלט פגום אינו מפיל — נופלים לברירות המחדל', () => {
    expect(mergeMainMenuMessages(null).menu.text).toBeTruthy()
    expect(mergeMainMenuMessages('לא אובייקט').menu.text).toBeTruthy()
    expect(mergeMainMenuMessages({ menu: 'לא אובייקט' }).menu.text).toBeTruthy()
  })

  it('הקלטה נשמרת, ומחרוזת ריקה נקראת כהיעדר הקלטה', () => {
    expect(mergeMainMenuMessages({ menu: { text: 'x', audio: 'menu.wav' } }).menu.audio).toBe('menu.wav')
    expect(mergeMainMenuMessages({ menu: { text: 'x', audio: '' } }).menu.audio).toBeNull()
  })

  // 🔴 המספרים בהודעה חייבים להתאים למה שהתפריט באמת מקבל (1.2.9 ב-read).
  // תפריט שמקריא מקש שאינו מנותב שולח את המתקשר להקשה שתיפול ל"שגוי".
  it('התפריט מקריא בדיוק את המקשים שיש להם יעד', () => {
    const menu = defaultMainMenuMessages().menu.text
    for (const digit of ['1', '2', '9']) {
      expect(menu, `מקש ${digit} אינו מוזכר בתפריט`).toContain(digit)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 24.11: שלוחה 9 השמיעה "אין כרגע הודעות חדשות" במקום נוסח חנוכה, כי
// שמירה ישנה במסך הניהול הקפיאה את ברירת המחדל הקודמת במסד.
describe('נוסח ישן שהוקפא במסד', () => {
  const noticeDefault = MAIN_MENU_MESSAGE_META.find(m => m.key === 'notice')!.defaultText

  it('"אין כרגע הודעות חדשות" שמור מוחלף בנוסח הנוכחי, גם עם קובץ קול ישן', () => {
    for (const text of ['אין כרגע הודעות חדשות', 'אין כרגע הודעות חדשות.', ' אין כרגע הודעות חדשות ']) {
      const m = mergeMainMenuMessages({ notice: { text, audio: 'old.wav' }, welcome: { text: 'שלום' } })
      expect(m.notice).toEqual({ text: noticeDefault, audio: null })
      expect(m.welcome.text).toBe('שלום')
    }
    expect(noticeDefault).toContain('חנוכה')
  })

  it('נוסח שנערך ידנית נשאר', () => {
    expect(mergeMainMenuMessages({ notice: { text: 'אין כרגע הודעות חדשות, חוץ מזו' } }).notice.text)
      .toBe('אין כרגע הודעות חדשות, חוץ מזו')
  })

  it('שמירה לא מקפיאה ברירות מחדל: נשמרות רק הודעות שנערכו', () => {
    const all = defaultMainMenuMessages()
    all.welcome = { text: 'ברוכים הבאים', audio: null }
    all.invalid = { ...all.invalid, audio: 'invalid.wav' }
    const stored = toStoredMainMenuMessages(all)
    expect(Object.keys(stored).sort()).toEqual(['invalid', 'welcome'])
    expect(stored.notice).toBeUndefined()
    // ונטען בחזרה עם ברירות המחדל הנוכחיות
    expect(mergeMainMenuMessages(stored).notice.text).toBe(noticeDefault)
  })

  it('ריק נשמר (ריק = דלג)', () => {
    const all = defaultMainMenuMessages()
    all.temp_notice = { text: '', audio: null }
    expect(toStoredMainMenuMessages(all).temp_notice).toEqual({ text: '', audio: null })
  })
})
