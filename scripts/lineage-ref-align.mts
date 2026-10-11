// ביצוע (כותב למסד! להריץ קודם את -dry). יישור דורות 2–5 לקובץ המאושר. ראו lib/lineageRefAlign.
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { planRefAlignment, type AlignNode, type AlignRef } from '../lib/lineageRefAlign'
import { mergeWithCascade, recalcGenerations } from '../lib/lineageMerge'
import { resyncBeneficiaryChains, subtreeNodeIds, invalidateLineageCache, NODE_SELECT, type TreeNodeRow } from '../lib/lineageSync'
import { fetchAllRows } from '../lib/fetchAllRows'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const load = async () => (await fetchAllRows<AlignNode & { parent_id: string | null }>((f, t) => db.from('lineage_nodes').select('id, name, parent_id, status').range(f, t))).rows
const { rows: ref } = await fetchAllRows<AlignRef>((f, t) => db.from('lineage_approved_ref').select('key, name, generation, parent_key').range(f, t))
const nodes = await load()
const plan = planRefAlignment(nodes, ref)
const batchId = randomUUID()
const NOTE = 'יושר לקובץ המאושר 12.10'

// תמונת מצב מלאה של כל צומת שנוגעים בו
const touched = new Set<string>()
for (const o of plan.ops as any[]) { if (o.id) touched.add(o.id); if (o.keep) touched.add(o.keep); (o.ids ?? []).forEach((i: string) => touched.add(i)); if (o.to && !o.to.startsWith('new:')) touched.add(o.to) }
const before: unknown[] = []
const tIds = [...touched].filter(i => !i.startsWith('new:'))
for (let i = 0; i < tIds.length; i += 100) { const { data } = await db.from('lineage_nodes').select('*').in('id', tIds.slice(i, i + 100)); before.push(...(data ?? [])) }
await db.from('activity_log').insert({ action: 'lineage_ref_align_before', entity_type: 'lineage_node', details: { batchId, ops: plan.ops, before } })

const real = new Map<string, string>()
const rid = (id: string) => real.get(id) ?? id
const moves: { id: string; from: string | null; to: string }[] = []
const fails: string[] = []
const parentOf = async (id: string) => (await db.from('lineage_nodes').select('parent_id').eq('id', id).single()).data?.parent_id as string | null

for (const o of plan.ops as any[]) {
  try {
    if (o.op === 'create') {
      const { data, error } = await db.from('lineage_nodes').insert({ name: o.name, parent_id: rid(o.parent), generation: 99, status: 'verified', approval_note: NOTE }).select('id').single()
      if (error) throw new Error(error.message)
      real.set(o.tempId, data.id); touched.add(data.id)
    } else if (o.op === 'move') {
      const from = await parentOf(o.id)
      const { error } = await db.from('lineage_nodes').update({ parent_id: rid(o.to) }).eq('id', o.id)
      if (error) throw new Error(error.message)
      moves.push({ id: o.id, from, to: rid(o.to) })
    } else if (o.op === 'merge') {
      const keepParent = await parentOf(o.keep)
      // ⚠️ כל ממוזג הופך קודם לאח של השורד — אחרת צאצא של השורד (עותק שתלוי
      // תחת עצמו) נשמט בשקט בתכנון המפל.
      for (const id of o.ids) {
        const p = await parentOf(id)
        if (p !== keepParent) { await db.from('lineage_nodes').update({ parent_id: keepParent }).eq('id', id); moves.push({ id, from: p, to: keepParent! }) }
      }
      invalidateLineageCache()
      const r = await mergeWithCascade(db, { keepId: o.keep, mergeIds: o.ids, batchId, names: { [o.keep]: o.name }, cascadeUp: false, cascadeDown: false, skipRecalc: true })
      if (r.mergedCount !== o.ids.length) fails.push(`merge ${o.name}: ${r.mergedCount}/${o.ids.length}`)
    } else if (o.op === 'settle') {
      const upd: Record<string, unknown> = { name: o.name }
      if (o.verify) { upd.status = 'verified'; upd.approval_note = NOTE }
      const { error } = await db.from('lineage_nodes').update(upd).eq('id', o.id)
      if (error) throw new Error(error.message)
    }
    invalidateLineageCache()
  } catch (e) { fails.push(`${o.op} ${o.name}: ${(e as Error).message}`) }
}

const { data: root } = await db.from('lineage_nodes').select('id').is('parent_id', null).limit(1).single()
await recalcGenerations(db, root!.id)
const { rows: after } = await fetchAllRows<TreeNodeRow>((f, t) => db.from('lineage_nodes').select(NODE_SELECT).range(f, t))
const afterIds = new Set(after.map(n => n.id))
const affected = new Set<string>()
for (const id of touched) { const x = rid(id); if (afterIds.has(x)) for (const s of subtreeNodeIds(after, x)) affected.add(s) }
const resynced = await resyncBeneficiaryChains(db, after, affected)
await db.from('activity_log').insert({ action: 'lineage_ref_align', entity_type: 'lineage_node', details: { batchId, moves, created: Object.fromEntries(real), fails, resynced, issues: plan.issues } })
console.log(JSON.stringify({ batchId, ops: plan.ops.length, moves: moves.length, created: real.size, fails, resynced, issues: plan.issues.length }, null, 1))
