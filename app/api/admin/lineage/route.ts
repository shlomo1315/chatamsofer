import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requirePermission, forbidden } from '@/lib/apiAuth'
import { resyncSubtree, approveVerifiedBeneficiaries, cascadeRejectSubtree, rejectLinkedBeneficiaries, invalidateLineageCache, lineageCacheVersion, getCachedLineageTree, NODE_SELECT, type TreeNodeRow } from '@/lib/lineageSync'
import { syncChildrenOfBeneficiary } from '@/lib/lineageFamilyChildren'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ⚡ מטמון של ה-payload המלא (nodes + linked) בזיכרון השרת. הטעינה סרקה בעבר
// את כל העץ + כל המשפחות בכל פתיחת מסך (7-8 שניות בעץ גדול).
//
// ⚠️ stale-while-revalidate: המטמון נפסל בכל כתיבה — כולל מנתיב הרישום הציבורי
// (אישור אוטומטי של שם), שבגל רישום המוני נורה כל כמה שניות. פסילה שמאלצת
// בנייה מלאה מחדש הפכה את מסך העץ ל"טוען נתונים…" ממושך בדיוק בשעות העומס.
// עכשיו עותק מיושן מוגש מיד והבנייה רצה ברקע, עם single-flight כדי ששתי
// טעינות מקבילות לא יבנו את אותו payload פעמיים.
type LineagePayload = { nodes: Record<string, unknown>[]; linked: Record<string, { id: string; name: string }[]> }
let _payloadCache: { at: number; version: number; body: LineagePayload } | null = null
const PAYLOAD_TTL_MS = 60_000
const PAYLOAD_STALE_MAX_MS = 10 * 60_000
let _payloadInflight: Promise<LineagePayload> | null = null

export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401, headers: NO_STORE })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500, headers: NO_STORE })

  const now = Date.now()
  const version = lineageCacheVersion()
  if (_payloadCache && _payloadCache.version === version && now - _payloadCache.at < PAYLOAD_TTL_MS) {
    return NextResponse.json(_payloadCache.body, { headers: NO_STORE })
  }

  // עותק מיושן אך שמיש — מגישים מיד, מרעננים ברקע.
  if (_payloadCache && now - _payloadCache.at < PAYLOAD_STALE_MAX_MS) {
    void buildPayload(admin).catch(e => console.error('[lineage] רענון payload ברקע נכשל:', e))
    return NextResponse.json(_payloadCache.body, { headers: NO_STORE })
  }

  try {
    const body = await buildPayload(admin)
    return NextResponse.json(body, { headers: NO_STORE })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500, headers: NO_STORE })
  }
}

// בניית ה-payload בפועל, עם single-flight.
async function buildPayload(admin: ReturnType<typeof getAdminClient>): Promise<LineagePayload> {
  if (_payloadInflight) return _payloadInflight
  const version = lineageCacheVersion()
  _payloadInflight = (async () => {
    // ⚡ שתי השאילתות עצמאיות — רצות במקביל (Promise.all) במקום סדרתית, חצי מזמן
    // סבבי הרשת. שליפה בדפים כי .limit() לא עוקף את db-max-rows=1000. ראו lib/fetchAllRows.
    //
    // ⚡ הצמתים עוברים דרך getCachedLineageTree — אותו מטמון משותף שמשמש את
    // הכרטסות. קודם היה כאן מטמון נפרד, ולכן פסילה אחת (כל רישום ציבורי) הפילה
    // את שניהם והעץ נסרק מחדש משתי דלתות שונות. עכשיו: מקור אחד.
    //
    // ⚡ NODE_SELECT במקום select('*'): notes ו-id_number אינם בשימוש בעץ ונשלחו
    // לכל אחד מ-~5000 הצמתים בכל טעינה.
    const [nodes, bensRes] = await Promise.all([
      getCachedLineageTree(async () => {
        const { rows, error } = await fetchAllRows<TreeNodeRow>((from, to) =>
          admin!.from('lineage_nodes').select(NODE_SELECT).order('generation').order('name').range(from, to))
        if (error) throw new Error(error)
        return rows
      }),
      fetchAllRows<{ id: string; full_name?: string; family_name?: string; spouse_name?: string; lineage_node_id: string }>((from, to) =>
        admin!.from('beneficiaries').select('id, full_name, family_name, spouse_name, lineage_node_id').not('lineage_node_id', 'is', null).range(from, to)),
    ])

    // המשפחות המקושרות לכל צומת — כדי לקפוץ מהעץ ישירות לכרטסת.
    const linked: Record<string, { id: string; name: string }[]> = {}
    for (const b of bensRes.rows ?? []) {
      const row = b as { id: string; full_name?: string; family_name?: string; spouse_name?: string; lineage_node_id: string }
      const name = [row.family_name, row.spouse_name || row.full_name].filter(Boolean).join(' ') || 'ללא שם'
      ;(linked[row.lineage_node_id] ??= []).push({ id: row.id, name })
    }

    const body: LineagePayload = { nodes: nodes as unknown as Record<string, unknown>[], linked }
    _payloadCache = { at: Date.now(), version, body }
    return body
  })()

  try {
    return await _payloadInflight
  } finally {
    _payloadInflight = null
  }
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'add')
  if (!staff) return forbidden()

  const body = await request.json()
  const { name, parent_id, notes, relation } = body

  if (!name?.trim()) return NextResponse.json({ error: 'שם חובה' }, { status: 400 })
  if (relation != null && !['son', 'son_in_law'].includes(relation)) {
    return NextResponse.json({ error: 'קשר לא תקין' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  let generation = 1
  if (parent_id) {
    const { data: parent } = await admin
      .from('lineage_nodes')
      .select('generation')
      .eq('id', parent_id)
      .single()
    if (parent) generation = parent.generation + 1
  }

  const { data, error } = await admin.from('lineage_nodes').insert({
    name: name.trim(),
    parent_id: parent_id || null,
    generation,
    notes: notes?.trim() || null,
    relation: relation ?? null,
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ node: data })
}

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  const body = await request.json()
  const { id, name, notes, parent_id, relation } = body

  if (!id) return NextResponse.json({ error: 'חסר ID' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: 'שם חובה' }, { status: 400 })
    updates.name = name.trim()
  }
  if (relation !== undefined) {
    if (relation != null && !['son', 'son_in_law'].includes(relation)) {
      return NextResponse.json({ error: 'קשר לא תקין' }, { status: 400 })
    }
    updates.relation = relation ?? null
  }
  if (notes !== undefined) updates.notes = notes?.trim() || null
  if (body.status !== undefined) {
    if (!['verified', 'pending', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 })
    }
    updates.status = body.status
  }

  if (parent_id !== undefined) {
    const newParent: string | null = parent_id || null
    if (newParent === id) {
      return NextResponse.json({ error: 'לא ניתן להפוך צומת להורה של עצמו' }, { status: 400 })
    }
    const { rows: all, error: allErr } = await fetchAllRows<{ id: string; parent_id: string | null; generation: number }>((from, to) =>
      admin.from('lineage_nodes').select('id, parent_id, generation').range(from, to),
    )
    if (allErr) return NextResponse.json({ error: allErr }, { status: 500 })
    const list = all ?? []
    const childrenOf = new Map<string | null, string[]>()
    for (const n of list) {
      const arr = childrenOf.get(n.parent_id) ?? []
      arr.push(n.id)
      childrenOf.set(n.parent_id, arr)
    }
    const subtree = new Set<string>()
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop() as string
      subtree.add(cur)
      for (const c of childrenOf.get(cur) ?? []) stack.push(c)
    }
    if (newParent && subtree.has(newParent)) {
      return NextResponse.json({ error: 'לא ניתן להעביר צומת אל תוך הצאצאים שלו' }, { status: 400 })
    }
    let baseGen = 1
    if (newParent) {
      const p = list.find((n) => n.id === newParent)
      baseGen = (p?.generation ?? 0) + 1
    }
    updates.parent_id = newParent
    updates.generation = baseGen
    // חישוב הדור החדש לכל צאצא בזיכרון, ואז כתיבה מקובצת לפי דור (update ... in) במקום
    // round-trip לכל צומת — מוריד מ-O(מספר הצאצאים) ל-O(עומק תת-העץ).
    const genOf = new Map<number, string[]>()
    const queue: { id: string; gen: number }[] = []
    for (const c of childrenOf.get(id) ?? []) queue.push({ id: c, gen: baseGen + 1 })
    while (queue.length) {
      const item = queue.shift() as { id: string; gen: number }
      const arr = genOf.get(item.gen) ?? []
      arr.push(item.id)
      genOf.set(item.gen, arr)
      for (const c of childrenOf.get(item.id) ?? []) queue.push({ id: c, gen: item.gen + 1 })
    }
    for (const [gen, ids] of genOf) {
      const { error: gErr } = await admin.from('lineage_nodes').update({ generation: gen }).in('id', ids)
      if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })
    }
  }

  const { data, error } = await admin
    .from('lineage_nodes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // אישור ידני של שם → מאמתים גם את כל שרשרת האבות ה"ממתינים" מעליו.
  // בלי זה, שם מאושר שאב שלו עדיין "ממתין" אינו נגיש בבורר סדר הדורות (הבורר
  // מנווט רק דרך צמתים מאומתים), ולכן לא יופיע לנרשמים הבאים.
  if (updates.status === 'verified') {
    let cur: string | null = (data?.parent_id as string | null) ?? null
    const guard = new Set<string>([id])
    while (cur && !guard.has(cur)) {
      guard.add(cur)
      const { data: anc } = await admin.from('lineage_nodes').select('id, parent_id, status').eq('id', cur).maybeSingle() as {
        data: { id: string; parent_id: string | null; status: string } | null
      }
      if (!anc) break
      if (anc.status === 'verified') break
      await admin.from('lineage_nodes').update({ status: 'verified' }).eq('id', cur).then(undefined, () => {})
      cur = (anc.parent_id as string | null) ?? null
    }
  }

  // ── דחיית מפל ──
  // צומת שנדחה מפיל אוטומטית את כל צאצאיו לדחייה — לא ייתכן שדור נדחה ודור אחריו
  // מאושר. (חזרה מדחייה אינה מפל: יש לאשר כל צאצא במפורש.)
  let rejectedBeneficiaries = 0
  if (updates.status === 'rejected') {
    const { rows: nodesForCascade } = await fetchAllRows<TreeNodeRow>((from, to) =>
      admin.from('lineage_nodes').select(NODE_SELECT).range(from, to),
    )
    if (nodesForCascade.length) {
      const rejected = await cascadeRejectSubtree(admin, nodesForCascade as TreeNodeRow[], id)
      // ⚠️ דחייה בעץ → דחיית המשפחות המקושרות. בלי זה יחוס שנדחה במפורש
      // השאיר את המשפחה "מאושרת" בצאצאים — הפער שהסטטוס בעץ אמור לסגור.
      rejectedBeneficiaries = await rejectLinkedBeneficiaries(admin, nodesForCascade as TreeNodeRow[], id)
      if (rejectedBeneficiaries) {
        await logActivity(admin, {
          userId: staff.userId, action: 'beneficiaries_rejected_from_lineage',
          entityType: 'lineage_node', entityId: id, details: { count: rejectedBeneficiaries },
        }).catch(() => {})
      }
      if (rejected.length > 1) {
        console.log(`[lineage] node ${id} rejected → cascaded ${rejected.length - 1} descendant(s)`)
        await logActivity(admin, {
          userId: staff.userId, action: 'lineage_cascade_rejected',
          entityType: 'lineage_node', entityId: id, details: { count: rejected.length - 1 },
        }).catch(() => {})
      }
    }
  }

  // ── סנכרון לכרטסות הצאצאים ──
  // שינוי שם / הורה / סטטוס משפיע על שרשרת הדורות של כל צאצא שמסלולו עובר דרך
  // הצומת הזה. מרעננים להם את lineage_chain כדי שהמסכים והמיילים שקוראים את
  // העותק השמור לא יישארו עם השם או המבנה הישן.
  // (הצ'יפים בכרטסת נגזרים מהעץ בזמן אמת וממילא מעודכנים — זה עבור שאר הצרכנים.)
  const { rows: freshNodes } = await fetchAllRows<TreeNodeRow>((from, to) =>
    admin.from('lineage_nodes').select(NODE_SELECT).range(from, to),
  )
  let approved = 0
  if (freshNodes.length) {
    const synced = await resyncSubtree(admin, freshNodes as TreeNodeRow[], id)
    if (synced) console.log(`[lineage] node ${id} updated → synced ${synced} beneficiary chain(s)`)

    // ⚠️ אישור בעץ → אישור המשפחה בצאצאים. עד כה הסנכרון היה חד-כיווני
    // (משפחה → עץ בלבד), ולכן צומת ירוק בעץ נשאר "ממתין לאישור" בצאצאים.
    if (updates.status === 'verified') {
      const approvedIds = await approveVerifiedBeneficiaries(admin, freshNodes as TreeNodeRow[], id)
      approved = approvedIds.length
      if (approved) {
        console.log(`[lineage] node ${id} verified → approved ${approved} beneficiary/ies`)
        await logActivity(admin, {
          userId: staff.userId,
          action: 'beneficiaries_auto_approved_from_lineage',
          entityType: 'lineage_node', entityId: id,
          details: { count: approved },
        }).catch(() => {})
      }
      // ⚠️ משפחה שאושרה — ילדיה (שהוזנו עם ת"ז) נכנסים לעץ כמאושרים, בדיוק
      // כמו באישור מהכרטסת. אחרת אותה משפחה הייתה מתנהגת אחרת לפי *היכן*
      // אושרה, והילדים היו ממתינים לאישור חוזר של יחוס שכבר אושר.
      for (const benId of approvedIds) {
        await syncChildrenOfBeneficiary(admin, benId).catch(() => null)
      }
    }
  }

  invalidateLineageCache()
  return NextResponse.json({ node: data, approvedBeneficiaries: approved, rejectedBeneficiaries })
}

export async function DELETE(request: NextRequest) {
  const staff = await requirePermission('lineage', 'delete')
  if (!staff) return forbidden()

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר ID' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  // סנכרון: מחיקת צומת בעץ מוחקת גם את המשפחות (צאצאים) המקושרות אליו
  await admin.from('beneficiaries').delete().eq('lineage_node_id', id).then(undefined, () => {})

  const { error } = await admin.from('lineage_nodes').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  invalidateLineageCache()
  return NextResponse.json({ ok: true })
}
