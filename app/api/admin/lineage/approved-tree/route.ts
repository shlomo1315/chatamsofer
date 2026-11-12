import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { invalidateApprovedRef } from '@/lib/lineageApprovedRef'
import { logActivity } from '@/lib/activityLog'
import {
  MAX_GEN_LIMIT, WINDOW_GENS, computeApproved, classifyLines, refKeyOf,
  type ApprovedTreeNode, type RefRowLite,
} from '@/lib/lineageApprovedTree'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// מסך "המאושרים בעץ" — כל הדורות, בחלונות של 5 (פרמטר from).
//
// "מאושר" = שורה ב-lineage_approved_ref (מקור האמת לצבע הירוק בכל הכרטסות).
// GET   — חלון של 5 דורות (בלי נדחים) עם סימון מאושר/ממתין.
// POST  — approve (אישור צמתים קיימים) | add (הדבקת שמות) | undo (ביטול).
//
// ⚠️ השרת מאמת מחדש כל סיווג וכל "אב לפני ילד": מה שהדפדפן ראה אינו מחייב.
// ⚠️ אחרי כל כתיבה חובה לאפס את שתי המטמונים, אחרת הכרטסות ימשיכו להציג את הישן.
// ─────────────────────────────────────────────────────────────────────────────

const KEY_PREFIX = 'tree:'

interface NodeRow { id: string; name: string; generation: number; parent_id: string | null }
type Db = NonNullable<ReturnType<typeof getServiceClient>>

type Loaded = { nodes: NodeRow[]; refs: RefRowLite[]; tree: ApprovedTreeNode[] }

// ⚡ מטמון קצר בזיכרון ל-GET (הטעינה היא עמודים רבים מהמסד). כתיבות טוענות תמיד מחדש
// (approveNodes משנה את העץ במקום) ומנקות את המטמון; ה-POST מחזיר ללקוח נתונים טריים.
const CACHE_MS = 60_000
let _loaded: { at: number; data: Loaded } | null = null
let _inflight: Promise<Loaded> | null = null
const bustCache = () => { _loaded = null; _inflight = null }

async function loadCached(db: Db): Promise<Loaded> {
  if (_loaded && Date.now() - _loaded.at < CACHE_MS) return _loaded.data
  if (!_inflight) {
    _inflight = load(db).then(d => { _loaded = { at: Date.now(), data: d }; return d })
      .finally(() => { _inflight = null })
  }
  return _inflight
}

async function load(db: Db): Promise<Loaded> {
  const [{ rows: nodes }, { rows: refs }] = await Promise.all([
    fetchAllRows<NodeRow>((from, to) => db.from('lineage_nodes')
      .select('id, name, generation, parent_id')
      .neq('status', 'rejected').order('id').range(from, to)),
    fetchAllRows<RefRowLite>((from, to) => db.from('lineage_approved_ref')
      .select('key, name, generation, parent_key').order('key').range(from, to)),
  ])
  return { nodes, refs, tree: computeApproved(nodes, refs) }
}

/** חלון של WINDOW_GENS דורות; העמודה הראשונה (כשאינה דור 1) מנותקת מהאב ומסומנת parent_ok. */
function windowOf(tree: ApprovedTreeNode[], from: number) {
  const byId = new Map(tree.map(n => [n.id, n]))
  const maxGen = tree.reduce((m, n) => Math.max(m, n.generation), 1)
  const f = Number.isInteger(from) ? Math.min(Math.max(from, 1), Math.max(maxGen, 1)) : 1
  const nodes = tree.filter(n => n.generation >= f && n.generation < f + WINDOW_GENS).map(n =>
    n.generation === f && f > 1
      ? { ...n, parent_id: null, parent_ok: n.parent_id ? !!byId.get(n.parent_id)?.ok : true }
      : n)
  return { nodes, maxGen, from: f }
}

export async function GET(req: NextRequest) {
  const staff = await requirePermission('lineage', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const { tree } = await loadCached(db)
  return NextResponse.json(windowOf(tree, Number(new URL(req.url).searchParams.get('from') ?? 1)))
}



/** מאשר צמתים קיימים לפי הסדר (דור עולה): ילד רק אחרי שאביו מאושר. */
async function approveNodes(
  db: Db, ids: string[], tree: ApprovedTreeNode[], refs: RefRowLite[],
): Promise<{ approved: { id: string; key: string }[]; skipped: { id: string; reason: string }[] }> {
  const byId = new Map(tree.map(n => [n.id, n]))
  const approved: { id: string; key: string }[] = []
  const skipped: { id: string; reason: string }[] = []
  const rows: RefRowLite[] = []
  const live = [...refs]

  const wanted = [...new Set(ids)].map(id => byId.get(id))
  for (const n of wanted.filter((x): x is ApprovedTreeNode => !!x).sort((a, b) => a.generation - b.generation)) {
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined
    if (n.generation < 2) { skipped.push({ id: n.id, reason: 'דור לא מתאים' }); continue }
    if (n.ok) { skipped.push({ id: n.id, reason: 'כבר מאושר' }); continue }
    if (!parent || !parent.ok) { skipped.push({ id: n.id, reason: 'האב עדיין לא מאושר' }); continue }
    const parentKey = refKeyOf(parent, parent.parent_id ? (byId.get(parent.parent_id)?.name ?? null) : null, live)
    if (n.generation >= 3 && !parentKey) { skipped.push({ id: n.id, reason: 'האב לא נמצא בקובץ המאושר' }); continue }
    const row: RefRowLite = { key: `${KEY_PREFIX}${n.id}`, name: n.name, generation: n.generation, parent_key: parentKey }
    rows.push(row); live.push(row); n.ok = true
    approved.push({ id: n.id, key: row.key })
  }
  if (rows.length) {
    const { error } = await db.from('lineage_approved_ref').insert(rows)
    if (error) throw new Error(error.message)
  }
  for (const id of ids) if (!byId.has(id) && !skipped.some(s => s.id === id)) skipped.push({ id, reason: 'לא נמצא' })
  return { approved, skipped }
}

export async function POST(req: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  try {
    if (body.action === 'approve') {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 500) : []
      if (!ids.length) return NextResponse.json({ error: 'לא נבחרו שמות' }, { status: 400 })
      const { refs, tree } = await load(db)
      const res = await approveNodes(db, ids, tree, refs)
      if (res.approved.length) {
        bustCache(); invalidateApprovedRef(); invalidateLineageCache()
        await logActivity(db as never, {
          userId: staff.userId, action: 'lineage_approved_add', entityType: 'lineage_approved_ref',
          details: { mode: 'approve', nodeIds: res.approved.map(a => a.id) },
        })
      }
      return NextResponse.json({ ...res, ...windowOf((await load(db)).tree, Number(body.from ?? 1)) })
    }

    if (body.action === 'add') {
      const generation = Number(body.generation)
      const parentId = typeof body.parentId === 'string' ? body.parentId : null
      const names = Array.isArray(body.names) ? body.names.filter((x): x is string => typeof x === 'string').slice(0, 200) : []
      if (!Number.isInteger(generation) || generation < 2 || generation > MAX_GEN_LIMIT || !parentId || !names.length) {
        return NextResponse.json({ error: 'דור, אב ושמות חובה' }, { status: 400 })
      }
      const { refs, tree } = await load(db)
      const parent = tree.find(n => n.id === parentId)
      if (!parent || !parent.ok || parent.generation !== generation - 1) {
        return NextResponse.json({ error: 'האב חייב להיות מאושר ובדור שלפני' }, { status: 409 })
      }
      const results = classifyLines(names, tree, generation, parentId)

      // ילדים חדשים נוצרים בעץ ואז מאושרים; קיימים רק מאושרים.
      const idsToApprove: string[] = []
      const created: string[] = []
      const red: string[] = []
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        if (!r) continue
        if (r.kind === 'found' && r.nodeId) idsToApprove.push(r.nodeId)
        else if (r.kind === 'red') red.push(names[i].trim())
        else if (r.kind === 'new') {
          const { data, error } = await db.from('lineage_nodes').insert({
            name: names[i].trim(), parent_id: parentId, generation, status: 'verified',
          }).select('id, name, generation, parent_id').single()
          if (error || !data) throw new Error(error?.message ?? 'יצירת צומת נכשלה')
          created.push(data.id)
          tree.push({ ...(data as NodeRow), ok: false })
          idsToApprove.push(data.id)
        }
      }
      const res = await approveNodes(db, idsToApprove, tree, refs)
      if (created.length || res.approved.length) {
        bustCache(); invalidateApprovedRef(); invalidateLineageCache()
        await logActivity(db as never, {
          userId: staff.userId, action: 'lineage_approved_add', entityType: 'lineage_approved_ref',
          details: { mode: 'add', generation, parentId, created, nodeIds: res.approved.map(a => a.id), needsReview: red },
        })
      }
      return NextResponse.json({ ...res, created, red, ...windowOf((await load(db)).tree, Number(body.from ?? 1)) })
    }

    if (body.action === 'undo') {
      const keys = Array.isArray(body.keys)
        ? body.keys.filter((k): k is string => typeof k === 'string' && k.startsWith(KEY_PREFIX)).slice(0, 500) : []
      const created = Array.isArray(body.created) ? body.created.filter((x): x is string => typeof x === 'string') : []
      if (!keys.length) return NextResponse.json({ error: 'אין מה לבטל' }, { status: 400 })

      // ⚠️ אי אפשר לבטל אב כשכבר אושר תחתיו ילד שלא בביטול הזה.
      const { data: kids } = await db.from('lineage_approved_ref').select('key, parent_key').in('parent_key', keys)
      if ((kids ?? []).some((k: { key: string }) => !keys.includes(k.key))) {
        return NextResponse.json({ error: 'כבר אושרו שמות תחת האב הזה, אי אפשר לבטל' }, { status: 409 })
      }
      const { error } = await db.from('lineage_approved_ref').delete().in('key', keys)
      if (error) throw new Error(error.message)

      // צמתים שנוצרו באותה פעולה נמחקים רק אם אין להם ילדים.
      const removed: string[] = []
      for (const id of created) {
        const { count } = await db.from('lineage_nodes').select('id', { count: 'exact', head: true }).eq('parent_id', id)
        if ((count ?? 0) > 0) continue
        const { error: de } = await db.from('lineage_nodes').delete().eq('id', id)
        if (!de) removed.push(id)
      }
      bustCache(); invalidateApprovedRef(); invalidateLineageCache()
      await logActivity(db as never, {
        userId: staff.userId, action: 'lineage_approved_undo', entityType: 'lineage_approved_ref',
        details: { keys, removedNodes: removed },
      })
      return NextResponse.json({ ok: true, ...windowOf((await load(db)).tree, Number(body.from ?? 1)) })
    }

    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
  } catch (e) {
    console.error('[approved-tree]', e)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }
}
