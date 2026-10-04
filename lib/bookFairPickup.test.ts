import { describe, it, expect } from 'vitest'
import {
  mergePickupConfig, pickupStatus, israelParts, DEFAULT_PICKUP,
} from './bookFairPickup'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הגבול "יום שני ב-18:00" אי אפשר לאמת בפרודקשן בלי לחכות ליום שני.
// הטסטים כאן הם הדרך היחידה לדעת שהוא נכון — ובפרט שהוא *אינו* סוגר
// את האיסוף בימים אחרים, מה שהיה מבטל אותו כמעט לגמרי בלי שאיש ישים לב.
// ─────────────────────────────────────────────────────────────────────────────

/** זמן בשעון ישראל. ⚠️ +03:00 = שעון קיץ (עד סוף אוקטובר). */
const il = (iso: string) => new Date(`${iso}+03:00`)

describe('israelParts — שעון ישראל ולא UTC', () => {
  it('יום ושעה לפי שעון מקומי', () => {
    // 2026-10-05 הוא יום שני
    const p = israelParts(il('2026-10-05T18:30:00'))
    expect(p.weekday).toBe(1)
    expect(p.hour).toBe(18)
  })

  // 🔴 אותו רגע ב-UTC הוא 15:30 — חישוב ב-UTC היה מחשיב אותו כ"לפני
  // הסגירה" בעוד בישראל כבר 18:30.
  it('🔴 חצות מקומית מוחזרת כ-0 ולא כ-24', () => {
    const p = israelParts(il('2026-10-05T00:15:00'))
    expect(p.hour).toBe(0)
    expect(p.weekday).toBe(1)
  })
})

describe('🔴 pickupStatus — גבול הסגירה', () => {
  const cfg = DEFAULT_PICKUP   // שני, 18:00, 3 שעות

  it('שני 17:59 — פתוח', () => {
    expect(pickupStatus(cfg, il('2026-10-05T17:59:00')).available).toBe(true)
  })

  it('🔴 שני 18:00 בדיוק — סגור', () => {
    const s = pickupStatus(cfg, il('2026-10-05T18:00:00'))
    expect(s.available).toBe(false)
    expect(s.message).toContain('שני')
    expect(s.message).toContain('18:00')
  })

  it('שני 23:30 — עדיין סגור', () => {
    expect(pickupStatus(cfg, il('2026-10-05T23:30:00')).available).toBe(false)
  })

  // 🔴 הלב: הסגירה היא ליום אחד, לא לכל השבוע.
  it('🔴 שלישי 09:00 — פתוח שוב', () => {
    expect(pickupStatus(cfg, il('2026-10-06T09:00:00')).available).toBe(true)
  })

  it('ראשון 20:00 — פתוח (לא יום הסגירה)', () => {
    expect(pickupStatus(cfg, il('2026-10-04T20:00:00')).available).toBe(true)
  })

  it('ההודעה כשפתוח מציינת את זמן ההכנה', () => {
    const s = pickupStatus(cfg, il('2026-10-06T09:00:00'))
    expect(s.message).toContain('3')
    expect(s.message).toContain('שעות')
  })

  it('כיבוי מלא — סגור בכל זמן', () => {
    const off = { ...cfg, enabled: false }
    expect(pickupStatus(off, il('2026-10-06T09:00:00')).available).toBe(false)
  })

  it('closes_weekday=null — אין סגירה שבועית', () => {
    const always = { ...cfg, closes_weekday: null }
    expect(pickupStatus(always, il('2026-10-05T23:00:00')).available).toBe(true)
  })
})

// 🔴 שונה מהסגירה השבועית: זו סוגרת אחת ולתמיד. היריד נגמר, אין
// למי לאסוף, ו"יחזור ביום שלישי" היה שקר.
describe('🔴 מועד סגירה סופי (closes_at)', () => {
  const cfg = { ...DEFAULT_PICKUP, closes_at: '2026-10-05T18:00:00+03:00' }

  it('לפני המועד — פתוח', () => {
    // ראשון 4.10, יום שאינו יום הסגירה השבועית
    expect(pickupStatus(cfg, il('2026-10-04T12:00:00')).available).toBe(true)
  })

  it('🔴 בדיוק במועד — סגור', () => {
    const s = pickupStatus(cfg, il('2026-10-05T18:00:00'))
    expect(s.available).toBe(false)
    expect(s.message).toContain('משלוח')
  })

  // 🔴 הלב: הסגירה אינה נפתחת למחרת כמו הסגירה השבועית.
  it('🔴 יום אחרי — עדיין סגור', () => {
    expect(pickupStatus(cfg, il('2026-10-06T09:00:00')).available).toBe(false)
  })

  it('🔴 שבוע אחרי — עדיין סגור', () => {
    expect(pickupStatus(cfg, il('2026-10-13T09:00:00')).available).toBe(false)
  })

  it('בלי closes_at — ההתנהגות השבועית נשמרת', () => {
    expect(pickupStatus(DEFAULT_PICKUP, il('2026-10-06T09:00:00')).available).toBe(true)
  })

  // ⚠️ תאריך פגום אסור לו לסגור את האיסוף בשקט.
  it('⚠️ תאריך פגום נזרק ואינו סוגר', () => {
    const bad = mergePickupConfig({ ...DEFAULT_PICKUP, closes_at: 'מחר בערב' })
    expect(bad.closes_at).toBeNull()
    expect(pickupStatus(bad, il('2026-10-06T09:00:00')).available).toBe(true)
  })

  it('תאריך תקין נשמר במיזוג', () => {
    const c = mergePickupConfig({ closes_at: '2026-10-05T18:00:00+03:00' })
    expect(c.closes_at).toBe('2026-10-05T18:00:00+03:00')
  })
})

describe('mergePickupConfig', () => {
  it('ערך חסר → ברירת מחדל', () => {
    expect(mergePickupConfig(null)).toEqual(DEFAULT_PICKUP)
    expect(mergePickupConfig({})).toEqual(DEFAULT_PICKUP)
  })

  it('ערכים תקינים נשמרים', () => {
    const c = mergePickupConfig({ enabled: true, ready_hours: 5, closes_weekday: 4, closes_hour: 20 })
    expect(c).toEqual({ enabled: true, ready_hours: 5, closes_weekday: 4, closes_hour: 20, closes_at: null })
  })

  // ⚠️ הגדרה שבורה אסור לה לבטל את האיסוף בשקט.
  it('⚠️ ערך פגום נופל לברירת המחדל ואינו מבטל את האיסוף', () => {
    const c = mergePickupConfig({ ready_hours: 'שלוש', closes_hour: 99, closes_weekday: 42 })
    expect(c.enabled).toBe(true)
    expect(c.ready_hours).toBe(DEFAULT_PICKUP.ready_hours)
    expect(c.closes_hour).toBe(DEFAULT_PICKUP.closes_hour)
    expect(c.closes_weekday).toBe(DEFAULT_PICKUP.closes_weekday)
  })

  it('enabled=false מכובד במפורש', () => {
    expect(mergePickupConfig({ enabled: false }).enabled).toBe(false)
  })

  it('closes_weekday=null נשמר', () => {
    expect(mergePickupConfig({ closes_weekday: null }).closes_weekday).toBeNull()
  })
})
