// צומת בעץ לכל נרשם — והכלל שאין עליו פשרה: **בלי לייצר כפילות**.
//
// הפונקציה הזו תרוץ על ~5,900 משפחות קיימות ואז על כל רישום חדש. יצירה כפולה
// כאן פירושה להכפיל את הבלגן שהמנהל בדיוק מנקה (660 קבוצות כפילויות), ולכן
// הבדיקות מתמקדות בכל מסלול שבו הצומת *כבר קיים* בצורה אחרת.
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureBeneficiaryNode, beneficiaryNodeName } from './beneficiaryNode'

type Node = { id: string; name: string; parent_id: string | null; generation: number; status: string | null; id_number: string | null; relation?: string | null }
type Ben = { id: string; id_number: string | null; full_name: string | null; spouse_name: string | null; family_name: string | null; gender: string | null; lineage_node_id: string | null }

// מסד מדומה מינימלי שמכסה בדיוק את הקריאות שהפונקציה עושה.
function fakeDb(nodes: Node[], bens: Ben[]) {
  let seq = 0
  const db = {
    from(table: string) {
      if (table === 'lineage_nodes') {
        const filters: { col: string; val: unknown }[] = []
        const api: Record<string, unknown> = {
          select() { return api },
          eq(col: string, val: unknown) { filters.push({ col, val }); return api },
          in(col: string, vals: unknown[]) { filters.push({ col, val: vals }); return api },
          limit() { return api },
          maybeSingle() {
            const hit = nodes.find(n => filters.every(f => (n as unknown as Record<string, unknown>)[f.col] === f.val))
            return Promise.resolve({ data: hit ?? null, error: null })
          },
          single() {
            const hit = nodes[nodes.length - 1]
            return Promise.resolve({ data: hit ? { id: hit.id } : null, error: null })
          },
          insert(row: Record<string, unknown>) {
            const created: Node = {
              id: `new-${++seq}`,
              name: String(row.name),
              parent_id: (row.parent_id as string) ?? null,
              generation: Number(row.generation),
              status: (row.status as string) ?? null,
              id_number: (row.id_number as string) ?? null,
              relation: (row.relation as string) ?? null,
            }
            nodes.push(created)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: created.id }, error: null }) }) }
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(col: string, val: unknown) {
                for (const n of nodes) {
                  if ((n as unknown as Record<string, unknown>)[col] === val) Object.assign(n, patch)
                }
                return Promise.resolve({ error: null })
              },
            }
          },
          then(res: (v: { data: Node[]; error: null }) => unknown) {
            const rows = nodes.filter(n => filters.every(f => (n as unknown as Record<string, unknown>)[f.col] === f.val))
            return Promise.resolve(res({ data: rows, error: null }))
          },
        }
        return api
      }
      // beneficiaries
      return {
        update(patch: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              for (const b of bens) {
                if ((b as unknown as Record<string, unknown>)[col] === val) Object.assign(b, patch)
              }
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }
  return db as unknown as SupabaseClient
}

const father: Node = { id: 'father', name: 'רבי אברהם ניסן ומרת רבקה דויטש', parent_id: 'gramps', generation: 7, status: 'verified', id_number: null }
const ben = (over: Partial<Ben> = {}): Ben => ({
  id: 'b1', id_number: '123456789', full_name: 'יצחק', spouse_name: 'שרה',
  family_name: 'דויטש', gender: 'male', lineage_node_id: 'father', ...over,
})

describe('beneficiaryNodeName', () => {
  it('בונה את הניסוח האחיד של העץ', () => {
    expect(beneficiaryNodeName(ben())).toBe('רבי יצחק ומרת שרה דויטש')
  })
  it('בלי שם אישה — רק הבעל', () => {
    expect(beneficiaryNodeName(ben({ spouse_name: null }))).toBe('רבי יצחק דויטש')
  })
  it('בלי שם בכלל — מחרוזת ריקה (לא ייבנה צומת)', () => {
    expect(beneficiaryNodeName(ben({ full_name: null, spouse_name: null, family_name: null }))).toBe('')
  })
})

describe('ensureBeneficiaryNode', () => {
  it('נרשם בלי צומת משלו — נוצר צומת ממתין תחת האב, והקישור עובר אליו', async () => {
    const nodes = [{ ...father }]
    const bens = [ben()]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, bens[0])

    expect(res).toMatchObject({ ok: true, created: true, adopted: false })
    const created = nodes.find(n => n.id !== 'father')!
    expect(created.name).toBe('רבי יצחק ומרת שרה דויטש')
    expect(created.parent_id).toBe('father')
    expect(created.generation).toBe(8)
    // ⚠️ ממתין לאישור — לא מאומת. האישור הוא החלטה של הצוות.
    expect(created.status).toBe('pending')
    expect(created.id_number).toBe('123456789')
    // הכרטסת מצביעה עכשיו על הצומת שלו ולא על האב
    expect(bens[0].lineage_node_id).toBe(created.id)
  })

  it('⚠️ הרצה שנייה אינה יוצרת כפילות', async () => {
    const nodes = [{ ...father }]
    const bens = [ben()]
    const db = fakeDb(nodes, bens)

    await ensureBeneficiaryNode(db, bens[0])
    const before = nodes.length
    const second = await ensureBeneficiaryNode(db, bens[0])

    expect(nodes.length).toBe(before)
    expect(second).toMatchObject({ ok: true, created: false })
  })

  it('⚠️ הת"ז שלו כבר בעץ במקום אחר — מתקשר אליו ולא נוצר חדש', async () => {
    // התרחיש: הוא נכנס לעץ כילד כשמשפחת הוריו אושרה.
    const nodes = [
      { ...father },
      { id: 'as-child', name: 'רבי יצחק דויטש', parent_id: 'father', generation: 8, status: 'verified', id_number: '123456789' },
    ]
    const bens = [ben()]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, bens[0])

    expect(res).toMatchObject({ ok: true, created: false, adopted: true, nodeId: 'as-child' })
    expect(nodes.length).toBe(2)
    expect(bens[0].lineage_node_id).toBe('as-child')
    // ⚠️ סטטוס קיים אינו נוגע — אימוץ לא מוריד צומת מאומת ל"ממתין"
    expect(nodes[1].status).toBe('verified')
  })

  it('⚠️ שם זהה תחת אותו אב — מאמץ ומסמן עליו את הת"ז', async () => {
    const nodes = [
      { ...father },
      { id: 'twin', name: 'רבי יצחק ומרת שרה דויטש', parent_id: 'father', generation: 8, status: 'pending', id_number: null },
    ]
    const bens = [ben()]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, bens[0])

    expect(res).toMatchObject({ ok: true, created: false, adopted: true, nodeId: 'twin' })
    expect(nodes.length).toBe(2)
    expect(nodes[1].id_number).toBe('123456789')
  })

  it('הצומת שהוא מקושר אליו הוא כבר שלו — אין פעולה', async () => {
    // כך נראה נרשם שהוסיף דורות ידנית: הצומת האחרון שנוצר הוא שלו.
    const nodes = [{ ...father, id_number: '123456789' }]
    const bens = [ben()]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, bens[0])

    expect(res).toMatchObject({ ok: true, created: false, adopted: false, nodeId: 'father' })
    expect(nodes.length).toBe(1)
  })

  it('בלי שיוך לעץ או בלי שם — מדווח ואינו יוצר כלום', async () => {
    const nodes = [{ ...father }]
    const noLink = await ensureBeneficiaryNode(fakeDb(nodes, []), ben({ lineage_node_id: null }))
    expect(noLink).toEqual({ ok: false, reason: 'אין שיוך לעץ' })

    const noName = await ensureBeneficiaryNode(fakeDb(nodes, []), ben({ full_name: null, spouse_name: null, family_name: null }))
    expect(noName).toEqual({ ok: false, reason: 'אין שם לבניית צומת' })
    expect(nodes.length).toBe(1)
  })

  it('בת — הקשר מסומן כחתן (השושלת ממשיכה דרך הבעל)', async () => {
    const nodes = [{ ...father }]
    const bens = [ben({ gender: 'female' })]
    await ensureBeneficiaryNode(fakeDb(nodes, bens), bens[0])
    expect(nodes.find(n => n.id !== 'father')!.relation).toBe('son_in_law')
  })
})
