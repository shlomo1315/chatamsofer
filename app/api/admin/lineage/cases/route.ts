import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, requireStaff } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { compareHebrewNames } from '@/lib/hebrewNames'
import { buildForest } from '@/lib/lineageForest'
import { lineageIdentityKey } from '@/lib/lineageNameFormat'
import { caseKey, type CaseKind, type CaseDecision } from '@/lib/lineageCaseKey'
import { findSelfDuplicates, type SelfDupNode, type SelfDupBen } from '@/lib/selfDuplicateNodes'
import { findBlockedLinks, type BlockedNode } from '@/lib/lineageBlockedLinks'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז בקרת עץ הדורות — כל סוגי התקלות ברשימה אחת, כל אחת עם ההכרעה שלה.
//
// 🔴 למה זה קיים: הכלים היו פזורים בתשעה פאנלים נפרדים, כל אחד עם רשימה
// משלו, ואף אחד מהם לא זכר מה כבר נבדק. מנהל שדחה זוג ("אלה שני אנשים
// שונים") ראה אותו שוב בטעינה הבאה, ואחרי שעת עבודה הרשימות נראו באותו
// אורך בדיוק. אין דרך לדעת מה נשאר.
//
// כאן כל ממצא מקבל מפתח יציב (lib/lineageCaseKey) ומצטרף להכרעה שנשמרה
// עליו, כך שהרשימה מתקצרת בפועל וניתן לסנן "מה עוד פתוח".
//
// ⚠️ קריאה בלבד. הכתיבה היא ב-PATCH למטה, והתיקון עצמו נשאר בכלים הקיימים
// (מיזוג/עריכה) — המסך הזה מנהל *החלטות*, לא מבצע שינויי מבנה בעצמו.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

interface NodeRow {
  id: string; name: string; parent_id: string | null
  generation: number; status: string | null; relation: string | null
  id_number: string | null
}
interface BenRow {
  id: string; full_name: string | null; family_name: string | null
  spouse_name: string | null; lineage_node_id: string | null
  id_number: string | null; spouse_id_number: string | null
  gender: string | null
  lineage_chain: { generation?: number; name?: string }[] | null
}

/** חריג ילדים — מעל זה חשד לכפילות לא-ממוזגת מתחת לצומת. */
const MANY_CHILDREN = 15

export interface LineageCase {
  key: string
  kind: CaseKind
  /** כותרת קצרה לטבלה. */
  title: string
  /** ההקשר שמאפשר להכריע בלי לצאת מהמסך. */
  parentName: string | null
  generation: number | null
  /** הצמתים המעורבים, עם המידע שמכריע: כמה ילדים וכמה משפחות תלויות בהם. */
  nodes: {
    id: string; name: string; status: string | null
    children: number; beneficiaries: number; createdAt?: string | null
  }[]
  /** חומרה — לדירוג הטיפול. */
  severity: 'high' | 'medium' | 'low'
  decision: CaseDecision | null
  note: string | null
  decidedAt: string | null
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  // ⚠️ שליפה בדפים — .limit() לבדו נחתך ל-1000 שורות. ראו lib/fetchAllRows.
  const [{ rows: nodes, error: nErr }, { rows: bens, error: bErr }] = await Promise.all([
    fetchAllRows<NodeRow>((from, to) =>
      admin.from('lineage_nodes').select('id, name, parent_id, generation, status, relation, id_number').range(from, to)),
    fetchAllRows<BenRow>((from, to) =>
      admin.from('beneficiaries')
        .select('id, full_name, family_name, spouse_name, lineage_node_id, id_number, spouse_id_number, gender, lineage_chain')
        .range(from, to)),
  ])
  if (nErr) return NextResponse.json({ error: nErr }, { status: 500 })
  if (bErr) return NextResponse.json({ error: bErr }, { status: 500 })

  const nameById = new Map(nodes.map(n => [n.id, n.name]))
  const childCount = new Map<string, number>()
  const benCount = new Map<string, number>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
  }
  for (const b of bens) {
    if (b.lineage_node_id) benCount.set(b.lineage_node_id, (benCount.get(b.lineage_node_id) ?? 0) + 1)
  }
  const nodeInfo = (n: NodeRow) => ({
    id: n.id, name: n.name, status: n.status,
    children: childCount.get(n.id) ?? 0,
    beneficiaries: benCount.get(n.id) ?? 0,
  })

  const cases: LineageCase[] = []

  // ── 1) כפילויות בין אחים ──
  //
  // ⚠️ ההשוואה בין אחים בלבד (אותו אב), ולא בין כל שני צמתים: שני אנשים
  // באותו שם בענפים רחוקים הם לרוב באמת שני אנשים, ואב משותף הוא ההקשר
  // שהופך דמיון-שמות לראיה.
  const byParent = new Map<string, NodeRow[]>()
  for (const n of nodes) {
    if (!n.parent_id || (n.status ?? '') === 'rejected') continue
    const arr = byParent.get(n.parent_id) ?? []; arr.push(n); byParent.set(n.parent_id, arr)
  }
  for (const [parentId, sibs] of byParent) {
    if (sibs.length < 2) continue
    // קיבוץ לפי מפתח זהות — תופס גם "ומרת גיטל" מול "וגיטל"
    const groups = new Map<string, NodeRow[]>()
    for (const s of sibs) {
      const k = lineageIdentityKey(s.name)
      if (!k) continue
      const arr = groups.get(k) ?? []; arr.push(s); groups.set(k, arr)
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const infos = group.map(nodeInfo)
      // 🔴 חומרה לפי מה שתלוי בהם: צומת עם משפחות מקושרות או עם ילדים הוא
      // הכרעה יקרה — מיזוג שגוי שם מזיז אנשים אמיתיים.
      const risky = infos.some(i => i.beneficiaries > 0) || infos.filter(i => i.children > 0).length > 1
      cases.push({
        key: caseKey('duplicate', group.map(g => g.id)),
        kind: 'duplicate',
        title: group[0].name,
        parentName: nameById.get(parentId) ?? null,
        generation: group[0].generation,
        nodes: infos,
        severity: risky ? 'high' : 'medium',
        decision: null, note: null, decidedAt: null,
      })
    }
    // כפילויות "אפשריות" לפי דמיון הברות — נמוכות יותר, לבדיקת אדם
    const used = new Set<string>()
    for (let i = 0; i < sibs.length; i++) {
      if (used.has(sibs[i].id)) continue
      for (let j = i + 1; j < sibs.length; j++) {
        if (used.has(sibs[j].id)) continue
        if (lineageIdentityKey(sibs[i].name) === lineageIdentityKey(sibs[j].name)) continue // כבר נתפס למעלה
        const m = compareHebrewNames(sibs[i].name, sibs[j].name)
        if (m.level !== 'strong') continue
        used.add(sibs[j].id)
        cases.push({
          key: caseKey('duplicate', [sibs[i].id, sibs[j].id]),
          kind: 'duplicate',
          title: `${sibs[i].name} · ${sibs[j].name}`,
          parentName: nameById.get(parentId) ?? null,
          generation: sibs[i].generation,
          nodes: [nodeInfo(sibs[i]), nodeInfo(sibs[j])],
          severity: 'low',
          decision: null, note: null, decidedAt: null,
        })
      }
    }
  }

  // ── 2) צמתים שאינם מגיעים לעץ כלל ──
  // 🔴 החמורה מכולן כי היא בלתי נראית: צומת במעגל הורות אינו מצויר בשום מקום,
  // הוא וכל תת-העץ שמתחתיו. מעגלים נוצרים ממיזוגים שמסיטים הורות בהמוניה.
  const forest = buildForest(nodes)
  const invisibleIds = new Set([...forest.detached, ...forest.selfParented])
  for (const n of nodes) {
    if (!invisibleIds.has(n.id)) continue
    cases.push({
      key: caseKey('ghost_child', [n.id]),
      kind: 'ghost_child',
      title: n.name,
      parentName: n.parent_id ? (nameById.get(n.parent_id) ?? '(הורה שאינו קיים)') : '—',
      generation: n.generation,
      nodes: [nodeInfo(n)],
      severity: 'high',
      decision: null, note: null, decidedAt: null,
    })
  }

  // ── 3) חריג ילדים — חשד לכפילות לא-ממוזגת מתחת ──
  for (const n of nodes) {
    const kids = childCount.get(n.id) ?? 0
    if (kids <= MANY_CHILDREN) continue
    cases.push({
      key: caseKey('many_children', [n.id]),
      kind: 'many_children',
      title: n.name,
      parentName: n.parent_id ? (nameById.get(n.parent_id) ?? '—') : '—',
      generation: n.generation,
      nodes: [nodeInfo(n)],
      severity: kids > 30 ? 'medium' : 'low',
      decision: null, note: null, decidedAt: null,
    })
  }

  // ── 4) מוטב שנתלה כילד של עצמו ──
  //
  // ⚠️ דרך lib/selfDuplicateNodes ולא זיהוי משלנו: שם יושבות שתי הראיות
  // ושני הסייגים, והן מכוסות בבדיקות. זיהוי מקביל כאן היה נפרד מהתיקון
  // שרץ בפועל, וזו בדיוק הדרך שבה מסך מציע מה שהכלי מסרב לבצע.
  const selfScan = findSelfDuplicates(
    nodes as unknown as SelfDupNode[],
    bens as unknown as SelfDupBen[],
  )
  for (const r of selfScan.rows) {
    cases.push({
      key: caseKey('self_duplicate', [r.dupNodeId, r.keepNodeId]),
      kind: 'self_duplicate',
      title: r.benName,
      parentName: r.keepNodeName,
      generation: r.dupGeneration,
      nodes: [
        { id: r.dupNodeId, name: `${r.dupNodeName} (העותק)`, status: r.dupStatus,
          children: childCount.get(r.dupNodeId) ?? 0, beneficiaries: benCount.get(r.dupNodeId) ?? 0 },
        { id: r.keepNodeId, name: `${r.keepNodeName} (לשמור)`, status: null,
          children: childCount.get(r.keepNodeId) ?? 0, beneficiaries: benCount.get(r.keepNodeId) ?? 0 },
      ],
      severity: 'medium',
      decision: null, note: null, decidedAt: null,
    })
  }
  // ⚠️ החסומים מוצגים גם הם — אבל כחומרה גבוהה: הכלי מסרב לגעת בהם, ולכן
  // הם דורשים יד אדם. מקרה שהכלי דילג עליו בשקט הוא מקרה שנשכח.
  for (const r of selfScan.blocked) {
    cases.push({
      key: caseKey('self_duplicate', [r.dupNodeId, r.keepNodeId]),
      kind: 'self_duplicate',
      title: `${r.benName} — ${r.guard}`,
      parentName: r.keepNodeName,
      generation: r.dupGeneration,
      nodes: [
        { id: r.dupNodeId, name: r.dupNodeName, status: r.dupStatus,
          children: childCount.get(r.dupNodeId) ?? 0, beneficiaries: benCount.get(r.dupNodeId) ?? 0 },
        { id: r.keepNodeId, name: r.keepNodeName, status: null,
          children: childCount.get(r.keepNodeId) ?? 0, beneficiaries: benCount.get(r.keepNodeId) ?? 0 },
      ],
      severity: 'high',
      decision: null, note: null, decidedAt: null,
    })
  }

  // ── 5) חוליות חסומות ──
  // צומת לא-מאומת שמתחתיו ילדים מאומתים: כל מי שמתחתיו אינו נגיש בבורר
  // הדורות, ולכן משפחות שלמות אינן יכולות להשלים ייחוס דרכו.
  const blocked = findBlockedLinks(nodes as unknown as BlockedNode[])
  for (const b of blocked) {
    cases.push({
      key: caseKey('blocked_link', [b.id]),
      kind: 'blocked_link',
      title: b.name,
      parentName: null,
      generation: b.generation,
      nodes: [{
        id: b.id, name: b.name, status: b.status,
        children: childCount.get(b.id) ?? 0, beneficiaries: benCount.get(b.id) ?? 0,
      }],
      // 🔴 חוליה קרובה לשורש חוסמת ענף שלם — ככל שתת-העץ גדול יותר, דחוף יותר.
      severity: b.subtreeSize > 20 ? 'high' : b.subtreeSize > 5 ? 'medium' : 'low',
      decision: null, note: null, decidedAt: null,
    })
  }

  // ── 6) מוטבים ללא צומת בעץ ──
  //
  // ⚠️ מקובצים לפי שרשרת הייחוס ולא שורה לכל משפחה: 1,000 משפחות ללא צומת
  // הן רשימה שאי אפשר לעבוד עליה, ולרוב הן חולקות מעט שרשראות משותפות.
  // קיבוץ הופך אלף שורות לעשרות החלטות אמיתיות.
  const unlinkedByChain = new Map<string, { count: number; sample: string }>()
  for (const b of bens) {
    if (b.lineage_node_id) continue
    const chain = Array.isArray(b.lineage_chain) ? b.lineage_chain : []
    const tail = chain.length ? String(chain[chain.length - 1]?.name ?? '') : ''
    const k = tail || '(ללא שרשרת)'
    const cur = unlinkedByChain.get(k)
    const label = [b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || 'ללא שם'
    if (cur) cur.count++
    else unlinkedByChain.set(k, { count: 1, sample: label })
  }
  for (const [chainTail, info] of unlinkedByChain) {
    // ⚠️ בודדים אינם מוצגים: משפחה יחידה ללא שרשרת היא עבודת מזכירות
    // שוטפת, ולא תקלה מבנית. הסף מרכז את המסך על מה שחוזר על עצמו.
    if (info.count < 3) continue
    cases.push({
      key: caseKey('unlinked', [`chain:${chainTail}`]),
      kind: 'unlinked',
      title: `${info.count} משפחות ללא צומת — ${chainTail}`,
      parentName: null,
      generation: null,
      nodes: [],
      severity: info.count > 20 ? 'medium' : 'low',
      decision: null, note: null, decidedAt: null,
    })
  }

  // ── חיבור ההכרעות ──
  // ⚠️ נשלף אחרי בניית הרשימה ולא לכל מקרה בנפרד: שאילתה אחת במקום מאות.
  const { data: decisions } = await admin
    .from('lineage_case_decisions')
    .select('case_key, decision, note, decided_at')
  const byKey = new Map(
    (decisions ?? []).map(d => [d.case_key as string, d as {
      decision: CaseDecision; note: string | null; decided_at: string
    }]),
  )
  for (const c of cases) {
    const d = byKey.get(c.key)
    if (!d) continue
    c.decision = d.decision
    c.note = d.note
    c.decidedAt = d.decided_at
  }

  // דירוג: פתוחים קודם, ובתוכם החמורים קודם
  const sevRank = { high: 0, medium: 1, low: 2 } as const
  cases.sort((a, b) => {
    const ao = a.decision === null || a.decision === 'later' ? 0 : 1
    const bo = b.decision === null || b.decision === 'later' ? 0 : 1
    if (ao !== bo) return ao - bo
    return sevRank[a.severity] - sevRank[b.severity]
  })

  const open = cases.filter(c => c.decision === null || c.decision === 'later').length
  return NextResponse.json({
    cases,
    summary: {
      total: cases.length,
      open,
      done: cases.length - open,
      byKind: cases.reduce<Record<string, { total: number; open: number }>>((acc, c) => {
        const e = acc[c.kind] ?? { total: 0, open: 0 }
        e.total++
        if (c.decision === null || c.decision === 'later') e.open++
        acc[c.kind] = e
        return acc
      }, {}),
    },
  })
}

// ── שמירת הכרעה ──
export async function PATCH(request: NextRequest) {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const staff = await requireStaff()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const body = await request.json().catch(() => null) as {
    key?: string; kind?: string; decision?: string; note?: string; nodeIds?: string[]
  } | null
  if (!body?.key || !body?.kind) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  // ⚠️ decision ריק = ביטול ההכרעה, והמקרה חוזר לרשימת הפתוחים. זה מכוון:
  // מנהל שסימן בטעות חייב דרך חזרה, אחרת המקרה נעלם ואין איך להחזירו.
  if (!body.decision) {
    const { error } = await admin.from('lineage_case_decisions').delete().eq('case_key', body.key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, decision: null })
  }

  if (!['resolved', 'dismissed', 'later'].includes(body.decision)) {
    return NextResponse.json({ error: 'הכרעה לא תקינה' }, { status: 400 })
  }

  const { error } = await admin.from('lineage_case_decisions').upsert({
    case_key: body.key,
    kind: body.kind,
    decision: body.decision,
    note: (body.note ?? '').trim() || null,
    node_ids: Array.isArray(body.nodeIds) ? body.nodeIds : [],
    decided_by: staff?.userId ?? null,
    decided_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'case_key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, decision: body.decision })
}
