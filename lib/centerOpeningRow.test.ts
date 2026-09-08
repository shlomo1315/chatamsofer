import { describe, it, expect, vi } from 'vitest'
import { ensureCenterOpening } from '@/lib/centerOpeningRow'

// ─────────────────────────────────────────────────────────────────────────────
// שורת הפתיחה של מוקד בחלוקה.
//
// 🔴 הרגרסיה שהטסטים האלה שומרים עליה (חלוקת תשרי): 6,108 משפחות בחרו מוקד,
// אך רק ל-4 מוקדים מתוך 26 הייתה שורה ב-holiday_center_openings. כפתור
// "טרם מחלק" עושה update ולא upsert — בלי שורה הוא מצא 0 שורות והחזיר 404,
// כלומר 22 מוקדים ו-4,651 משפחות לא יכלו לעבור לשלב חלוקת הכרטיסים.
//
// הבחירה עצמה היא שיוצרת את השורה, ולכן היא חייבת להיווצר בכל שלושת הערוצים.
// ─────────────────────────────────────────────────────────────────────────────

/** מדמה את שרשרת ה-upsert של supabase-js ומתעד במה נקראה. */
function fakeDb(result: { error: { message: string } | null } = { error: null }) {
  const calls: { table: string; row: unknown; opts: unknown }[] = []
  const db = {
    from(table: string) {
      return {
        upsert(row: unknown, opts: unknown) {
          calls.push({ table, row, opts })
          return Promise.resolve(result)
        },
      }
    },
  }
  return { db, calls }
}

describe('ensureCenterOpening', () => {
  it('יוצרת שורת פתיחה למוקד שנבחר', async () => {
    const { db, calls } = fakeDb()

    await ensureCenterOpening(db as never, 'dist-1', 'center-1')

    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('holiday_center_openings')
    expect(calls[0].row).toEqual({ distribution_id: 'dist-1', center_id: 'center-1' })
  })

  it('אינה פותחת את המוקד לחלוקת כרטיסים', async () => {
    const { db, calls } = fakeDb()

    await ensureCenterOpening(db as never, 'dist-1', 'center-1')

    // 🔴 הליבה: בחירה ≠ חלוקה. שורה שנוצרת מרישום חייבת להשאיר את
    // pickup_open_at ריק, אחרת המוקד "מחלק כרטיסים" בלי שאיש החליט על כך.
    expect(calls[0].row).not.toHaveProperty('pickup_open_at')
  })

  it('אינה דורסת שורה קיימת — ובכך אינה מאפסת מוקד שכבר מחלק', async () => {
    const { db, calls } = fakeDb()

    await ensureCenterOpening(db as never, 'dist-1', 'center-1')

    // ⚠️ ignoreDuplicates: בלעדיו upsert *מעדכן* שורה קיימת, ובחירה של
    // משפחה אחת הייתה מאפסת את pickup_open_at של מוקד פעיל ומפילה את
    // כל שיוכי הכרטיסים בו.
    expect(calls[0].opts).toMatchObject({
      onConflict: 'distribution_id,center_id',
      ignoreDuplicates: true,
    })
  })

  it('בולעת כשל ומחזירה false — הבחירה של המשפחה כבר נשמרה', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb({ error: { message: 'boom' } })

    // ⚠️ הבחירה נשמרה לפני הקריאה הזו. זריקה כאן הייתה מחזירה למשפחה
    // "השמירה נכשלה" על בחירה שדווקא הצליחה.
    await expect(ensureCenterOpening(db as never, 'dist-1', 'center-1')).resolves.toBe(false)

    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('מדלגת בשקט כשאין מזהה מוקד', async () => {
    const { db, calls } = fakeDb()

    await expect(ensureCenterOpening(db as never, 'dist-1', '')).resolves.toBe(false)
    expect(calls).toHaveLength(0)
  })
})
