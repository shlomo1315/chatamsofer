import { describe, it, expect } from 'vitest'
import { chainHasGap, statusAfterFix } from './lineageChainHealth'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 בקשת תיקון סדר דורות = רישום מחדש, לא בקשת אישור.
//
// ⚠️ עד כה כל בקשה המתינה לאישור ידני, ו-158 בקשות נערמו מ-16.08. המשפחה
// תיקנה, ואיש לא ידע. עכשיו התיקון נקלט מיד והכרטסת חוזרת למסלול הרגיל.
//
// 🔴 מה שמכריע לאן הכרטסת חוזרת הוא *דילוג דורות* בלבד — לא סטטוס הצמתים.
// 96% מהעץ (10,180 צמתים) מסומן pending כי איש לא עבר עליהם, ולא משום
// שיש בהם בעיה. חסימה על pending הייתה שולחת כמעט כל משפחה לבדיקה
// מעמיקה, כלומר מבטלת את כל התועלת.
//
// ⚠️ דילוג = הפרש הדורות בין צומת לאביו גדול מ-1. זה מה שקרה אצל
// רובינסקי: דור 6 חובר ישירות לדור 2, ארבעה דורות נעלמו.
// ─────────────────────────────────────────────────────────────────────────────

type N = { id: string; parent_id: string | null; generation: number }

const tree = (rows: N[]) => new Map(rows.map(r => [r.id, r]))

describe('🔴 chainHasGap — דילוג דורות', () => {
  it('שרשרת רציפה — אין דילוג', () => {
    const t = tree([
      { id: 'r', parent_id: null, generation: 1 },
      { id: 'a', parent_id: 'r', generation: 2 },
      { id: 'b', parent_id: 'a', generation: 3 },
    ])
    expect(chainHasGap('b', t)).toBe(false)
  })

  // 🔴 המקרה של רובינסקי בפועל.
  it('🔴 דור 6 מחובר לדור 2 — דילוג', () => {
    const t = tree([
      { id: 'r', parent_id: null, generation: 1 },
      { id: 'k', parent_id: 'r', generation: 2 },
      { id: 'x', parent_id: 'k', generation: 6 },
    ])
    expect(chainHasGap('x', t)).toBe(true)
  })

  it('דילוג עמוק בשרשרת — נתפס גם כשהצומת עצמו תקין', () => {
    const t = tree([
      { id: 'r', parent_id: null, generation: 1 },
      { id: 'a', parent_id: 'r', generation: 2 },
      { id: 'gap', parent_id: 'a', generation: 5 },
      { id: 'leaf', parent_id: 'gap', generation: 6 },
    ])
    expect(chainHasGap('leaf', t)).toBe(true)
  })

  // ⚠️ סטטוס pending אינו דילוג — זה כל ההבדל.
  it('🔴 צומת pending בשרשרת אינו נחשב בעיה', () => {
    const t = tree([
      { id: 'r', parent_id: null, generation: 1 },
      { id: 'a', parent_id: 'r', generation: 2 },
      { id: 'b', parent_id: 'a', generation: 3 },
    ])
    expect(chainHasGap('b', t)).toBe(false)
  })

  it('שורש לבדו — תקין', () => {
    expect(chainHasGap('r', tree([{ id: 'r', parent_id: null, generation: 1 }]))).toBe(false)
  })

  // ⚠️ צומת שאינו במפה או הורה חסר: לא זורק ולא מדווח דילוג שקרי —
  // נתון חסר אינו ראיה לבעיה.
  it('צומת לא קיים — לא זורק', () => {
    expect(chainHasGap('nope', tree([]))).toBe(false)
  })

  it('הורה חסר מהמפה — נעצר בלי דילוג שקרי', () => {
    const t = tree([{ id: 'x', parent_id: 'missing', generation: 4 }])
    expect(chainHasGap('x', t)).toBe(false)
  })

  // 🔴 הגנה מפני לולאה: עץ פגום עם מעגל היה תולה את השרת.
  it('🔴 מעגל בעץ אינו תולה', () => {
    const t = tree([
      { id: 'a', parent_id: 'b', generation: 3 },
      { id: 'b', parent_id: 'a', generation: 2 },
    ])
    expect(() => chainHasGap('a', t)).not.toThrow()
  })
})

describe('🔴 statusAfterFix — לאן הכרטסת חוזרת', () => {
  it('שרשרת תקינה → ממתין לאישור ראשוני', () => {
    expect(statusAfterFix(false)).toBe('pending')
  })

  it('🔴 דילוג דורות → בדיקה מעמיקה', () => {
    expect(statusAfterFix(true)).toBe('deep_review')
  })
})
