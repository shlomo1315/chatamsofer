import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הניוזלטר נתקע לחלוטין: הקמפיין נשאר 'sending' עם attempts=0.
//
// השורש: pg_try_advisory_lock הוא מנעול ברמת *סשן*, וכל קריאת RPC
// ל-Supabase עוברת דרך pgBouncer ומקבלת סשן אחר. התפיסה קרתה בסשן א'
// והשחרור רץ בסשן ב' — כלומר לא שחרר דבר. המנעול נשאר תפוס לנצח וכל
// ריצה עתידית יצאה מיד.
//
// ⚠️ הכישלון שקט: אין שגיאה, אין לוג, והמסך מציג "שליחה בתהליך" לנצח.
// ─────────────────────────────────────────────────────────────────────────────

/** מנעול מבוסס-טבלה עם פקיעה — הדפוס שהחליף את advisory lock. */
function makeLock() {
  const rows = new Map<number, { expires: number }>()
  return {
    try(key: number, now = Date.now()): boolean {
      const cur = rows.get(key)
      if (cur && cur.expires < now) rows.delete(key)   // פקע — מתנקה
      if (rows.has(key)) return false
      rows.set(key, { expires: now + 15 * 60_000 })
      return true
    },
    release(key: number): boolean { rows.delete(key); return true },
    held() { return rows.size },
  }
}

const KEY = 918273645

describe('🔴 מנעול ה-worker', () => {
  it('תפיסה ראשונה מצליחה, שנייה נחסמת', () => {
    const l = makeLock()
    expect(l.try(KEY)).toBe(true)
    expect(l.try(KEY)).toBe(false)
  })

  it('אחרי שחרור אפשר לתפוס שוב — זה מה שלא עבד', () => {
    const l = makeLock()
    l.try(KEY)
    l.release(KEY)
    expect(l.try(KEY)).toBe(true)
  })

  it('🔴 מנעול שפקע משחרר את עצמו — תהליך שמת לא חוסם לנצח', () => {
    const l = makeLock()
    const t0 = Date.now()
    expect(l.try(KEY, t0)).toBe(true)
    // התהליך מת בלי לשחרר (deploy/קריסה/timeout)
    expect(l.try(KEY, t0 + 60_000)).toBe(false)        // עדיין בתוקף
    expect(l.try(KEY, t0 + 16 * 60_000)).toBe(true)    // פקע — משתחרר
  })

  it('שחרור מפתח שאינו תפוס אינו זורק', () => {
    const l = makeLock()
    expect(l.release(KEY)).toBe(true)
    expect(l.held()).toBe(0)
  })

  it('מפתחות שונים אינם חוסמים זה את זה', () => {
    const l = makeLock()
    expect(l.try(KEY)).toBe(true)
    expect(l.try(771122334)).toBe(true)
  })
})
