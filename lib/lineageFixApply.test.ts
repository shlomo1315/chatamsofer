import { describe, it, expect } from 'vitest'
import { earlyGenerationsCheck } from './lineageFixApply'
import { buildApprovedRefTree } from './lineageApprovedRef'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 קישור תיקון סדר הדורות — התיקון נכנס מיד *רק* אם 5 הדורות הראשונים
// תקינים (החלטת המשתמש 11.10). אחרת הבקשה נכנסת לתור הצוות כמו קודם.
// "תקין" = כל דור 2–5 בשרשרת יושב בקובץ המאושר באותו דור ותחת אותו הורה,
// ואף דור 2–5 לא הוקלד ידנית.
// ─────────────────────────────────────────────────────────────────────────────

const approved = buildApprovedRefTree([
  { key: 'ח', name: 'החתם סופר', generation: 1, parent_key: null },
  { key: 'כ', name: 'רבי אברהם שמואל בנימין בעל הכתב סופר', generation: 2, parent_key: 'ח' },
  { key: 'י', name: 'רבי יעקב עקיבא ומלכה סופר', generation: 3, parent_key: 'כ' },
  { key: 'פ', name: 'רבי אברהם ורויזע פלזנבורג', generation: 4, parent_key: 'י' },
  { key: 'ו', name: 'רבי יהושע אהרן והינדל לאה וגשל', generation: 5, parent_key: 'פ' },
  { key: 'צ', name: 'רבי צבי יהודה ורעכיל פרידמן', generation: 2, parent_key: 'ח' },
])

const path = [
  { name: 'מרן החתם סופר זי"ע', generation: 1 },
  { name: 'רבי אברהם שמואל בנימין בעל הכתב סופר', generation: 2 },
  { name: 'רבי יעקב עקיבא ומלכה סופר', generation: 3 },
  { name: 'רבי אברהם ורויזע פלזנבורג', generation: 4 },
  { name: 'רבי יהושע אהרן והינדל לאה וגשל', generation: 5 },
]

describe('earlyGenerationsCheck', () => {
  it('שרשרת מהקובץ עד דור 5 + דורות ידניים מדור 6 — תקין', () => {
    expect(earlyGenerationsCheck(path, approved)).toEqual({ ok: true })
  })
  it('דור 3 תחת הורה אחר מבקובץ — לא תקין', () => {
    const bad = [path[0], { name: 'רבי צבי יהודה ורעכיל פרידמן', generation: 2 }, path[2], path[3], path[4]]
    expect(earlyGenerationsCheck(bad, approved)).toEqual({ ok: false, generation: 3 })
  })
  it('🔴 דור 5 הוקלד ידנית (העוגן בדור 4) — לא תקין', () => {
    expect(earlyGenerationsCheck(path.slice(0, 4), approved)).toEqual({ ok: false, generation: 5 })
  })
  it('הנמען עצמו אינו יכול להיות דור 5 ומטה — לא תקין', () => {
    expect(earlyGenerationsCheck(path.slice(0, 4), approved)).toEqual({ ok: false, generation: 5 })
  })
  it('דור 4 שאינו בקובץ כלל — לא תקין', () => {
    const bad = [...path.slice(0, 3), { name: 'רבי אליעזר שרייבר', generation: 4 }]
    expect(earlyGenerationsCheck(bad, approved)).toEqual({ ok: false, generation: 4 })
  })
})
