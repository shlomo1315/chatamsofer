import { describe, it, expect } from 'vitest'
import { looksLikeFeedbackReply, looksLikeGratitudeReply, isGratitudeOrFeedbackReply } from './inboundGratitude'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 זיהוי תשובות שהטוקן שלהן אבד.
//
// Google Workspace עושה dual-delivery ו"אוכל" את office+s<token>@ — ולכן
// משובים שנשלחו במייל לא נקלטו כלל. הזיהוי לפי הנושא הוא קו ההגנה היחיד
// שנשאר, ולכן הוא נבדק כאן על הנוסחים האמיתיים שהמערכת שולחת.
// ─────────────────────────────────────────────────────────────────────────────

describe('זיהוי תשובת משוב לפי הנושא', () => {
  it('תופס את הנושא שהמערכת בונה בטיוטה', () => {
    // הנוסח מ-recoveryFeedbackEmail: `משוב · <בית החלמה>`
    expect(looksLikeFeedbackReply('משוב · בית החלמה הדסה')).toBe(true)
    expect(looksLikeFeedbackReply('משוב · בית החלמה')).toBe(true)
  })

  it('תופס גם כשלקוח המייל הוסיף קידומת תשובה', () => {
    // ⚠️ קריטי: המשוב תמיד מגיע כ*תשובה*, ולכן הנושא כמעט לעולם אינו נקי.
    expect(looksLikeFeedbackReply('Re: משוב · בית החלמה הדסה')).toBe(true)
    expect(looksLikeFeedbackReply('RE: משוב · בית החלמה')).toBe(true)
    expect(looksLikeFeedbackReply('תגובה: משוב · בית החלמה')).toBe(true)
  })

  it('אינו תופס מיילים אחרים שמזכירים את המילה משוב', () => {
    // ⚠️ שיוך שגוי גרוע מאי-קליטה: הוא נראה תקין ואיש לא בודק אותו.
    expect(looksLikeFeedbackReply('שאלה על המשוב שנשלח')).toBe(false)
    expect(looksLikeFeedbackReply('בקשת לידה')).toBe(false)
    expect(looksLikeFeedbackReply('')).toBe(false)
  })
})

describe('זיהוי מכתב ברכה לפי הנושא', () => {
  it('תופס מכתב ברכה ותודה', () => {
    expect(looksLikeGratitudeReply('מכתב ברכה')).toBe(true)
    expect(looksLikeGratitudeReply('Re: מכתב תודה')).toBe(true)
  })

  it('אינו מתבלבל עם משוב', () => {
    expect(looksLikeGratitudeReply('משוב · בית החלמה')).toBe(false)
  })
})

describe('זיהוי לפי plus-address (המסלול הישיר)', () => {
  it('תופס טוקן משוב וברכה', () => {
    expect(isGratitudeOrFeedbackReply(['office+sABC12345@chasamsofer.info'])).toBe(true)
    expect(isGratitudeOrFeedbackReply(['office+gABC12345@chasamsofer.info'])).toBe(true)
  })

  it('אינו תופס את כתובת ה-dual-delivery שהחליפה את הטוקן', () => {
    // זה בדיוק המצב בייצור — ולכן נדרשת הנפילה-לאחור לפי הנושא.
    expect(isGratitudeOrFeedbackReply(['copy@in.chasamsofer.info'])).toBe(false)
  })
})
