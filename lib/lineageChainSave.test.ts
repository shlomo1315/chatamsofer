import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { saveChainByStaff, saveChainFromLink, earlyOk, type SaveDeps } from './lineageChainSave'
import { ROOT_NAME, type ChainStep } from './lineageChainEdit'

type Node = { id: string; parent_id: string | null; generation: number; name: string; relation?: string | null }

const TREE: Node[] = [
  { id: 'r', parent_id: null, generation: 1, name: 'מרן' },
  { id: 'n2', parent_id: 'r', generation: 2, name: 'א', relation: 'son' },
  { id: 'n3', parent_id: 'n2', generation: 3, name: 'ב', relation: 'son' },
  { id: 'n4', parent_id: 'n3', generation: 4, name: 'ג', relation: 'son' },
  { id: 'n5', parent_id: 'n4', generation: 5, name: 'ד', relation: 'son' },
  { id: 'n6', parent_id: 'n5', generation: 6, name: 'ה', relation: 'son' },
]

const chain = (...names: string[]): ChainStep[] => [
  { generation: 1, name: ROOT_NAME, relation: null },
  ...names.map((name, i) => ({ generation: i + 2, name, relation: 'son' as const })),
]

function fakeDb(ben: Record<string, unknown> | null) {
  const updates: { table: string; row: Record<string, unknown>; id: unknown }[] = []
  const inserts: { table: string; row: Record<string, unknown> }[] = []
  const db = {
    from(table: string) {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ben }) }) }),
        update: (row: Record<string, unknown>) => ({ eq: async (_c: string, id: unknown) => { updates.push({ table, row, id }); return { error: null } } }),
        insert: async (row: Record<string, unknown>) => { inserts.push({ table, row }); return { error: null } },
      }
    },
  }
  return { db: db as unknown as SupabaseClient, updates, inserts }
}

function deps(tree: Node[], movedTo: string | null, opts: { throws?: string } = {}): SaveDeps & { applyChain: ReturnType<typeof vi.fn> } {
  return {
    applyChain: vi.fn(async () => {
      if (opts.throws) throw new Error(opts.throws)
      return { createdNodes: 0, movedTo }
    }),
    loadNodes: async () => tree.map(n => ({ ...n })),
    logActivity: vi.fn(async () => {}),
    invalidate: vi.fn(),
  }
}

const BEN = { id: 'b1', lineage_chain: [{ generation: 2, name: 'ישן' }], lineage_chain_before_fix: null, lineage_node_id: 'old', eligibility_status: 'approved' }
const approvedAll = () => true

describe('saveChainByStaff — מזכירות ומנהל', () => {
  it('החלפת כל הסדר: עובר דרך העץ, מגבה את הישן, מאפס דורות ידניים, הסטטוס לא משתנה', async () => {
    const { db, updates } = fakeDb(BEN)
    const d = deps(TREE, 'n4')
    const res = await saveChainByStaff(db, d, 'b1', chain('א', 'ב', 'ג'), 'u1')
    expect(res).toMatchObject({ ok: true, applied: true })
    expect(d.applyChain).toHaveBeenCalledWith(db, 'b1', chain('א', 'ב', 'ג'))
    const benUpd = updates.find(u => u.table === 'beneficiaries')!
    expect(benUpd.row.lineage_chain_before_fix).toEqual(BEN.lineage_chain)
    expect(benUpd.row.lineage_manual).toEqual([])
    expect(benUpd.row.lineage_chain).toEqual([
      { generation: 1, name: 'מרן', relation: null },
      { generation: 2, name: 'א', relation: 'son' },
      { generation: 3, name: 'ב', relation: 'son' },
      { generation: 4, name: 'ג', relation: 'son' },
    ])
    expect(updates.some(u => 'eligibility_status' in u.row)).toBe(false)
    expect(d.invalidate).toHaveBeenCalled()
    expect(d.logActivity).toHaveBeenCalledWith(db, expect.objectContaining({ action: 'lineage_chain_edited', userId: 'u1' }))
  })

  it('סימון חתן בדור קיים מתעדכן בעץ (עם הרשאת עריכת עץ)', async () => {
    const { db, updates } = fakeDb(BEN)
    const c = chain('א', 'ב')
    c[2].relation = 'son_in_law'
    await saveChainByStaff(db, deps(TREE, 'n3'), 'b1', c, 'u1')
    expect(updates).toContainEqual({ table: 'lineage_nodes', row: { relation: 'son_in_law' }, id: 'n3' })
  })

  it('בלי הרשאת עריכת עץ — צומת קיים לא משתנה', async () => {
    const { db, updates } = fakeDb(BEN)
    const c = chain('א', 'ב')
    c[2].relation = 'son_in_law'
    await saveChainByStaff(db, deps(TREE, 'n3'), 'b1', c, 'u1', { canEditTree: false })
    expect(updates.some(u => u.table === 'lineage_nodes')).toBe(false)
  })

  it('גיבוי קיים לא נדרס בעריכה שנייה', async () => {
    const { db, updates } = fakeDb({ ...BEN, lineage_chain_before_fix: [{ generation: 2, name: 'מקורי' }] })
    await saveChainByStaff(db, deps(TREE, 'n3'), 'b1', chain('א', 'ב'), 'u1')
    expect(updates.find(u => u.table === 'beneficiaries')!.row).not.toHaveProperty('lineage_chain_before_fix')
  })

  it('משפחה לא משויכת לעץ — נשמר ומשויך', async () => {
    const { db } = fakeDb({ ...BEN, lineage_node_id: null, lineage_chain: null })
    const res = await saveChainByStaff(db, deps(TREE, 'n6'), 'b1', chain('א', 'ב', 'ג', 'ד', 'ה'), 'u1')
    expect(res).toMatchObject({ ok: true, applied: true })
  })

  it('מצב מעורפל — שגיאה ברורה ובלי כתיבה לכרטסת', async () => {
    const { db, updates } = fakeDb(BEN)
    const res = await saveChainByStaff(db, deps(TREE, null, { throws: 'בדור 3 קיימים 2 צמתים' }), 'b1', chain('א', 'ב'), 'u1')
    expect(res).toEqual({ ok: false, error: 'בדור 3 קיימים 2 צמתים' })
    expect(updates).toHaveLength(0)
  })

  it('כרטסת שלא קיימת', async () => {
    const { db } = fakeDb(null)
    expect(await saveChainByStaff(db, deps(TREE, null), 'x', chain('א'), 'u1')).toEqual({ ok: false, error: 'הכרטסת לא נמצאה' })
  })
})

describe('saveChainFromLink — קישור התיקון', () => {
  const inv = { token: 't1', root_node_id: 'r', recipient_name: 'חיה', beneficiary_id: 'b1' }

  it('5 דורות תקינים — מוחל מיד, חוזר לאישור ראשוני, בלי לגעת בסימון של צמתים קיימים', async () => {
    const { db, updates, inserts } = fakeDb(BEN)
    const c = chain('א', 'ב', 'ג', 'ד', 'ה')
    c[2].relation = 'son_in_law'
    const res = await saveChainFromLink(db, deps(TREE, 'n6'), inv, c, approvedAll)
    expect(res).toMatchObject({ ok: true, applied: true, status: 'pending' })
    expect(updates.some(u => u.table === 'lineage_nodes')).toBe(false)
    expect(updates).toContainEqual({ table: 'beneficiaries', row: { eligibility_status: 'pending', deep_review_reason: null }, id: 'b1' })
    expect(inserts).toHaveLength(0)
  })

  it('דור מוקדם שאינו בקובץ המאושר — נכנס לתור הצוות עם השרשרת, בלי החלה', async () => {
    const { db, inserts } = fakeDb(BEN)
    const d = deps(TREE, 'n6')
    const res = await saveChainFromLink(db, d, inv, chain('א', 'שגוי', 'ג', 'ד', 'ה'), (n) => n !== 'שגוי')
    expect(res).toMatchObject({ ok: true, applied: false })
    expect(d.applyChain).not.toHaveBeenCalled()
    expect(inserts[0].table).toBe('lineage_review_suggestions')
    expect(inserts[0].row).toMatchObject({ token: 't1', beneficiary_id: 'b1', kind: 'note', status: 'pending' })
    expect((inserts[0].row.payload as { chain: ChainStep[] }).chain).toHaveLength(6)
  })

  it('מצב מעורפל בעץ — נכנס לתור ולא נכשל', async () => {
    const { db, inserts } = fakeDb(BEN)
    const res = await saveChainFromLink(db, deps(TREE, null, { throws: 'מעורפל' }), inv, chain('א', 'ב', 'ג', 'ד', 'ה'), approvedAll)
    expect(res).toMatchObject({ ok: true, applied: false })
    expect(inserts).toHaveLength(1)
  })

  it('דילוג דורות בעץ — בדיקה מעמיקה', async () => {
    const gapTree = [...TREE, { id: 'g', parent_id: 'n5', generation: 8, name: 'קפיצה' }]
    const { db } = fakeDb(BEN)
    const res = await saveChainFromLink(db, deps(gapTree, 'g'), inv, chain('א', 'ב', 'ג', 'ד', 'קפיצה'), approvedAll)
    expect(res).toMatchObject({ ok: true, applied: true, status: 'deep_review' })
  })

  it('אין מגבלה של 12 דורות חדשים', async () => {
    const { db } = fakeDb(BEN)
    const many = chain('א', 'ב', 'ג', 'ד', ...Array.from({ length: 20 }, (_, i) => `חדש${i}`))
    const d = deps(TREE, 'n5')
    await saveChainFromLink(db, d, inv, many, approvedAll)
    expect(d.applyChain).toHaveBeenCalledWith(db, 'b1', many)
  })
})

describe('earlyOk', () => {
  it('הנמען בדור 5 ומטה — לא תקין', () => {
    expect(earlyOk(chain('א', 'ב', 'ג'), approvedAll).ok).toBe(false)
    expect(earlyOk(chain('א', 'ב', 'ג', 'ד'), approvedAll).ok).toBe(false)
  })
  it('שרשרת של 6 דורות תקינה', () => {
    expect(earlyOk(chain('א', 'ב', 'ג', 'ד', 'ה'), approvedAll)).toEqual({ ok: true })
  })
})

// ── הבאג של 25.11: תיקון שם בדור קיים "לא נקלט" ──
// applyChain מתאימה לפי שם הבעל, ולכן שם האישה המתוקן נזרק והשרשרת נבנתה
// מחדש מהצומת עם השם הישן.
describe('תיקון שם בדור קיים וחישוב מחדש של הבדיקה המעמיקה', () => {
  const OLD = 'רבי עזרא ומרת gyhk rcev זלצמן'
  const NEW = 'רבי עזרא ומרת רחל זלצמן'
  const SALZ: Node[] = [...TREE, { id: 'n7', parent_id: 'n6', generation: 7, name: OLD, relation: 'son' }]
  const stored = [...chain('א', 'ב', 'ג', 'ד', 'ה', OLD)].map(c => ({ ...c }))
  const BEN7 = { ...BEN, lineage_chain: stored, lineage_node_id: 'n7' }
  const pass = vi.fn(async () => ({ deep: false, finding: null, unknown: false, reason: null }))
  const fail = (reason: string) => vi.fn(async () => ({ deep: true, finding: null, unknown: false, reason }))

  it('מנהל: השם המתוקן נכתב לצומת ולשרשרת, ומשפחות תחת הצומת מתרעננות', async () => {
    const { db, updates } = fakeDb(BEN7)
    const d = { ...deps(SALZ, 'n7'), resyncSubtree: vi.fn(async () => 0) }
    const res = await saveChainByStaff(db, d, 'b1', chain('א', 'ב', 'ג', 'ד', 'ה', NEW), 'u1')
    expect(res).toMatchObject({ ok: true, applied: true })
    expect(updates).toContainEqual({ table: 'lineage_nodes', row: { name: NEW }, id: 'n7' })
    const benUpd = updates.find(u => u.table === 'beneficiaries' && 'lineage_chain' in u.row)!
    expect((benUpd.row.lineage_chain as { name: string }[]).at(-1)!.name).toBe(NEW)
    expect(d.resyncSubtree).toHaveBeenCalledWith(db, expect.anything(), 'n7')
  })

  it('מזכירה בלי עריכת עץ: הדור של המשפחה מתוקן, דור משותף למעלה לא', async () => {
    const { db, updates } = fakeDb(BEN7)
    await saveChainByStaff(db, deps(SALZ, 'n7'), 'b1', chain('א', 'ב', 'שונה', 'ד', 'ה', NEW), 'u1', { canEditTree: false })
    const renames = updates.filter(u => u.table === 'lineage_nodes')
    expect(renames).toEqual([{ table: 'lineage_nodes', row: { name: NEW }, id: 'n7' }])
  })

  it('שם שלא שונה מול השרשרת השמורה לא דורס את העץ', async () => {
    const { db, updates } = fakeDb({ ...BEN7, lineage_chain: stored.map(s => s.generation === 3 ? { ...s, name: 'ב-ישן' } : s) })
    await saveChainByStaff(db, deps(SALZ, 'n7'), 'b1', chain('א', 'ב-ישן', 'ג', 'ד', 'ה', OLD), 'u1')
    expect(updates.some(u => u.table === 'lineage_nodes')).toBe(false)
  })

  it('מנהל, כרטסת בבדיקה מעמיקה ותקינה אחרי התיקון — משתחררת לממתין והסיבה נמחקת', async () => {
    const { db, updates } = fakeDb({ ...BEN7, eligibility_status: 'deep_review' })
    const res = await saveChainByStaff(db, { ...deps(SALZ, 'n7'), gate: pass }, 'b1', chain('א', 'ב', 'ג', 'ד', 'ה', NEW), 'u1')
    expect(res).toMatchObject({ ok: true, status: 'pending' })
    expect(updates).toContainEqual({ table: 'beneficiaries', row: { eligibility_status: 'pending', deep_review_reason: null }, id: 'b1' })
  })

  it('מנהל, עדיין לא תקין — נשאר בבדיקה מעמיקה עם הסיבה העדכנית', async () => {
    const { db, updates } = fakeDb({ ...BEN7, eligibility_status: 'deep_review' })
    await saveChainByStaff(db, { ...deps(SALZ, 'n7'), gate: fail('דור 2–5 אינו בקובץ המאושר (דור 3)') }, 'b1', chain('א', 'ב', 'ג', 'ד', 'ה', NEW), 'u1')
    expect(updates).toContainEqual({ table: 'beneficiaries', row: { deep_review_reason: 'דור 2–5 אינו בקובץ המאושר (דור 3)' }, id: 'b1' })
    expect(updates.some(u => u.row.eligibility_status)).toBe(false)
  })

  it('מנהל, כרטסת שאינה בבדיקה מעמיקה — הסטטוס לא נוגעים', async () => {
    const { db, updates } = fakeDb(BEN7)
    const gate = fail('x')
    await saveChainByStaff(db, { ...deps(SALZ, 'n7'), gate }, 'b1', chain('א', 'ב', 'ג', 'ד', 'ה', NEW), 'u1')
    expect(gate).not.toHaveBeenCalled()
    expect(updates.some(u => 'eligibility_status' in u.row || 'deep_review_reason' in u.row)).toBe(false)
  })

  const inv = { token: 't1', root_node_id: 'r', recipient_name: 'עזרא', beneficiary_id: 'b1' }

  it('קישור: המשפחה מתקנת את השם שלה — נכתב לצומת ולשרשרת, וחוזר לממתין בלי סיבה', async () => {
    const { db, updates } = fakeDb({ ...BEN7, eligibility_status: 'deep_review' })
    const res = await saveChainFromLink(db, { ...deps(SALZ, 'n7'), gate: pass }, inv, chain('א', 'ב', 'ג', 'ד', 'ה', NEW), approvedAll)
    expect(res).toMatchObject({ ok: true, applied: true, status: 'pending' })
    expect(updates).toContainEqual({ table: 'lineage_nodes', row: { name: NEW }, id: 'n7' })
    const benUpd = updates.find(u => u.table === 'beneficiaries' && 'lineage_chain' in u.row)!
    expect((benUpd.row.lineage_chain as { name: string }[]).at(-1)!.name).toBe(NEW)
    expect(updates).toContainEqual({ table: 'beneficiaries', row: { eligibility_status: 'pending', deep_review_reason: null }, id: 'b1' })
  })

  it('קישור: דור משותף למעלה לא משתנה בעץ', async () => {
    const { db, updates } = fakeDb(BEN7)
    await saveChainFromLink(db, { ...deps(SALZ, 'n7'), gate: pass }, inv, chain('א', 'ב', 'ג', 'ד', 'ה-אחר', NEW), approvedAll)
    expect(updates.filter(u => u.table === 'lineage_nodes')).toEqual([{ table: 'lineage_nodes', row: { name: NEW }, id: 'n7' }])
  })

  it('קישור: השער המלא נכשל — בדיקה מעמיקה עם הסיבה', async () => {
    const { db, updates } = fakeDb(BEN7)
    const res = await saveChainFromLink(db, { ...deps(SALZ, 'n7'), gate: fail('דילוג דורות (דור 7)') }, inv, chain('א', 'ב', 'ג', 'ד', 'ה', NEW), approvedAll)
    expect(res).toMatchObject({ ok: true, applied: true, status: 'deep_review' })
    expect(updates).toContainEqual({ table: 'beneficiaries', row: { eligibility_status: 'deep_review', deep_review_reason: 'דילוג דורות (דור 7)' }, id: 'b1' })
  })
})
