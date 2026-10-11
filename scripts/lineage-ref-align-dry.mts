// יישור דורות 2–5 לקובץ המאושר — הרצה יבשה (קריאה בלבד). שימוש: set -a; . ./.env.local; npx tsx scripts/lineage-ref-align-dry.mts
import { planRefAlignment } from '../lib/lineageRefAlign'
const U = process.env.NEXT_PUBLIC_SUPABASE_URL!, K = process.env.SUPABASE_SERVICE_ROLE_KEY!
const get = async (p: string, f = 0) => (await fetch(`${U}/rest/v1/${p}`, { headers: { apikey: K, Authorization: `Bearer ${K}`, Range: `${f}-${f + 999}` } })).json()
const pull = async (p: string) => { const a: any[] = []; for (let f = 0; ; f += 1000) { const d = await get(p, f); a.push(...d); if (d.length < 1000) break } return a }
const nodes = await pull('lineage_nodes?select=id,name,parent_id,status')
const ref = await pull('lineage_approved_ref?select=key,name,generation,parent_key')
const bens = await pull('beneficiaries?select=lineage_node_id&lineage_node_id=not.is.null')
const bc = new Map<string, number>(); for (const b of bens) bc.set(b.lineage_node_id, (bc.get(b.lineage_node_id) ?? 0) + 1)
const byId = new Map(nodes.map((n: any) => [n.id, n]))
const nm = (id: string) => (byId.get(id) as any)?.name ?? id
const p = planRefAlignment(nodes, ref)
const cnt = (k: string) => p.ops.filter(o => o.op === k).length
console.log(`פעולות: הזזה ${cnt('move')} · מיזוג ${cnt('merge')} (${p.ops.filter(o => o.op === 'merge').reduce((s: number, o: any) => s + o.ids.length, 0)} צמתים) · יצירה ${cnt('create')} · אישור/שם ${cnt('settle')} · לא הוכרעו ${p.issues.length}`)
for (const o of p.ops as any[]) {
  if (o.op === 'move') console.log(`MOVE  ${o.name}  →  תחת ${nm(o.to)}`)
  if (o.op === 'merge') console.log(`MERGE ${o.name}  ⟵  ${o.ids.map((i: string) => nm(i) + (bc.get(i) ? `[${bc.get(i)}מש]` : '')).join(' | ')}`)
  if (o.op === 'create') console.log(`NEW   ${o.name}  תחת ${nm(o.parent)}`)
  if (o.op === 'settle') console.log(`SET   ${nm(o.id)} ⇒ ${o.name}${o.verify ? ' (+אישור)' : ''}`)
}
console.log('\nלא הוכרעו (דוגמה):'); for (const i of p.issues.filter((x: any) => x.reason !== "no_ref_match").concat(p.issues.filter((x: any) => x.reason === "no_ref_match").slice(0, 8))) console.log(`  ${i.reason} ע${i.depth} ${i.name}${i.matches ? ' ~ ' + i.matches.join(' / ') : ''}`)
const byReason: Record<string, number> = {}; for (const i of p.issues) byReason[i.reason] = (byReason[i.reason] ?? 0) + 1
console.log(byReason)
