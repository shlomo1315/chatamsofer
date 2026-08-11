import { describe, it, expect } from 'vitest'
import { pickChildrenForTree, childRelation, syncApprovedFamilyChildren } from './lineageFamilyChildren'
import type { SupabaseClient } from '@supabase/supabase-js'

// מסד מזויף מינימלי — רק המסלולים ש-syncApprovedFamilyChildren נוגע בהם.
function fakeDb(o: {
  siblings?: { id: string; name: string; status: string | null; id_number: string | null }[]
  onInsert?: (row: Record<string, unknown>) => void
  onUpdate?: (row: Record<string, unknown>) => void
}): SupabaseClient {
  const sibs = o.siblings ?? []
  return {
    from: () => ({
      select: () => ({
        eq: (col: string) => ({
          maybeSingle: async () => col === 'id'
            ? { data: { id: 'P', generation: 7 }, error: null }   // ההורה
            : { data: null, error: null },
          limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          then: undefined,
          // .eq('parent_id', …) מוחזר כמערך האחים
          data: sibs, error: null,
        }),
      }),
      insert: async (row: Record<string, unknown>) => { o.onInsert?.(row); return { error: null } },
      update: (row: Record<string, unknown>) => ({
        eq: async () => { o.onUpdate?.(row); return { error: null } },
      }),
    }),
  } as unknown as SupabaseClient
}

// ─────────────────────────────────────────────────────────────────────────────
// מי מבין ילדי המשפחה נכנס לעץ הדורות כשהמשפחה מאושרת.
//
// ⚠️ הכלל שנשמר כאן: רק ילד שהוזן *במלואו* (שם + תיעוד) נכנס. שורה חלקית
// שנשארה בטופס אינה אדם, וצומת שנוצר ממנה היה זבל קבוע בעץ שמישהו צריך
// לנקות ביד. הת"ז היא גם המפתח שמונע יצירה כפולה באישור הבא של אותה משפחה.
// ─────────────────────────────────────────────────────────────────────────────

describe('בחירת הילדים שייכנסו לעץ', () => {
  it('ילד עם שם ות"ז תקינה נכנס', () => {
    const out = pickChildrenForTree([{ name: 'יעקב כהן', id_number: '123456789', gender: 'male' }])
    expect(out).toEqual([{ name: 'יעקב כהן', idNumber: '123456789', relation: 'son' }])
  })

  it('ילד בלי ת"ז או בלי שם אינו נכנס', () => {
    const out = pickChildrenForTree([
      { name: 'בלי תז', id_number: '' },
      { name: '', id_number: '123456789' },
      { name: 'תז חלקית', id_number: '1234' },
    ])
    expect(out).toEqual([])
  })

  it('דרכון מתקבל כפי שהוזן', () => {
    // ילד שנולד בחו"ל — בלי זה לא היה נכנס לעץ כלל
    const out = pickChildrenForTree([{ name: 'שרה לוי', id_number: 'AB123456', id_doc_type: 'passport', gender: 'female' }])
    expect(out).toEqual([{ name: 'שרה לוי', idNumber: 'AB123456', relation: 'son_in_law' }])
  })

  it('אותה ת"ז פעמיים — נכנסת פעם אחת', () => {
    const out = pickChildrenForTree([
      { name: 'יעקב', id_number: '123456789' },
      { name: 'יעקב כהן', id_number: '123456789' },
    ])
    expect(out).toHaveLength(1)
  })

  it('ת"ז עם מקפים ורווחים מנורמלת לספרות', () => {
    const out = pickChildrenForTree([{ name: 'משה', id_number: '12-345 6789' }])
    expect(out[0].idNumber).toBe('123456789')
  })

  it('קלט שאינו מערך אינו מפיל', () => {
    expect(pickChildrenForTree(null)).toEqual([])
    expect(pickChildrenForTree('לא מערך')).toEqual([])
  })
})

describe('קשר הילד להורה בעץ', () => {
  it('בן → son · בת → son_in_law (השושלת דרך הבעל)', () => {
    expect(childRelation('male')).toBe('son')
    expect(childRelation('בן')).toBe('son')
    expect(childRelation('female')).toBe('son_in_law')
    expect(childRelation('בת')).toBe('son_in_law')
  })

  it('מין לא ידוע — בלי ניחוש', () => {
    expect(childRelation('')).toBeNull()
    expect(childRelation(undefined)).toBeNull()
    expect(childRelation('משהו אחר')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הכלל שנשבר פעם אחת וחייב להישאר נעול: סנכרון ילדי משפחה אינו קובע סטטוס.
//
// אישור משפחה יצר את כל ילדיה כמאומתים *וגם* קידם ילדים קיימים ל"מאומת".
// המנהל אישר אדם אחד וקיבל שבעה שמות ירוקים חדשים בעץ, בלי שאיש בדק אותם.
// ─────────────────────────────────────────────────────────────────────────────
describe('סנכרון ילדים אינו קובע סטטוס', () => {
  it('צומת חדש נוצר כ-pending, ולא כמאומת', async () => {
    const inserts: Record<string, unknown>[] = []
    const db = fakeDb({ onInsert: r => inserts.push(r) })
    await syncApprovedFamilyChildren(db, 'P', [
      { name: 'משה', id_number: '123456782', gender: 'male' },
    ])
    expect(inserts).toHaveLength(1)
    expect(inserts[0].status).toBe('pending')
  })

  it('סטטוס של צומת קיים אינו נגוע', async () => {
    const updates: Record<string, unknown>[] = []
    const db = fakeDb({
      siblings: [{ id: 'C1', name: 'משה', status: 'pending', id_number: null }],
      onUpdate: r => updates.push(r),
    })
    await syncApprovedFamilyChildren(db, 'P', [
      { name: 'משה', id_number: '123456782', gender: 'male' },
    ])
    // רק הת"ז נכתבת — היא עובדה מזהה, לא החלטה.
    expect(updates).toEqual([{ id_number: '123456782' }])
    expect(updates.some(u => 'status' in u)).toBe(false)
  })
})
