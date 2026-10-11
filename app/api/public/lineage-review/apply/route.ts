import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NODE_SELECT, pathToRoot, invalidateLineageCache, type TreeNodeRow } from '@/lib/lineageSync'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { logActivity } from '@/lib/activityLog'
import { nodeIsSelf, beneficiaryNodeName, type BeneficiaryForNode } from '@/lib/beneficiaryNode'
import { getApprovedRefTree } from '@/lib/lineageApprovedRef'
import { earlyGenerationsCheck, appendManualGenerations } from '@/lib/lineageFixApply'
import { normalizeLineageNodeName, lineageIdentityKey } from '@/lib/lineageNameFormat'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// קישור תיקון סדר הדורות — החלת התיקון *מיד* (החלטת המשתמש 11.10).
//
// המשפחה בונה את הסדר מחדש באותו בורר של הרישום, והתוצאה נשמרת כאילו נרשמה
// מחדש: השרשרת והצומת שלה מתעדכנים, והכרטסת חוזרת ל"ממתין לאישור ראשוני"
// (eligibility_status='pending').
//
// 🔴 רק כש-5 הדורות הראשונים תקינים (lib/lineageFixApply). אחרת — וגם כשהצומת
// של המשפחה נושא צאצאים או משפחות נוספות — הבקשה נכנסת לתור הצוות כהערה,
// בדיוק כמו קודם. תיקון של משפחה אחת לעולם אינו מזיז צומת משותף.
//
// ⚠️ השרשרת נבנית *בשרת* מהעץ, לא מהדפדפן: הנתיב ציבורי, ושרשרת שנשלחה
// מהלקוח הייתה מאפשרת לכתוב לכרטסת כל סדר שהוא.
// ─────────────────────────────────────────────────────────────────────────────

function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const MAX_NEW = 12
const MAX_NAME = 120
type Rel = 'son' | 'son_in_law' | null
const rel = (r: unknown): Rel => (r === 'son' || r === 'son_in_law' ? r : null)

// POST { token, lineage_node_id, lineage_new_nodes: [{name, relation}], self_is_existing }
//   lineage_node_id — הדור העמוק ביותר שנבחר מהרשימה (או הצומת שסומן "זה אני").
//   lineage_new_nodes — הדורות שהוקלדו ידנית, ובסוף הנמען עצמו (אלא אם self_is_existing).
export async function POST(request: NextRequest) {
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  if (!rateLimit(`lineage-apply:${clientIp(request)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב מאוחר יותר.' }, { status: 429 })
  }

  let body: { token?: string; lineage_node_id?: string; lineage_new_nodes?: { name?: string; relation?: string }[]; self_is_existing?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { data: inv } = await admin.from('lineage_share_invites')
    .select('token, root_node_id, revoked_at, expires_at, recipient_name, beneficiary_id, mode')
    .eq('token', String(body.token ?? '')).maybeSingle()
  if (!inv || inv.revoked_at || new Date(inv.expires_at) < new Date() || inv.mode !== 'order' || !inv.beneficiary_id) {
    return NextResponse.json({ error: 'הקישור אינו תקין, בוטל, או פג תוקפו' }, { status: 403 })
  }

  const selfExisting = body.self_is_existing === true
  const newNodes = Array.isArray(body.lineage_new_nodes) ? body.lineage_new_nodes.slice(0, MAX_NEW) : []
  if (!selfExisting && !newNodes.length) return NextResponse.json({ error: 'יש להשלים את סדר הדורות עד אליכם' }, { status: 400 })

  const { rows: nodes } = await fetchAllRows<TreeNodeRow>((from, to) =>
    admin.from('lineage_nodes').select(NODE_SELECT).range(from, to),
  )
  const anchor = nodes.find(n => n.id === body.lineage_node_id)
  if (!anchor) return NextResponse.json({ error: 'הדור שנבחר לא נמצא בעץ' }, { status: 400 })
  const path = pathToRoot(nodes, anchor.id)

  const { data: ben } = await admin.from('beneficiaries')
    .select('id, full_name, family_name, spouse_name, marital_status, gender, id_number, lineage_chain, lineage_chain_before_fix, lineage_node_id, eligibility_status')
    .eq('id', inv.beneficiary_id).maybeSingle()
  if (!ben) return NextResponse.json({ error: 'הכרטסת לא נמצאה' }, { status: 404 })

  // שם הנמען — מחושב בשרת כמו בתיקון בפורטל ("שלמה ושרה ניימאן"), לא מהדפדפן.
  const married = String(ben.marital_status ?? '').startsWith('נשו')
  const given = married && ben.spouse_name ? `${ben.full_name} ו${ben.spouse_name}`.trim() : (ben.full_name || '')
  const selfName = [given, ben.family_name].filter(Boolean).join(' ').trim()

  // הדורות הידניים + הנמען (האחרון), בשמות מנורמלים.
  const manual = (selfExisting ? newNodes : newNodes.slice(0, -1))
    .map(n => ({ name: normalizeLineageNodeName({ name: String(n?.name ?? '').trim() }) || String(n?.name ?? '').trim(), relation: rel(n?.relation) }))
    .filter(n => n.name && n.name.length <= MAX_NAME)
  const selfRel = selfExisting ? rel(anchor.relation) : rel(newNodes[newNodes.length - 1]?.relation)

  // השרשרת המוצעת — לתור הצוות ולכרטסת.
  const proposed = [
    { generation: 1, name: 'רבינו החתם סופר', relation: null as Rel },
    ...path.slice(1).map(n => ({ generation: n.generation, name: n.name, relation: rel(n.relation) })),
    ...manual.map((m, k) => ({ generation: anchor.generation + 1 + k, name: m.name, relation: m.relation })),
    ...(selfExisting ? [] : [{ generation: anchor.generation + 1 + manual.length, name: selfName, relation: selfRel }]),
  ]

  // ── הצומת הנוכחי של הנמען — אותה זיהוי כמו בדף (ת"ז או שם מחושב) ──
  const cur = ben.lineage_node_id ? nodes.find(n => n.id === ben.lineage_node_id) : undefined
  let oldSelf: TreeNodeRow | undefined
  if (cur) {
    const clean = (v: unknown) => String(v ?? '').replace(/\D/g, '')
    if (nodeIsSelf(ben as BeneficiaryForNode, cur.name)) oldSelf = cur
    else if (clean(ben.id_number) && clean(cur.id_number) === clean(ben.id_number)) oldSelf = cur
  }
  let oldSelfShared = false
  if (oldSelf) {
    const hasChildren = nodes.some(n => n.parent_id === oldSelf!.id)
    const { count } = await admin.from('beneficiaries').select('id', { count: 'exact', head: true })
      .eq('lineage_node_id', oldSelf.id).neq('id', ben.id)
    oldSelfShared = hasChildren || (count ?? 0) > 0
  }

  // ⚠️ בחירת הצומת של הנמען עצמו (או צאצא שלו) כאב — לולאה בעץ.
  if (!selfExisting && oldSelf && path.some(n => n.id === oldSelf!.id)) {
    return NextResponse.json({ error: 'לא ניתן לבחור את עצמכם כאחד מהאבות. אם זה אתם — לחצו "זה אני".' }, { status: 400 })
  }

  // ── שער: 5 הדורות הראשונים + צומת שאינו משותף ──
  const early = earlyGenerationsCheck(path, await getApprovedRefTree(admin))
  const blockReason = !early.ok
    ? `דור ${early.generation} אינו תואם את סדר הדורות המאושר`
    : (oldSelfShared && oldSelf && !(selfExisting && oldSelf.id === anchor.id))
      ? 'הרשומה שלכם בעץ נושאת צאצאים או משפחות נוספות'
      : null

  if (blockReason) {
    const text = `בקשת תיקון סדר דורות (לא הוחלה אוטומטית — ${blockReason}):\n`
      + proposed.map(c => `דור ${c.generation}: ${c.name}${c.relation ? ` (${c.relation === 'son' ? 'בן' : 'חתן'})` : ''}`).join('\n')
    const { error } = await admin.from('lineage_review_suggestions').insert({
      token: inv.token, root_node_id: inv.root_node_id, kind: 'note', node_id: anchor.id,
      payload: { text, proposed_chain: proposed }, reviewer_name: inv.recipient_name, status: 'pending',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, applied: false, reason: blockReason })
  }

  // ── החלה ──
  let finalId: string
  let removedOldSelf: TreeNodeRow | null = null
  try {
    if (selfExisting) {
      finalId = anchor.id
    } else {
      const { lastId, lastGeneration } = await appendManualGenerations(admin, { id: anchor.id, generation: anchor.generation }, manual, MAX_NAME)
      // הנמען: אם כבר קיים תחת האב החדש (לפי מפתח זהות) — זה הוא; אחרת הצומת
      // הישן שלו עובר לשם (כשאינו משותף); ורק אם אין — נוצר צומת חדש.
      // ⚠️ הצומת בניסוח האחיד של העץ ("רבי X ומרת Y משפחה") — כמו בהשלמה למפרע.
      const selfNodeName = beneficiaryNodeName(ben as BeneficiaryForNode) || selfName
      const key = lineageIdentityKey(selfNodeName)
      const { data: siblings } = await admin.from('lineage_nodes').select('id, name, status').eq('parent_id', lastId)
      const same = (siblings ?? []).find((s: { name: string }) => lineageIdentityKey(s.name) === key)
      if (same && same.id !== oldSelf?.id) {
        finalId = same.id
      } else if (oldSelf) {
        const { error } = await admin.from('lineage_nodes')
          .update({ parent_id: lastId, generation: lastGeneration + 1, relation: selfRel })
          .eq('id', oldSelf.id)
        if (error) throw new Error(error.message)
        finalId = oldSelf.id
      } else {
        const r = await appendManualGenerations(admin, { id: lastId, generation: lastGeneration }, [{ name: selfNodeName, relation: selfRel }], MAX_NAME)
        finalId = r.lastId
      }
    }
    // הצומת הישן נשאר יתום (המשפחה בחרה צומת אחר כ"זה אני", או נמצא עותק תחת
    // האב החדש) — נמחק רק כשאינו משותף ואינו מאושר. תמונת מצב נשמרת ביומן.
    if (oldSelf && finalId !== oldSelf.id && !oldSelfShared && oldSelf.status !== 'verified') {
      const { error } = await admin.from('lineage_nodes').delete().eq('id', oldSelf.id)
      if (!error) removedOldSelf = oldSelf
    }
  } catch (e) {
    console.error('[lineage-review/apply] tree update failed:', e)
    return NextResponse.json({ error: 'שגיאה בעדכון עץ הדורות. אנא נסו שוב.' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const { error: upErr } = await admin.from('beneficiaries').update({
    ...(ben.lineage_chain_before_fix == null ? { lineage_chain_before_fix: ben.lineage_chain ?? [] } : {}),
    lineage_chain: proposed,
    lineage_node_id: finalId,
    lineage_manual: manual.map(m => m.name),
    lineage_fixed_at: now,
    // 🔴 כמו רישום חדש — חוזר ל"ממתין לאישור ראשוני", גם אם היה מאושר.
    eligibility_status: 'pending',
    updated_at: now,
  }).eq('id', ben.id)
  if (upErr) {
    console.error('[lineage-review/apply] beneficiary update failed:', upErr.message)
    return NextResponse.json({ error: 'שגיאה בשמירת התיקון. אנא נסו שוב.' }, { status: 500 })
  }
  invalidateLineageCache()

  await logActivity(admin, {
    action: 'lineage_review_applied',
    entityType: 'beneficiary',
    entityId: ben.id,
    details: {
      token: inv.token,
      before: { chain: ben.lineage_chain ?? null, node_id: ben.lineage_node_id ?? null, eligibility_status: ben.eligibility_status ?? null },
      after: { chain: proposed, node_id: finalId, eligibility_status: 'pending' },
      moved_self_node: oldSelf && finalId === oldSelf.id ? { id: oldSelf.id, prev_parent_id: oldSelf.parent_id, prev_generation: oldSelf.generation } : null,
      removed_self_node: removedOldSelf,
    },
  })

  return NextResponse.json({ ok: true, applied: true })
}
