import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { attachGenerationsBelow, type ChainEntry } from './lineageAssignBelow'
import { pathToRoot, chainFromPath, type TreeNodeRow } from './lineageSync'

// ─────────────────────────────────────────────────────────────────────────────
// תיקון דור 3 בשרשרת של 5 דורות (13.11): אחרי השמירה הכרטסת קוראת את המסלול
// בעץ מ-lineage_node_id, ו-lineageSync גוזר ממנו את השרשרת. לכן התיקון "נשמר"
// רק אם העלה של הצאצא יושב בעץ מתחת לצומת החדש של דור 3.
// ─────────────────────────────────────────────────────────────────────────────

type Row = TreeNodeRow & { id: string }

function fakeDb(nodes: Row[]) {
  let seq = 0
  const db = {
    from() {
      const filters: [string, unknown][] = []
      const rows = () => nodes.filter(n => filters.every(([k, v]) => (n as unknown as Record<string, unknown>)[k] === v))
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: rows(), error: null }),
        insert: (row: Omit<Row, 'id'>) => {
          const created = { ...row, id: `new${++seq}` } as Row
          nodes.push(created)
          return { select: () => ({ single: async () => ({ data: created, error: null }) }) }
        },
      }
      return q
    },
  }
  return db as unknown as SupabaseClient
}

const n = (id: string, name: string, parent: string | null, gen: number): Row =>
  ({ id, name, parent_id: parent, generation: gen, status: 'verified', relation: 'son' }) as Row

// השרשרת השמורה אחרי המיזוג בנתיב: דורות 1–3 מהצומת החדש + 4–5 שנשמרו.
const mergedChain: ChainEntry[] = [
  { generation: 1, name: 'שורש', relation: null },
  { generation: 2, name: 'אברהם', relation: 'son' },
  { generation: 3, name: 'יצחק חדש', relation: 'son' },
  { generation: 4, name: 'יעקב', relation: 'son' },
  { generation: 5, name: 'יוסף', relation: 'son' },
]

function baseTree(): Row[] {
  return [
    n('r', 'שורש', null, 1),
    n('a', 'אברהם', 'r', 2),
    n('b', 'יצחק ישן', 'a', 3),
    n('c', 'יעקב', 'b', 4),
    n('d', 'יוסף', 'c', 5),   // העלה הישן של הצאצא
    n('b2', 'יצחק חדש', 'a', 3), // הצומת שנבחר לתיקון דור 3
  ]
}

describe('תיקון דור באמצע השרשרת', () => {
  it('הדורות 4–5 נבנים תחת הצומת החדש, והעלה מצביע עליהם', async () => {
    const tree = baseTree()
    const { leafId, below } = await attachGenerationsBelow(fakeDb(tree), { id: 'b2', generation: 3 }, mergedChain)

    expect(leafId).not.toBe('d')
    const path = pathToRoot(tree, leafId)
    // מה שהכרטסת מציגה אחרי רענון
    expect(path.map(p => p.name)).toEqual(['שורש', 'אברהם', 'יצחק חדש', 'יעקב', 'יוסף'])
    // מה ש-lineageSync יכתוב — זהה לשרשרת השמורה, ולכן לא דורס את התיקון
    expect(chainFromPath(path).map(e => [e.generation, e.name])).toEqual(mergedChain.map(e => [e.generation, e.name]))
    expect(below.map(e => e.name)).toEqual(['יעקב', 'יוסף'])
    // הענף הישן לא זז — ייתכן שצאצאים אחרים משויכים אליו
    expect(tree.find(x => x.id === 'c')?.parent_id).toBe('b')
    // צמתים חדשים נוצרים כממתינים
    expect(tree.filter(x => x.id.startsWith('new')).every(x => x.status === 'pending')).toBe(true)
  })

  it('ענף קיים תחת הצומת החדש ממוחזר ולא משוכפל', async () => {
    const tree = [...baseTree(), n('c2', 'יעקב', 'b2', 4), n('d2', 'יוסף', 'c2', 5)]
    const before = tree.length
    const { leafId } = await attachGenerationsBelow(fakeDb(tree), { id: 'b2', generation: 3 }, mergedChain)
    expect(leafId).toBe('d2')
    expect(tree.length).toBe(before)
  })

  it('בלי דורות מתחת — הצומת שנבחר הוא העלה', async () => {
    const tree = baseTree()
    const { leafId, below } = await attachGenerationsBelow(fakeDb(tree), { id: 'b2', generation: 3 }, mergedChain.slice(0, 3))
    expect(leafId).toBe('b2')
    expect(below).toEqual([])
  })
})
