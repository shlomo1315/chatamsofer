import { describe, it, expect } from 'vitest'
import {
  MAIN_MENU_MESSAGE_META, defaultMainMenuMessages, mergeMainMenuMessages,
} from './yemotMainMenu'

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
