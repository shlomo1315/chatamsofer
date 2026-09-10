// ─────────────────────────────────────────────────────────────────────────────
// הייחוס המאושר — 233 הצמתים של 5 הדורות הראשונים, מול העץ בפועל.
//
// 🔴 הטבלה lineage_approved_ref קיימת במסד מאז 25.08 ומעולם לא נקראה מהקוד:
// אין מסך שמציג אותה, ואין בדיקה שמשווה מולה. התוצאה — 51 צמתים סומנו
// 'verified' ידנית בעץ וצבועים ירוק, בעוד שאינם בקובץ המאושר כלל.
//
// ⚠️ המקרה שחשף זאת: "רבי יהושע צבי גולדגלנץ" יושב בעץ בדור 3 כבן של הכתב
// סופר. בקובץ המאושר הוא דור 5, דרך "רבי שמחה בונם ואסתר דויטש" — כלומר
// נין ולא בן. הצומת ירוק, והייחוס שגוי בשני דורות.
//
// ⚠️ ההשוואה לפי שם *מנורמל*: הקובץ והעץ נכתבו בשני מקורות, ו"פריי" מול
// "פרייא" הוא אותו אדם. בלי הנרמול כל הבדל איות נספר כחריגה.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { normalizeName } from '@/lib/lineageChainDiff'

export const dynamic = 'force-dynamic'

interface RefRow { key: string; name: string; generation: number; parent_key: string | null }
interface NodeRow { id: string; name: string; generation: number; parent_id: string | null; status: string | null }

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const [{ rows: refRows }, { rows: nodes }] = await Promise.all([
    fetchAllRows<RefRow>((from, to) => db
      .from('lineage_approved_ref').select('key, name, generation, parent_key').range(from, to)),
    fetchAllRows<NodeRow>((from, to) => db
      .from('lineage_nodes').select('id, name, generation, parent_id, status').range(from, to)),
  ])

  const byId = new Map(nodes.map(n => [n.id, n]))
  // ⚠️ מפתח = שם מנורמל + דור. שם לבדו אינו ייחודי (אותו שם מופיע בכמה
  // דורות), ולכן ההתאמה חייבת לכלול את הדור.
  const refByNameGen = new Map<string, RefRow>()
  const refByName = new Map<string, RefRow[]>()
  for (const r of refRows) {
    const nm = normalizeName(r.name)
    refByNameGen.set(`${nm}|${r.generation}`, r)
    const list = refByName.get(nm)
    if (list) list.push(r); else refByName.set(nm, [r])
  }

  // ── הצמתים שבעץ מסומנים מאושר אך אינם בקובץ ──
  const mismatches = nodes
    .filter(n => n.generation >= 2 && n.generation <= 5 && n.status === 'verified')
    .map(n => {
      const nm = normalizeName(n.name)
      const exact = refByNameGen.get(`${nm}|${n.generation}`)
      if (exact) return null
      // ⚠️ אותו שם בדור אחר = ייחוס שגוי (כמו גולדגלנץ), ולא שם שאינו מוכר.
      // ההבחנה חשובה: הראשון דורש העברה, השני דורש הכרעה אם הוא בכלל צאצא.
      const elsewhere = refByName.get(nm) ?? []
      return {
        id: n.id,
        name: n.name,
        treeGeneration: n.generation,
        treeParent: n.parent_id ? (byId.get(n.parent_id)?.name ?? null) : null,
        approvedGeneration: elsewhere[0]?.generation ?? null,
        approvedParent: elsewhere[0]?.parent_key ?? null,
        kind: elsewhere.length ? 'wrong_generation' : 'not_in_reference',
      }
    })
    .filter(Boolean)

  // ── צמתים שבקובץ המאושר וחסרים בעץ ──
  const treeKeys = new Set(nodes.map(n => `${normalizeName(n.name)}|${n.generation}`))
  const missing = refRows
    .filter(r => !treeKeys.has(`${normalizeName(r.name)}|${r.generation}`))
    .map(r => ({ name: r.name, generation: r.generation, parent: r.parent_key }))

  const byGen: Record<number, { approved: number; verifiedInTree: number }> = {}
  for (let g = 1; g <= 5; g++) {
    byGen[g] = {
      approved: refRows.filter(r => r.generation === g).length,
      verifiedInTree: nodes.filter(n => n.generation === g && n.status === 'verified').length,
    }
  }

  return NextResponse.json({
    reference: refRows.sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he')),
    mismatches,
    missing,
    byGen,
    totals: { reference: refRows.length, mismatches: mismatches.length, missing: missing.length },
  })
}
