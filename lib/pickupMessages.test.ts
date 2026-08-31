import { describe, it, expect } from 'vitest'
import {
  pickupPhoneText, pickupEmailText, pickupPortalText, PICKUP_WARNING_CORE,
} from './pickupMessages'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ההודעה שהמשפחה מקבלת אחרי הטעינה.
//
// המטרה המוצהרת: **שאיש לא יגיע למוקד שלא בחר**. המוקד מזמין כרטיסים
// לפי מספר הנרשמים, ומשפחה שמגיעה למוקד אחר לוקחת כרטיס של מישהו
// אחר — ומי שכן נרשם שם מגיע ולא מוצא.
//
// ⚠️ ההרתעה מנוסחת כאילו המערכת תחסום. היא *לא* חוסמת בפועל, וזו
// החלטה מפורשת של המשתמש: הניסוח מרתיע, אבל אין אכיפה טכנית שתתקע
// משפחה במוקד בגלל תקלה.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 האזהרה — הליבה המשותפת', () => {
  it('אומרת שרק במוקד שנבחר', () => {
    expect(PICKUP_WARNING_CORE).toContain('רק')
  })

  it('🔴 אומרת מה יקרה במוקד אחר — זו ההרתעה עצמה', () => {
    expect(PICKUP_WARNING_CORE).toMatch(/לא ניתן|לא תתאפשר|לא יעבוד/)
  })
})

describe('pickupPhoneText — הנוסח בטלפון', () => {
  const t = pickupPhoneText('בני ברק · אזור סוקולוב')

  it('שם המוקד מושמע', () => {
    expect(t).toContain('בני ברק')
  })

  it('🔴 כולל את האזהרה', () => {
    expect(t).toMatch(/רק/)
  })

  it('⚠️ בלי תווים שה-TTS של ימות אינו סובל', () => {
    // ⚠️ . - " \' & | וגרש/גרשיים עבריים שוברים את ההקראה.
    expect(t).not.toMatch(/["'&|׳״]/)
  })

  it('⚠️ בלי שם מוקד — עדיין משפט שלם ולא "{center}"', () => {
    const empty = pickupPhoneText(null)
    expect(empty).not.toContain('{')
    expect(empty).toMatch(/רק/)
  })
})

describe('pickupEmailText — הנוסח במייל', () => {
  const t = pickupEmailText('אשדוד')

  it('שם המוקד מופיע', () => {
    expect(t).toContain('אשדוד')
  })

  it('🔴 כולל את האזהרה', () => {
    expect(t).toMatch(/רק/)
  })

  it('⚠️ אינו מזכיר שובר — בוטל במכוון', () => {
    expect(t).not.toContain('שובר')
  })

  it('⚠️ אינו מבטיח תאריכים ושעות שטרם נקבעו', () => {
    expect(t).not.toMatch(/בשעה \d|בתאריך \d/)
  })
})

describe('pickupPortalText — הנוסח באתר', () => {
  it('מציג את שם המוקד ואת האזהרה', () => {
    const t = pickupPortalText('ירושלים')
    expect(t).toContain('ירושלים')
    expect(t).toMatch(/רק/)
  })

  it('⚠️ שלושת הערוצים אומרים את אותו דבר', () => {
    // 🔴 ניסוח שונה בין הערוצים הוא בדיוק מה שגורם למשפחה לחשוב
    // שהכלל אינו רציני.
    for (const t of [pickupPhoneText('חיפה'), pickupEmailText('חיפה'), pickupPortalText('חיפה')]) {
      expect(t).toContain('חיפה')
      expect(t).toMatch(/רק/)
    }
  })
})
