import { describe, it, expect } from 'vitest'
import { describeElevenError } from './elevenQuota'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מכסת ElevenLabs שנגמרה נראתה כתקלה במערכת.
//
// ⚠️ הכפתור "יצירת קול" נלחץ, לא קרה דבר, וההודעה נשארה "קול ממוחשב"
// בלי שום הסבר. השגיאה כן הוחזרה — אבל כ-JSON גולמי באנגלית
// ("quota_exceeded ... you have 12 credits remaining"), שלא נקרא כמשפט
// ולא נקשר למכסה. המנהל חיפש את הבאג בקוד במקום לטעון קרדיטים.
//
// 🔴 הסיבה חייבת להיאמר בעברית ובמפורש: "נגמרה המכסה" היא פעולה שהמנהל
// יכול לבצע, "ElevenLabs החזיר שגיאה: {...}" אינה.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 describeElevenError — מכסה שנגמרה', () => {
  it('מזהה quota_exceeded ואומר מה לעשות', () => {
    const msg = describeElevenError(401,
      '{"detail":{"status":"quota_exceeded","message":"You have 12 credits remaining"}}')
    expect(msg).toContain('מכסת')
    expect(msg).toContain('ElevenLabs')
  })

  it('מזהה גם את הניסוח החלופי של ElevenLabs', () => {
    expect(describeElevenError(422, 'exceeds your quota')).toContain('מכסת')
    expect(describeElevenError(429, 'too_many_requests')).toContain('מכסת')
  })

  it('מפתח שגוי — הודעה אחרת לגמרי, כי הפעולה שונה', () => {
    const msg = describeElevenError(401, '{"detail":{"status":"invalid_api_key"}}')
    expect(msg).toContain('מפתח')
    expect(msg).not.toContain('מכסת')
  })

  // ⚠️ שגיאה לא מוכרת חייבת להישאר גלויה: בליעתה מחזירה אותנו בדיוק
  // למצב שבו הכפתור "לא עושה כלום" בלי שום רמז.
  it('שגיאה לא מוכרת — הטקסט המקורי נשמר', () => {
    expect(describeElevenError(500, 'voice_not_found')).toContain('voice_not_found')
  })

  it('בלי טקסט שגיאה — לא מחזיר מחרוזת ריקה', () => {
    expect(describeElevenError(0, '').trim().length).toBeGreaterThan(0)
  })
})
