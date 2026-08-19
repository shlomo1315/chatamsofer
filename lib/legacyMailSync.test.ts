import { describe, it, expect } from 'vitest'
import { applyLabelToExistingMail, type GmailAccount } from './legacyMailSync'

// mock supabase מינימלי — עוקב אחרי ה-upsert של mail_label_assignments.
//
// ⚠️ השאילתה עוברת דרך fetchAllRows, ולכן ה-mock חייב לתמוך ב-range ולהחזיר
// דף חלקי (פחות מ-1000) כדי לסמן סוף. בלי זה fetchAllRows היה מבקש דף נוסף
// לנצח. `sawFilter` מתעד לפי מה סוננה השאילתה — זה מה שמגן על התיקון:
// השיוך חייב להיות לפי gmail_account_id ולא לפי department בלבד.
function mockDb(
  legacyRows: { id: string }[],
  existingAssignments: Record<string, string[]> = {},
  opts?: { siblings?: number; unassignedRows?: { id: string }[] },
) {
  let saved: Record<string, string[]> | null = null
  const filters: Record<string, unknown>[] = []
  const db = {
    from(table: string) {
      if (table === 'gmail_accounts') {
        // ספירת התיבות באותה מחלקה (head:true + count)
        return {
          select() { return this },
          eq() { return Promise.resolve({ count: opts?.siblings ?? 1 }) },
        }
      }
      if (table === 'inbound_emails') {
        const f: Record<string, unknown> = {}
        filters.push(f)
        return {
          select() { return this },
          eq(col: string, val: unknown) { f[col] = val; return this },
          // ⚠️ is() מסמן את שאילתת הנפילה (gmail_account_id IS NULL) ומובחן
          // מ-eq: שתי השאילתות נוגעות באותה עמודה, ובלי ההבחנה הזו ה-mock
          // היה מחזיר את אותן שורות לשתיהן.
          is(col: string, val: unknown) { f['is:' + col] = val; return this },
          range(from: number) {
            // דף ראשון בלבד — השאר ריק, כך fetchAllRows עוצר.
            if (from > 0) return Promise.resolve({ data: [], error: null })
            const isFallback = f['is:gmail_account_id'] !== undefined
            return Promise.resolve({
              data: isFallback ? (opts?.unassignedRows ?? []) : legacyRows,
              error: null,
            })
          },
        }
      }
      // app_settings
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() { return Promise.resolve({ data: { value: JSON.stringify(existingAssignments) } }) },
        upsert(row: { value: string }) { saved = JSON.parse(row.value); return Promise.resolve({}) },
      }
    },
  }
  return { db, getSaved: () => saved, getFilters: () => filters }
}

const account = (labelId: string | null): GmailAccount => ({
  id: 'acc1', refresh_token: 't', department: 'maternity', label_id: labelId,
})

describe('applyLabelToExistingMail', () => {
  it('מוסיף את התווית לכל המיילים הישנים של המחלקה', async () => {
    const { db, getSaved } = mockDb([{ id: 'm1' }, { id: 'm2' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await applyLabelToExistingMail(db as any, account('lbl-x'))
    expect(count).toBe(2)
    expect(getSaved()).toEqual({ m1: ['lbl-x'], m2: ['lbl-x'] })
  })

  it('לא מכפיל תווית שכבר קיימת על המייל', async () => {
    const { db, getSaved } = mockDb([{ id: 'm1' }, { id: 'm2' }], { m1: ['lbl-x'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await applyLabelToExistingMail(db as any, account('lbl-x'))
    expect(count).toBe(1) // רק m2 נוסף
    expect(getSaved()).toEqual({ m1: ['lbl-x'], m2: ['lbl-x'] })
  })

  it('שומר תוויות אחרות שכבר על המייל', async () => {
    const { db, getSaved } = mockDb([{ id: 'm1' }], { m1: ['other'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyLabelToExistingMail(db as any, account('lbl-x'))
    expect(getSaved()).toEqual({ m1: ['other', 'lbl-x'] })
  })

  // 🔴 הבאג שהתיקון סוגר: השיוך היה לפי department בלבד, ולכן כששלוש תיבות
  // חלקו מחלקה אחת, "שייך תווית" באחת מהן תייג את מיילי כולן. בפועל תיבה
  // שאליה שויכו 0 מיילים תייגה 1,000 הודעות בשם עצמה.
  it('🔴 מסנן לפי התיבה (gmail_account_id) ולא לפי המחלקה', async () => {
    const { db, getFilters } = mockDb([{ id: 'm1' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyLabelToExistingMail(db as any, account('lbl-x'))
    const byAccount = getFilters().find(f => f.gmail_account_id !== undefined)
    expect(byAccount).toBeDefined()
    expect(byAccount!.gmail_account_id).toBe('acc1')
  })

  // הנפילה למחלקה קיימת רק למיילים ישנים (gmail_account_id ריק) *וגם* רק
  // כשיש תיבה יחידה במחלקה — אחרת אין דרך לדעת מאיזו תיבה הגיעו.
  it('🔴 לא נופל למחלקה כשיש יותר מתיבה אחת בה', async () => {
    const { db, getSaved } = mockDb(
      [], {}, { siblings: 3, unassignedRows: [{ id: 'old1' }, { id: 'old2' }] },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await applyLabelToExistingMail(db as any, account('lbl-x'))
    expect(count).toBe(0)
    expect(getSaved()).toBeNull()
  })

  it('נופל למחלקה למיילים ישנים כשהתיבה יחידה במחלקה', async () => {
    const { db, getSaved } = mockDb(
      [], {}, { siblings: 1, unassignedRows: [{ id: 'old1' }] },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await applyLabelToExistingMail(db as any, account('lbl-x'))
    expect(count).toBe(1)
    expect(getSaved()).toEqual({ old1: ['lbl-x'] })
  })

  it('מחזיר 0 כשאין תווית לתיבה', async () => {
    const { db } = mockDb([{ id: 'm1' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await applyLabelToExistingMail(db as any, account(null))
    expect(count).toBe(0)
  })
})
