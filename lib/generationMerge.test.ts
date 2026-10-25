import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { planGenerationMerge, executeGenerationMerge, MAX_GROUPS_PER_GENERATION } from './generationMerge'
import type { SafeNode } from './safeMergeGroups'

const n = (id: string, name: string, parent_id: string | null, generation: number, status: string | null = 'pending'): SafeNode =>
  ({ id, name, parent_id, generation, status })

// עץ קטן: שורש → שני "אברהם" כפולים (דור 1) → לכל אחד "יצחק" (דור 2).
// אחרי מיזוג דור 1, שני ה"יצחק" יהיו תחת אותו אב ויהפכו לקבוצה בטוחה חדשה.
function sampleTree(): SafeNode[] {
  return [
    n('root', 'מרן', null, 0, 'verified'),
    n('a1', 'אברהם', 'root', 1, 'verified'),
    n('a2', 'אברהם', 'root', 1),
    n('i1', 'יצחק', 'a1', 2),
    n('i2', 'יצחק', 'a2', 2),
    n('x1', 'משה', 'root', 1),
    n('x2', 'משה', 'root', 1),
    // שני "יעקב" תחת אבות שונים — לא בטוח
    n('j1', 'יעקב', 'i1', 3),
    n('j2', 'יעקב', 'i2', 3),
  ]
}

describe('planGenerationMerge', () => {
  it('בוחר רק את הדור הרדוד ביותר שיש בו קבוצות בטוחות', () => {
    const plan = planGenerationMerge(sampleTree(), new Map())
    expect(plan.generation).toBe(1)
    expect(plan.groups.every(g => g.generation === 1)).toBe(true)
    expect(plan.groups.map(g => g.name).sort()).toEqual(['אברהם', 'משה'])
  })

  it('לא כולל קבוצה עם אבות שונים', () => {
    const plan = planGenerationMerge(sampleTree(), new Map())
    const all = [...plan.groups.flatMap(g => [g.keepId, ...g.mergeIds])]
    expect(all).not.toContain('i1')
    expect(all).not.toContain('j1')
    expect(plan.upcoming).toEqual([])   // יצחק/יעקב עדיין תחת אבות שונים
  })

  it('מחריג קבוצה שיש לה יותר מכרטסת אחת', () => {
    const bens = new Map([['x1', 1], ['x2', 1]])
    const plan = planGenerationMerge(sampleTree(), bens)
    expect(plan.groups.map(g => g.name)).toEqual(['אברהם'])
    expect(plan.excluded).toHaveLength(1)
    expect(plan.excluded[0].name).toBe('משה')
    expect(plan.excluded[0].reason).toContain('2 כרטסות')
  })

  it('קבוצה עם כרטסת אחת בלבד נכללת, והכרטסת נספרת כמועברת', () => {
    const plan = planGenerationMerge(sampleTree(), new Map([['a2', 1]]))
    const g = plan.groups.find(x => x.name === 'אברהם')!
    expect(g.keepId).toBe('a1')          // המאומת נשמר
    expect(g.mergeIds).toEqual(['a2'])
    expect(g.movedChildren).toBe(1)
    expect(g.movedFamilies).toBe(1)
  })

  it('מתעלם מצמתים שנדחו', () => {
    const tree = sampleTree().map(x => x.id === 'x2' ? { ...x, status: 'rejected' } : x)
    const plan = planGenerationMerge(tree, new Map())
    expect(plan.groups.map(g => g.name)).toEqual(['אברהם'])
  })

  it('טביעת האצבע יציבה, ומשתנה כשהעץ משתנה', () => {
    const a = planGenerationMerge(sampleTree(), new Map())
    const b = planGenerationMerge(sampleTree().reverse(), new Map())
    expect(a.fingerprint).toBe(b.fingerprint)
    const c = planGenerationMerge([...sampleTree(), n('a3', 'אברהם', 'root', 1)], new Map())
    expect(c.fingerprint).not.toBe(a.fingerprint)
    const d = planGenerationMerge(sampleTree(), new Map([['a2', 1]]))
    expect(d.fingerprint).not.toBe(a.fingerprint)
  })

  it('מגביל את מספר הקבוצות בדור אחד ומדווח על השאר', () => {
    const nodes: SafeNode[] = [n('root', 'מרן', null, 0)]
    for (let i = 0; i < MAX_GROUPS_PER_GENERATION + 5; i++) {
      nodes.push(n(`p${i}a`, `שם ${i}`, 'root', 1), n(`p${i}b`, `שם ${i}`, 'root', 1))
    }
    const plan = planGenerationMerge(nodes, new Map())
    expect(plan.groups).toHaveLength(MAX_GROUPS_PER_GENERATION)
    expect(plan.deferred).toBe(5)
  })

  it('עץ נקי — אין דור למיזוג', () => {
    const plan = planGenerationMerge([n('root', 'מרן', null, 0), n('a', 'א', 'root', 1)], new Map())
    expect(plan.generation).toBeNull()
    expect(plan.groups).toEqual([])
  })
})

// ── מסד מדומה בזיכרון: מיזוג מעביר ילדים וכרטסות ורושם יומן; ביטול משחזר ──
function fakeDb(nodes: SafeNode[], bens: { id: string; node: string }[]) {
  const state = {
    nodes: new Map(nodes.map(x => [x.id, { ...x }])),
    bens: new Map(bens.map(b => [b.id, b.node])),
    log: [] as { batchId: string; keepId: string; node: SafeNode; kids: string[]; bens: string[]; undone: boolean }[],
  }
  const merge = vi.fn(async (_db: SupabaseClient, o: { keepId: string; mergeIds: string[]; batchId: string }) => {
    let children = 0, families = 0
    for (const mid of o.mergeIds) {
      const kids = [...state.nodes.values()].filter(x => x.parent_id === mid).map(x => x.id)
      kids.forEach(k => { state.nodes.get(k)!.parent_id = o.keepId })
      const bs = [...state.bens].filter(([, nd]) => nd === mid).map(([id]) => id)
      bs.forEach(b => state.bens.set(b, o.keepId))
      state.log.push({ batchId: o.batchId, keepId: o.keepId, node: { ...state.nodes.get(mid)! }, kids, bens: bs, undone: false })
      state.nodes.delete(mid)
      children += kids.length
      families += bs.length
    }
    return { batchId: o.batchId, mergedCount: o.mergeIds.length, cascadedCount: 0, reassignedChildren: children, reassignedBeneficiaries: families }
  })
  const undo = vi.fn(async (_db: SupabaseClient, batchId: string) => {
    let restored = 0
    for (const r of [...state.log].reverse()) {
      if (r.batchId !== batchId || r.undone) continue
      state.nodes.set(r.node.id, { ...r.node })
      r.kids.forEach(k => { state.nodes.get(k)!.parent_id = r.node.id })
      r.bens.forEach(b => state.bens.set(b, r.node.id))
      r.undone = true
      restored++
    }
    return restored
  })
  const snapshot = () => ({
    nodes: [...state.nodes.values()].map(x => `${x.id}:${x.parent_id}`).sort(),
    bens: [...state.bens].map(([b, nd]) => `${b}:${nd}`).sort(),
  })
  return { state, merge, undo, snapshot }
}

const db = {} as SupabaseClient

describe('executeGenerationMerge', () => {
  it('לא מאבד נתונים: כל הילדים והכרטסות עוברים לשורד', async () => {
    const tree = sampleTree()
    const f = fakeDb(tree, [{ id: 'b1', node: 'a2' }])
    const plan = planGenerationMerge(tree, new Map([['a2', 1]]))
    const res = await executeGenerationMerge(db, plan, { batchId: 'B1', merge: f.merge as never, undo: f.undo as never })

    expect(res.ok).toBe(true)
    expect(res.merged).toBe(2)
    expect(res.removed).toBe(2)
    expect(f.state.nodes.has('a2')).toBe(false)
    expect(f.state.nodes.get('i2')!.parent_id).toBe('a1')   // הילד עבר
    expect(f.state.bens.get('b1')).toBe('a1')                // הכרטסת עברה
    expect(f.state.nodes.size).toBe(tree.length - 2)         // רק הכפילויות נמחקו
    expect(f.undo).not.toHaveBeenCalled()
    // כל מיזוג נרשם ביומן תחת אותו batchId — לשחזור
    expect(f.state.log.map(l => l.batchId)).toEqual(['B1', 'B1'])
    // בלי מפל
    for (const call of f.merge.mock.calls) {
      expect(call[1]).toMatchObject({ cascadeDown: false, cascadeUp: false, cascadeUpApprox: false })
    }
  })

  it('אחרי מיזוג דור 1, הדור הבא מציג את הקבוצה החדשה שנוצרה', async () => {
    const tree = sampleTree()
    const f = fakeDb(tree, [])
    await executeGenerationMerge(db, planGenerationMerge(tree, new Map()), { batchId: 'B1', merge: f.merge as never, undo: f.undo as never })
    const next = planGenerationMerge([...f.state.nodes.values()], new Map())
    expect(next.generation).toBe(2)
    expect(next.groups.map(g => g.name)).toEqual(['יצחק'])
  })

  it('כישלון באמצע מבטל את כל הדור ומחזיר את המצב המקורי', async () => {
    const tree = sampleTree()
    const f = fakeDb(tree, [{ id: 'b1', node: 'a2' }])
    const before = f.snapshot()
    const plan = planGenerationMerge(tree, new Map([['a2', 1]]))
    let calls = 0
    const failing = vi.fn(async (d: SupabaseClient, o: Parameters<typeof f.merge>[1]) => {
      if (++calls === 2) throw new Error('תקלת רשת')
      return f.merge(d, o)
    })
    const res = await executeGenerationMerge(db, plan, { batchId: 'B2', merge: failing as never, undo: f.undo as never })

    expect(res.ok).toBe(false)
    expect(res.failure?.reason).toBe('תקלת רשת')
    expect(f.undo).toHaveBeenCalledWith(db, 'B2')
    expect(res.rolledBack).toBe(1)
    expect(res.merged).toBe(0)
    expect(f.snapshot()).toEqual(before)
  })

  it('אם גם הביטול האוטומטי נכשל — מדווח במפורש', async () => {
    const plan = planGenerationMerge(sampleTree(), new Map())
    const merge = vi.fn().mockRejectedValue(new Error('נפל'))
    const undo = vi.fn().mockRejectedValue(new Error('ביטול נפל'))
    const res = await executeGenerationMerge(db, plan, { batchId: 'B3', merge, undo })
    expect(res.ok).toBe(false)
    expect(res.rollbackError).toBe('ביטול נפל')
  })
})
