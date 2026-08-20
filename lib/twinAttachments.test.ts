import { describe, it, expect } from 'vitest'
import { mergeTwinAttachments } from './twinAttachments'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 Google dual-delivery מייצר שני עותקים של אותו מייל, ובאחד מהם
// הצירופים חסרים. נמדד בפועל: מתוך 136 בקשות ב-14 יום, 74 הגיעו כפול,
// ובכ-17 מהן עותק אחד היה ריק מצירופים.
//
// אם העותק הריק נקלט ראשון — המשפחה מקבלת "לא נמצא קובץ" למרות ששלחה
// את הכול. עד היום המזל היה לצידנו; זה לא ערובה.
// ─────────────────────────────────────────────────────────────────────────────

const att = (filename: string) => ({ filename, url: `https://x/${filename}`, mimeType: 'application/pdf', size: 1 })

describe('🔴 צירופים מהעותק התאום', () => {
  it('העותק הריק מאמץ את הצירופים של התאום', () => {
    const out = mergeTwinAttachments([], [att('אישור-לידה.pdf'), att('תעודת-זהות-בעל.pdf')])
    expect(out.map(a => a.filename)).toEqual(['אישור-לידה.pdf', 'תעודת-זהות-בעל.pdf'])
  })

  it('עותק שיש בו צירופים אינו משתנה', () => {
    const mine = [att('אישור-לידה.pdf')]
    expect(mergeTwinAttachments(mine, [att('אחר.pdf')])).toEqual(mine)
  })

  it('שני העותקים ריקים — נשאר ריק', () => {
    expect(mergeTwinAttachments([], [])).toEqual([])
  })

  it('ללא תאום כלל — נשאר כפי שהוא', () => {
    expect(mergeTwinAttachments([], undefined)).toEqual([])
    expect(mergeTwinAttachments([att('a.pdf')], undefined).length).toBe(1)
  })

  // ⚠️ צירוף בלי url חסר תועלת — הקליטה שומרת לפי הכתובת.
  it('מתעלם מצירופים בלי כתובת', () => {
    const broken = [{ filename: 'x.pdf', url: '', mimeType: 'application/pdf', size: 1 }]
    expect(mergeTwinAttachments([], broken)).toEqual([])
  })
})
