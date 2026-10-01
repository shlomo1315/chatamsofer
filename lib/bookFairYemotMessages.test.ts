import { describe, it, expect } from 'vitest'
import { BOOK_FAIR_MESSAGE_META } from './yemotBookFairMessages'
import { MESSAGE_FALLBACKS, msgToken, nextTurn, initialState } from './bookFairYemotIvr'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הנוסחים מוגדרים בשני מקומות במכוון: המטא-דאטה (yemotBookFairMessages)
// נגישה למסך ההגדרות ונוגעת במסד, וטבלת ה-fallback (bookFairYemotIvr)
// מוטמעת במכונת המצבים שחייבת להישאר טהורה. הכפילות הזו היא בדיוק סוג
// הדבר שנפרד בשקט — הטסטים כאן מונעים זאת.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 התאמה בין המטא-דאטה לברירות המחדל של ה-IVR', () => {
  it('לכל הודעה במטא-דאטה יש ברירת מחדל ב-IVR', () => {
    const missing = BOOK_FAIR_MESSAGE_META
      .filter(m => MESSAGE_FALLBACKS[m.key] === undefined)
      .map(m => m.key)
    expect(missing).toEqual([])
  })

  it('אין ברירת מחדל ב-IVR שאינה במטא-דאטה (הודעה שאי אפשר לערוך)', () => {
    const keys = new Set(BOOK_FAIR_MESSAGE_META.map(m => m.key))
    const orphans = Object.keys(MESSAGE_FALLBACKS).filter(k => !keys.has(k))
    expect(orphans).toEqual([])
  })

  it('הנוסחים זהים בשני המקומות', () => {
    const diffs = BOOK_FAIR_MESSAGE_META
      .filter(m => MESSAGE_FALLBACKS[m.key] !== m.defaultText)
      .map(m => m.key)
    expect(diffs).toEqual([])
  })

  // 🔴 הודעה דינמית שאיבדה את המשתנה שלה הופכת לשקר מוקרא ("הספר אזל
  // מהמלאי" בלי שם הספר).
  it('כל הודעה עם placeholders מכילה אותם בברירת המחדל', () => {
    const bad: string[] = []
    for (const m of BOOK_FAIR_MESSAGE_META) {
      for (const p of m.placeholders ?? []) {
        if (!m.defaultText.includes(`{${p}}`)) bad.push(`${m.key}:{${p}}`)
      }
    }
    expect(bad).toEqual([])
  })

  // ⚠️ הודעה שמותרת בה הקלטה אך מכילה משתנה היא סתירה: קובץ אחד אינו
  // יכול להקריא ערך שמשתנה בכל שיחה.
  it('הודעה עם משתנה אינה מסומנת כניתנת להקלטה', () => {
    const bad = BOOK_FAIR_MESSAGE_META
      .filter(m => m.allowAudio && /\{[^}]+\}/.test(m.defaultText))
      .map(m => m.key)
    expect(bad).toEqual([])
  })
})

describe('msgToken', () => {
  it('מחזיר TTS של הטקסט כשאין הקלטה', () => {
    expect(msgToken({ welcome: { text: 'שלום לכם' } }, 'welcome')).toBe('t-שלום לכם')
  })

  it('נופל לברירת המחדל כשאין נוסח', () => {
    expect(msgToken(undefined, 'goodbye')).toBe(`t-${MESSAGE_FALLBACKS.goodbye}`)
  })

  it('נופל לברירת המחדל כשהנוסח ריק', () => {
    expect(msgToken({ goodbye: { text: '   ' } }, 'goodbye')).toBe(`t-${MESSAGE_FALLBACKS.goodbye}`)
  })

  // 🔴 ההקלטה גוברת על הטקסט — זו המלכודת שהפילה אותנו בעבר.
  it('מעדיף הקלטה על פני הטקסט', () => {
    expect(msgToken({ welcome: { text: 'טקסט', audio: 'rec_welcome' } }, 'welcome')).toBe('f-rec_welcome')
  })

  // ⚠️ קובץ יחיד אינו יכול להקריא ערך משתנה — עם vars חוזרים ל-TTS.
  it('מתעלם מהקלטה כשיש משתנים להחליף', () => {
    const out = msgToken({ book_sold_out: { text: 'הספר {title} אזל', audio: 'rec_x' } }, 'book_sold_out', { title: 'תורת משה' })
    expect(out).toBe('t-הספר תורת משה אזל')
  })

  it('מחליף משתנים', () => {
    expect(msgToken({ shipping_to: { text: 'משלוח ל{city}' } }, 'shipping_to', { city: 'בני ברק' }))
      .toBe('t-משלוח לבני ברק')
  })

  // 🔴 שדה שלא הוחלף הוקרא בעבר בטלפון כ"סוגריים ניים".
  it('מנקה משתנה שלא הוחלף במקום להקריא אותו', () => {
    const out = msgToken({ added_to_cart: { text: 'נוספו {qty} של {title}' } }, 'added_to_cart', { qty: 3 })
    expect(out).not.toContain('{')
    expect(out).not.toContain('}')
    expect(out).toContain('3')
  })

  // ⚠️ ttsClean: נקודה ומקף הם מפרידי התחביר של ימות עצמה.
  it('מנקה תווים ששוברים את תחביר הטוקנים', () => {
    const out = msgToken({ book_sold_out: { text: 'הספר {title} אזל' } }, 'book_sold_out', { title: 'שו"ת חת"ס - חלק א.' })
    expect(out).not.toMatch(/["'״׳.]/)
    expect(out.startsWith('t-')).toBe(true)
  })
})

describe('🔴 nextTurn משתמש בנוסחים שהוזנו', () => {
  it('הברכה המותאמת מוקראת במקום ברירת המחדל', () => {
    const turn = nextTurn(initialState(), {}, {
      welcome: { text: 'ברוכים הבאים ליריד תשפז' },
      ask_sku: { text: 'הקישו מקט' },
    })
    expect(turn.response).toContain('t-ברוכים הבאים ליריד תשפז')
    expect(turn.response).toContain('t-הקישו מקט')
    expect(turn.response).not.toContain(MESSAGE_FALLBACKS.welcome)
  })

  // ⚠️ בלי נוסחים השלוחה חייבת להמשיך לדבר, לא להשתתק.
  it('בלי נוסחים כלל — ברירות המחדל נשמעות', () => {
    const turn = nextTurn(initialState(), {})
    expect(turn.response).toContain(`t-${MESSAGE_FALLBACKS.welcome}`)
  })

  it('הקלטה שהועלתה לברכה מושמעת במקום הטקסט', () => {
    const turn = nextTurn(initialState(), {}, {
      welcome: { text: 'לא יישמע', audio: 'rec_welcome' },
    })
    expect(turn.response).toContain('f-rec_welcome')
    expect(turn.response).not.toContain('לא יישמע')
  })
})
