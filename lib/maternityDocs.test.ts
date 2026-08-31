import { describe, it, expect } from 'vitest'
import { pickLatestPerType } from './maternityDocs'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 המסמכים שמוצגים בכרטסת היולדת.
//
// עד כה נשלפו ארבעה סוגים בלבד (ת"ז וספחים של הבעל והאישה), ברשימה
// קשיחה. כל סוג אחר — "מסמך אחר", ת"ז ילד, וכל סוג שנוסף מההגדרות —
// פשוט לא הופיע. המסמך היה קיים בכרטסת הצאצא ונעדר מכרטסת היולדת,
// בלי שום סימן שמשהו חסר.
//
// ⚠️ אין כאן רשימת סוגים: הסינון היה *הבאג*. מה שקיים למשפחה מוצג.
// ─────────────────────────────────────────────────────────────────────────────

const doc = (doc_type: string, uploaded_at: string, file_url = 'u') =>
  ({ doc_type, file_url, file_name: null, uploaded_at })

describe('pickLatestPerType — אחד לכל סוג', () => {
  it('🔴 מחזיר את החדש ביותר מכל סוג', () => {
    const rows = [
      doc('id_wife', '2026-08-01', 'ישן'),
      doc('id_wife', '2026-08-20', 'חדש'),
    ]
    const out = pickLatestPerType(rows)
    expect(out).toHaveLength(1)
    expect(out[0].file_url).toBe('חדש')
  })

  it('⚠️ אינו תלוי בסדר הקלט — ממיין בעצמו', () => {
    // השאילתה ממיינת, אבל הסתמכות על כך שוברת בשקט ברגע שמישהו
    // משנה את סדר ה-order בשאילתה.
    const rows = [
      doc('id_wife', '2026-08-01', 'ישן'),
      doc('id_wife', '2026-08-25', 'חדש'),
      doc('id_wife', '2026-08-10', 'אמצע'),
    ]
    expect(pickLatestPerType(rows)[0].file_url).toBe('חדש')
  })
})

describe('pickLatestPerType — 🔴 כל הסוגים, לא רשימה סגורה', () => {
  it('סוגים שנחסמו קודם — other ו-id_child — מוצגים', () => {
    const rows = [
      doc('id_husband', '2026-08-01'),
      doc('other', '2026-08-02'),
      doc('id_child', '2026-08-03'),
    ]
    expect(pickLatestPerType(rows).map(d => d.doc_type).sort())
      .toEqual(['id_child', 'id_husband', 'other'])
  })

  it('🔴 סוג שנוסף מההגדרות ואינו מוכר בקוד — מוצג גם הוא', () => {
    // זו כל הנקודה: רשימה קשיחה הייתה מבליעה כל סוג עתידי בשקט.
    const rows = [doc('doc_a1b2c3', '2026-08-01')]
    expect(pickLatestPerType(rows).map(d => d.doc_type)).toEqual(['doc_a1b2c3'])
  })
})

describe('pickLatestPerType — מקרי קצה', () => {
  it('רשימה ריקה', () => {
    expect(pickLatestPerType([])).toEqual([])
  })

  it('⚠️ שורה בלי קובץ אינה מוצגת — אין מה לפתוח', () => {
    const rows = [doc('other', '2026-08-01', ''), doc('id_wife', '2026-08-01')]
    expect(pickLatestPerType(rows).map(d => d.doc_type)).toEqual(['id_wife'])
  })

  it('⚠️ תאריך חסר אינו מפיל — נחשב הישן ביותר', () => {
    const rows = [
      { doc_type: 'other', file_url: 'א', file_name: null, uploaded_at: null },
      doc('other', '2026-08-01', 'ב'),
    ]
    expect(pickLatestPerType(rows)[0].file_url).toBe('ב')
  })
})
