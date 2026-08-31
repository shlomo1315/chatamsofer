import { describe, it, expect } from 'vitest'
import { groupDocsByType } from './groupDocsByType'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כמה קבצים מאותו סוג — כרטיס אחד.
//
// מה שנצפה: משפחה העלתה שני צדדים של ת"ז האישה בשני קבצים (וזו התנהגות
// תקינה ומכוונת — ראו appendMode ב-upload-docs). המסך הציג שני כרטיסים
// נפרדים בשם זהה, וזה נראה ככפילות או כתקלה.
//
// ⚠️ הקבצים *אינם* ממוזגים פיזית: מיזוג PDF נכשל על קובץ פגום ומאבד את
// המסמך. הקיבוץ הוא תצוגתי בלבד.
// ─────────────────────────────────────────────────────────────────────────────

const doc = (doc_type: string, file_url: string, uploaded_at = '2026-08-30') =>
  ({ doc_type, file_url, file_name: null, uploaded_at })

describe('groupDocsByType', () => {
  it('🔴 שני קבצים מאותו סוג → קבוצה אחת עם שניהם', () => {
    const out = groupDocsByType([
      doc('id_wife', 'a.pdf', '2026-08-30T11:34:11'),
      doc('id_wife', 'b.pdf', '2026-08-30T11:34:12'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].files).toHaveLength(2)
  })

  it('⚠️ הסדר לפי מועד ההעלאה — צד א׳ לפני צד ב׳', () => {
    const out = groupDocsByType([
      doc('id_wife', 'שני.pdf', '2026-08-30T11:34:12'),
      doc('id_wife', 'ראשון.pdf', '2026-08-30T11:34:11'),
    ])
    expect(out[0].files.map(f => f.file_url)).toEqual(['ראשון.pdf', 'שני.pdf'])
  })

  it('סוגים שונים נשארים נפרדים', () => {
    const out = groupDocsByType([doc('id_wife', 'a.pdf'), doc('id_husband', 'b.pdf')])
    expect(out).toHaveLength(2)
  })

  it('קובץ בודד — קבוצה עם קובץ אחד', () => {
    const out = groupDocsByType([doc('birth_cert', 'a.pdf')])
    expect(out[0].files).toHaveLength(1)
  })

  it('⚠️ שורה בלי קובץ מדולגת — אין מה לפתוח', () => {
    const out = groupDocsByType([doc('id_wife', ''), doc('id_wife', 'a.pdf')])
    expect(out[0].files).toHaveLength(1)
  })

  it('⚠️ סוג שכל קבציו ריקים אינו מייצר קבוצה ריקה', () => {
    expect(groupDocsByType([doc('id_wife', '')])).toEqual([])
  })

  it('רשימה ריקה', () => {
    expect(groupDocsByType([])).toEqual([])
  })
})
