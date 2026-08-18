import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבאג שהטסט הזה נועל: app_settings.value היא עמודת **text**, לא jsonb.
//
// שמירת אובייקט גולמי לתוכה עוברת בלי שגיאה — Postgres מקבל ומאחסן
// "[object Object]" — וכל קריאה חוזרת מחזירה ברירות מחדל. ה-upsert מצליח,
// ה-API מחזיר ok, והמסך מציג "נשמר". הכישלון שקט לחלוטין.
//
// כל כותב ל-app_settings חייב JSON.stringify, וכל קורא חייב לפרסר.
// ─────────────────────────────────────────────────────────────────────────────

/** אותה לוגיקת קריאה שב-loadDigestSettings. */
function parseSettingsValue<T>(rawValue: unknown): Partial<T> {
  if (rawValue && typeof rawValue === 'object') return rawValue as Partial<T>
  if (typeof rawValue === 'string' && rawValue.trim().startsWith('{')) {
    try { return JSON.parse(rawValue) as Partial<T> } catch { return {} }
  }
  return {}
}

interface Digest { enabled: boolean; emails: string[] }

describe('app_settings — value היא text ולכן חייבת stringify', () => {
  it('אובייקט שנשמר גולמית הופך ל-[object Object] ואובד', () => {
    // זה מה שקרה בפועל: String() על אובייקט, כפי שהדרייבר עושה.
    const stored = String({ enabled: true, emails: ['a@b.com'] } as unknown as string)
    expect(stored).toBe('[object Object]')
    const parsed = parseSettingsValue<Digest>(stored)
    expect(parsed.enabled).toBeUndefined()
    expect(parsed.emails).toBeUndefined()
  })

  it('JSON.stringify שורד הלוך ושוב', () => {
    const value: Digest = { enabled: true, emails: ['a@b.com', 'c@d.com'] }
    const parsed = parseSettingsValue<Digest>(JSON.stringify(value))
    expect(parsed.enabled).toBe(true)
    expect(parsed.emails).toEqual(['a@b.com', 'c@d.com'])
  })

  it('מחרוזת פגומה שנשמרה לפני התיקון אינה מפילה את הטעינה', () => {
    // ⚠️ רשומות כאלה קיימות בפרודקשן — הן חייבות ליפול לברירת מחדל
    // ולא לזרוק.
    expect(() => parseSettingsValue<Digest>('[object Object]')).not.toThrow()
    expect(parseSettingsValue<Digest>('[object Object]')).toEqual({})
    expect(parseSettingsValue<Digest>('{לא JSON')).toEqual({})
    expect(parseSettingsValue<Digest>('')).toEqual({})
    expect(parseSettingsValue<Digest>(null)).toEqual({})
  })

  it('אובייקט אמיתי (אם העמודה תהפוך ל-jsonb) עדיין נתמך', () => {
    const parsed = parseSettingsValue<Digest>({ enabled: true, emails: ['x@y.com'] })
    expect(parsed.enabled).toBe(true)
  })
})
