import { describe, it, expect } from 'vitest'
import { HOLIDAY_MESSAGE_META } from './yemotHolidayMessages'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מקש 2 ביקש מספר כרטיס בזמן שהחלוקה טרם התחילה.
//
// המשפחה אושרה, בחרה מוקד, וכל שלושת השערים הקיימים (רשום/מאושר/מוקד)
// נפתחו — אבל האיסוף במוקדים היה סגור (pickup_open=false) ולא חולק ולו
// כרטיס אחד. המתקשר נשלח לחפש בבית מספר שאינו קיים.
// ─────────────────────────────────────────────────────────────────────────────

/** שרשרת השערים של מקש 2, לפי הסדר שבו הן נבדקות בקוד. */
function cardGate(o: {
  pickupOpen: boolean
  registered?: boolean
  approved?: boolean
  hasCenter?: boolean
  /** האם *המוקד של המשפחה* כבר החל לחלק (pickup_open_at). */
  centerPickupOpen?: boolean
  hasCard?: boolean
}): string {
  // ⚠️ קודם כל — האם החלוקה התחילה. אינו תלוי בזיהוי המשפחה.
  if (!o.pickupOpen) return 'card_pickup_closed'
  if (!o.registered) return 'not_found'
  if (!o.approved) return 'pending_approval'
  if (!o.hasCenter) return 'card_no_center'
  // 🔴 השער הפר-מוקדי — אחרי שידוע *איזה* מוקד, ולפני בקשת המספר.
  if (!o.centerPickupOpen) return 'card_center_not_open'
  if (o.hasCard) return 'card_already'
  return 'card_ask'
}

const ready = {
  pickupOpen: true, registered: true, approved: true,
  hasCenter: true, centerPickupOpen: true, hasCard: false,
}

describe('🔴 שער האיסוף — מצב תשרי בפועל', () => {
  it('מאושר עם מוקד אך האיסוף סגור — לא מבקש כרטיס', () => {
    expect(cardGate({ ...ready, pickupOpen: false })).toBe('card_pickup_closed')
  })

  it('האיסוף סגור גובר גם על "לא רשום" — לא מבקש ת"ז לחינם', () => {
    expect(cardGate({ pickupOpen: false, registered: false })).toBe('card_pickup_closed')
  })

  it('האיסוף פתוח ומוכן — מבקש את מספר הכרטיס', () => {
    expect(cardGate(ready)).toBe('card_ask')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 פתיחה פר-מוקד: המוקדים אינם מחלקים באותו יום.
// מתג ראשי יחיד הכריח לבחור בין "כולם ממתינים לאחרון" לבין "מי שאין לו
// כרטיס ביד מתבקש להקיש מספר שאינו קיים".
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 השער הפר-מוקדי', () => {
  it('המוקד של המשפחה טרם החל לחלק — נחסם, ונאמר לו על המוקד שלו', () => {
    expect(cardGate({ ...ready, centerPickupOpen: false })).toBe('card_center_not_open')
  })

  it('המוקד שלו פתוח — ממשיך לבקשת הכרטיס, גם אם מוקדים אחרים סגורים', () => {
    expect(cardGate(ready)).toBe('card_ask')
  })

  it('⚠️ המתג הראשי גובר: מוקד פתוח אך המערכת סגורה — הודעה כללית', () => {
    expect(cardGate({ ...ready, pickupOpen: false, centerPickupOpen: true }))
      .toBe('card_pickup_closed')
  })

  it('נבדק אחרי שידוע איזה מוקד — בלי מוקד נשמעת ההודעה הנכונה', () => {
    expect(cardGate({ ...ready, hasCenter: false, centerPickupOpen: false }))
      .toBe('card_no_center')
  })

  it('כרטיס שכבר חובר נבדק רק אחרי שהמוקד נפתח', () => {
    expect(cardGate({ ...ready, centerPickupOpen: false, hasCard: true }))
      .toBe('card_center_not_open')
  })
})

describe('שאר השערים לא נפגעו', () => {
  it('לא רשום', () => {
    expect(cardGate({ ...ready, registered: false })).toBe('not_found')
  })
  it('ממתין לאישור', () => {
    expect(cardGate({ ...ready, approved: false })).toBe('pending_approval')
  })
  it('בלי מוקד', () => {
    expect(cardGate({ ...ready, hasCenter: false })).toBe('card_no_center')
  })
  it('כרטיס כבר חובר', () => {
    expect(cardGate({ ...ready, hasCard: true })).toBe('card_already')
  })
})

describe('ההודעה קיימת וניתנת להקלטה', () => {
  it('card_pickup_closed מוגדרת עם נוסח ברירת מחדל', () => {
    const m = HOLIDAY_MESSAGE_META.find(x => x.key === 'card_pickup_closed')
    expect(m).toBeDefined()
    expect(m!.defaultText.length).toBeGreaterThan(10)
    expect(m!.allowAudio).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 הוחלף (14.09): שם המוקד יצא מהנוסח לטובת הקול המוקלט.
  //
  // ⚠️ כל עוד ההודעה הכילה {center} היא נקראה כולה ב-TTS של ימות — קול
  // משובש בעברית, לצד הודעות מוקלטות באותה שיחה. השם לא היה שווה את
  // המחיר: המאזין הגיע דרך המוקד שלו, ו"המוקד שבו נרשמתם" מדויק באותה
  // מידה. אותו שיקול הוחל על card_center_ended ועל card_ready.
  // ─────────────────────────────────────────────────────────────────────────
  it('🔴 card_center_not_open ניתנת להקלטה — בלי שם מוקד', () => {
    const m = HOLIDAY_MESSAGE_META.find(x => x.key === 'card_center_not_open')
    expect(m).toBeDefined()
    expect(m!.defaultText).not.toContain('{center}')
    expect(m!.allowAudio).toBe(true)
    // ⚠️ עדיין חייבת לומר *מה* קרה, אחרת היא חסרת תוכן.
    expect(m!.defaultText).toContain('טרם החל')
  })

  it('🔴 card_center_ended ניתנת להקלטה — בלי שם מוקד', () => {
    const m = HOLIDAY_MESSAGE_META.find(x => x.key === 'card_center_ended')
    expect(m).toBeDefined()
    expect(m!.defaultText).not.toContain('{center}')
    expect(m!.allowAudio).toBe(true)
    expect(m!.defaultText).toContain('הסתיימה')
  })
})
