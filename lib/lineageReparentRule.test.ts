import { describe, it, expect } from 'vitest'
import { isSiblingOfCurrentParent } from './lineageReparentRule'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבאג (11.10, קישור תיקון סדר הדורות): "החלף דור" פתח את רשימת האחים של
// הדור שמוחלף, אבל לחיצה על שם לא עשתה דבר. הבורר שולח reparent של *הדור
// הבא* (הבן) אל האח שנבחר — והשרת בדק שהאח הוא ילד של האב הנוכחי של הבן
// (כלומר של הדור שמוחלף עצמו) במקום ילד של *סבו*. כל בחירה נדחתה ב-403,
// והשגיאה הוצגה מתחת לקופסה — מחוץ למסך.
// ─────────────────────────────────────────────────────────────────────────────

const tree = [
  { id: 'g3', parent_id: 'g2' },          // רבי יעקב עקיבא סופר
  { id: 'g4', parent_id: 'g3' },          // פלזנבורג — הדור שמוחלף
  { id: 'g4b', parent_id: 'g3' },         // אחיו — הבחירה הנכונה
  { id: 'g5', parent_id: 'g4' },          // וגשל — הבן שעובר אב
  { id: 'g5b', parent_id: 'g4' },         // אחיו של וגשל
  { id: 'x', parent_id: 'other' },
]

describe('isSiblingOfCurrentParent', () => {
  it('🔴 אח של האב הנוכחי (ילד של הסב) — מותר', () => {
    expect(isSiblingOfCurrentParent(tree, 'g5', 'g4b')).toBe(true)
  })
  it('אח של הצומת עצמו — אסור (היה תולה אותו תחת אחיו)', () => {
    expect(isSiblingOfCurrentParent(tree, 'g5', 'g5b')).toBe(false)
  })
  it('צומת מענף אחר — אסור', () => {
    expect(isSiblingOfCurrentParent(tree, 'g5', 'x')).toBe(false)
  })
  it('צומת או הורה שאינם קיימים — אסור', () => {
    expect(isSiblingOfCurrentParent(tree, 'nope', 'g4b')).toBe(false)
    expect(isSiblingOfCurrentParent(tree, 'g5', 'nope')).toBe(false)
  })
  it('הצומת עצמו כהורה — אסור', () => {
    expect(isSiblingOfCurrentParent(tree, 'g4', 'g4')).toBe(false)
  })
})
