import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { compareHebrewNames } from '@/lib/hebrewNames'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { buildForest, type Forest } from '@/lib/lineageForest'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─────────────────────────────────────────────────────────────────────────────
// "בריאות העץ" — סריקת אבחון של כל עץ הדורות + המוטבים, המחזירה את כל התקלות
// המבניות במקום אחד. נועד לחשוף בבת אחת את הבלאגן שנצבר מרישום מאסיבי: שאריות
// ממיזוגים שנכשלו (בגלל תקרת 1000), אותו אדם שנרשם N פעמים, ות"ז כפולות.
//
// ⚠️ קריאה בלבד — לא משנה נתונים. התיקון עצמו נעשה בכלים הקיימים (מיזוג/עריכה).
// ─────────────────────────────────────────────────────────────────────────────

interface NodeRow {
  id: string; name: string; parent_id: string | null
  generation: number; status: string | null; relation: string | null
}
interface BenRow {
  id: string; full_name: string | null; family_name: string | null
  spouse_name: string | null; id_number: string | null; spouse_id_number: string | null
  lineage_node_id: string | null
  /** שרשרת הדורות שהמשפחה בנתה — משמשת למדידת פער העומק. */
  lineage_chain?: { generation?: number; name?: string }[] | null
}

// סף "חריג ילדים": צומת עם יותר מזה ילדים ישירים חשוד ככפילות לא-ממוזגת
// (כל צאצא שרשם את אותו אב הוסיף עותק-ילד תחתיו). לא שגיאה ודאית — דגל לבדיקה.
const MANY_CHILDREN = 15

// גודל תת-העץ של צומת ביער שנבנה — "כמה צאצאים היו נעלמים איתו".
function subtreeSize(forest: Forest<NodeRow>, id: string): number {
  const find = (nodes: Forest<NodeRow>['roots']): Forest<NodeRow>['roots'][number] | null => {
    const stack = [...nodes]
    while (stack.length) {
      const n = stack.pop()!
      if (n.id === id) return n
      for (const c of n.children) stack.push(c)
    }
    return null
  }
  const node = find(forest.roots)
  if (!node) return 0
  let count = 0
  const stack = [...node.children]
  while (stack.length) {
    const n = stack.pop()!
    count++
    for (const c of n.children) stack.push(c)
  }
  return count
}

export async function GET() {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  // ⚠️ אבטחה: ת"ז כפולות = PII (תעודות זהות + שמות משפחה). 'lineage' ו-'beneficiaries'
  // הן הרשאות נפרדות — איש צוות עם הרשאת עריכת-עץ בלבד אינו אמור לראות ת"ז של
  // משפחות. לכן חושפים את סעיף ת"ז הכפולות רק למי שיש לו גם הרשאת צפייה במשפחות;
  // לשאר — רק המספר (כמה כפילויות) בלי הפרטים. שאר הכלי (יתומים/כפילויות-שם) פתוח.
  const canSeeBeneficiaries = !!(await requirePermission('beneficiaries', 'view'))

  // ⚠️ שליפה בדפים — עץ של אלפי צמתים; .limit() לבדו נחתך ל-1000. ראו lib/fetchAllRows.
  const [{ rows: nodes, error: nErr }, { rows: bens, error: bErr }] = await Promise.all([
    fetchAllRows<NodeRow>((from, to) =>
      admin.from('lineage_nodes').select('id, name, parent_id, generation, status, relation').range(from, to)),
    fetchAllRows<BenRow>((from, to) =>
      admin.from('beneficiaries').select('id, full_name, family_name, spouse_name, id_number, spouse_id_number, lineage_node_id, lineage_chain').range(from, to)),
  ])
  if (nErr) return NextResponse.json({ error: nErr }, { status: 500 })
  if (bErr) return NextResponse.json({ error: bErr }, { status: 500 })

  const nameById = new Map(nodes.map(n => [n.id, n.name]))
  const childCount = new Map<string, number>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
  }
  // מספר המשפחות (מוטבים) המקושרות לכל צומת
  const benCount = new Map<string, number>()
  for (const b of bens) {
    if (b.lineage_node_id) benCount.set(b.lineage_node_id, (benCount.get(b.lineage_node_id) ?? 0) + 1)
  }

  // ── 0) 🔴 צמתים שאינם מגיעים לעץ כלל ──
  //
  // התקלה החמורה מכולן, כי היא *בלתי נראית*: צומת בתוך מעגל הורות (או צומת
  // שהוא ההורה של עצמו) אינו נגיש מאף שורש, ולכן הוא וכל תת-העץ שמתחתיו לא
  // מצויירים בשום מקום. צאצאים שרשומים במערכת ופשוט אינם בעץ.
  //
  // ⚠️ מעגלים נוצרים ממיזוג כפילויות, שמסיט הורות בהמוניה — מיזוג אב אל צאצא
  // שלו סוגר מעגל. שאר הסעיפים כאן מדווחים על צמתים שרואים; זה על מה שלא.
  const forest = buildForest(nodes)
  const detachedSet = new Set(forest.detached)
  const selfSet = new Set(forest.selfParented)
  const danglingSet = new Set(forest.danglingParent)
  const describe = (n: NodeRow) => ({
    id: n.id, name: n.name, generation: n.generation, status: n.status,
    parentName: n.parent_id ? (nameById.get(n.parent_id) ?? '(הורה שאינו קיים)') : '—',
    reason: selfSet.has(n.id) ? 'ההורה של עצמו'
      : detachedSet.has(n.id) ? 'מעגל הורות'
      : 'ההורה נמחק',
    // כמה צאצאים היו נעלמים איתו
    descendants: subtreeSize(forest, n.id),
  })
  const invisible = nodes
    .filter(n => detachedSet.has(n.id) || selfSet.has(n.id))
    .map(describe)
  const dangling = nodes.filter(n => danglingSet.has(n.id)).map(describe)

  // ── 1) צמתים יתומים: בלי ילדים ובלי מוטב מקושר, ואינם שורש/דור מוקדם ──
  // צומת כזה הוא לרוב שארית ממיזוג שנכשל, או דור-ביניים שנוצר ונשכח. דור ≤5
  // (הליבה המאושרת מהייבוא) לא נחשב יתום — הוא חלק מהשלד ההיסטורי.
  const orphans = nodes
    .filter(n => n.generation > 5 && (childCount.get(n.id) ?? 0) === 0 && (benCount.get(n.id) ?? 0) === 0)
    .map(n => ({ id: n.id, name: n.name, generation: n.generation, status: n.status,
      parentName: n.parent_id ? (nameById.get(n.parent_id) ?? '—') : '—' }))
    .sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he'))

  // ── 2) צמתים עם ריבוי ילדים חריג (חשד לכפילויות לא-ממוזגות מתחתיהם) ──
  const manyChildren = nodes
    .filter(n => (childCount.get(n.id) ?? 0) > MANY_CHILDREN)
    .map(n => ({ id: n.id, name: n.name, generation: n.generation, children: childCount.get(n.id) ?? 0 }))
    .sort((a, b) => b.children - a.children)

  // ── 3) ת"ז כפולות במוטבים ── כל ת"ז (של בעל או אשה) שמופיעה ביותר ממשפחה אחת
  const idOwners = new Map<string, { benId: string; name: string; field: 'בעל' | 'אשה' }[]>()
  const pushId = (raw: string | null, benId: string, name: string, field: 'בעל' | 'אשה') => {
    const id = (raw ?? '').replace(/\D/g, '')
    if (id.length < 5) return   // דרכון/ריק — לא נבדק לכפילות ת"ז
    const arr = idOwners.get(id) ?? []
    arr.push({ benId, name, field })
    idOwners.set(id, arr)
  }
  for (const b of bens) {
    const fam = [b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || 'ללא שם'
    pushId(b.id_number, b.id, fam, 'בעל')
    pushId(b.spouse_id_number, b.id, fam, 'אשה')
  }
  const dupIds = [...idOwners.entries()]
    .filter(([, owners]) => new Set(owners.map(o => o.benId)).size > 1)   // אותה ת"ז בכמה משפחות שונות
    .map(([id, owners]) => ({ idNumber: id, owners }))
    .slice(0, 200)

  // ── 4) כפילויות שם בין אחים (סיכום בלבד — הפירוט המלא במרכז המיזוגים) ──
  const byParent = new Map<string, NodeRow[]>()
  for (const n of nodes) {
    if (!n.parent_id || (n.status ?? '') === 'rejected') continue
    const arr = byParent.get(n.parent_id) ?? []; arr.push(n); byParent.set(n.parent_id, arr)
  }
  let dupExact = 0, dupStrong = 0, dupPossible = 0
  for (const sibs of byParent.values()) {
    if (sibs.length < 2) continue
    const used = new Set<string>()
    for (let i = 0; i < sibs.length; i++) {
      if (used.has(sibs[i].id)) continue
      let best: 'exact' | 'strong' | 'possible' | null = null
      for (let j = i + 1; j < sibs.length; j++) {
        if (used.has(sibs[j].id)) continue
        const m = compareHebrewNames(sibs[i].name, sibs[j].name)
        if (m.level === 'none') continue
        used.add(sibs[j].id)
        if (m.level === 'exact' || (m.level === 'strong' && best !== 'exact') || best === null) best = m.level
      }
      if (best === 'exact') dupExact++
      else if (best === 'strong') dupStrong++
      else if (best === 'possible') dupPossible++
    }
  }

  // ── 🔴 פער העומק: הסיבה שנרשמים נתקעים ──
  //
  // דווח שוב ושוב "חסרים לכם נתונים ולכן אי אפשר להשלים את הרישום".
  // המדידה מראה למה: העץ מתכווץ בחדות אחרי דור מסוים, ומי שהייחוס שלו
  // ממשיך משם מגיע לרשימה *ריקה* ונאלץ להוסיף הכל ידנית.
  //
  // ⚠️ עלה = צומת בלי ילדים. שיעור עלים גבוה בדור נמוך (5-6) פירושו
  // שהעץ נקטע שם — לא שהמשפחות באמת נגמרו.
  //
  // ⚠️ נספרים רק צמתים מאושרים: זה מה שהנרשם באמת רואה בבורר.
  const verifiedNodes = nodes.filter(n => (n.status ?? 'verified') === 'verified')
  const parentIds = new Set(verifiedNodes.map(n => n.parent_id).filter(Boolean) as string[])
  const byGeneration = new Map<number, { total: number; leaves: number }>()
  for (const n of verifiedNodes) {
    const g = Number(n.generation ?? 0)
    const cur = byGeneration.get(g) ?? { total: 0, leaves: 0 }
    cur.total++
    if (!parentIds.has(n.id)) cur.leaves++
    byGeneration.set(g, cur)
  }
  const depth = [...byGeneration.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, v]) => ({
      generation,
      total: v.total,
      leaves: v.leaves,
      leafPct: v.total ? Math.round((v.leaves / v.total) * 100) : 0,
    }))

  // הדור שבו העץ נקטע: הראשון שבו רוב מוחלט מהצמתים הם קצה מסלול,
  // ועדיין יש בו מסה משמעותית (לא הזנב הטבעי בדורות האחרונים).
  const maxTotal = Math.max(1, ...depth.map(d => d.total))
  const bottleneck = depth.find(d => d.leafPct >= 80 && d.total >= maxTotal * 0.5) ?? null

  // כמה משפחות נעצרות שם בפועל — מוטבים שהשרשרת שלהם מסתיימת בדור החנק.
  let familiesAtBottleneck = 0
  if (bottleneck) {
    for (const b of bens) {
      const chain = Array.isArray(b.lineage_chain) ? b.lineage_chain : null
      if (!chain?.length) continue
      const last = Math.max(...chain.map(c => Number(c?.generation ?? 0)))
      if (last <= bottleneck.generation) familiesAtBottleneck++
    }
  }

  return NextResponse.json({
    scannedNodes: nodes.length,
    scannedBeneficiaries: bens.length,
    // 🔴 פער העומק — ראו ההערה למעלה
    depth,
    bottleneck,
    familiesAtBottleneck,
    // 🔴 צמתים שלא היו מצויירים בעץ כלל לפני התיקון
    invisible,
    dangling,
    orphans,
    manyChildren,
    // ת"ז + שמות רק למי שרשאי לצפות במשפחות; אחרת רק כמה כפילויות יש (בלי PII)
    duplicateIds: canSeeBeneficiaries ? dupIds : [],
    duplicateIdsCount: dupIds.length,
    duplicateIdsRestricted: !canSeeBeneficiaries && dupIds.length > 0,
    duplicateNames: { exact: dupExact, strong: dupStrong, possible: dupPossible },
  })
}
