import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { NODE_SELECT, pathToRoot, chainFromPath, invalidateLineageCache, resyncSubtree, type TreeNodeRow } from '@/lib/lineageSync'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { logActivity } from '@/lib/activityLog'
import {
  diffChains, extractProposedChain, extractRequesterNote, extractRequesterName,
  normalizeName, matchChild, type ChainRow,
} from '@/lib/lineageChainDiff'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז בקשות המשפחות — כל בקשות תיקון סדר הדורות במקום אחד, עם מצב טיפול.
//
// 🔴 הבעיה שזה פותר: 147 בקשות המתינו ללא טיפול, הוותיקה שלושה שבועות.
// הבקשות מהאזור האישי נשמרות כ-note (טקסט חופשי), ואישור של note לא עשה
// דבר בעץ — המנהל נדרש לפענח מהמלל ולבנות ידנית שרשרת של 8-9 דורות.
//
// GET  — הרשימה, כולל *השוואה מחושבת* בין השרשרת הרשומה למבוקשת.
// POST — הכרעה: אישור (מחיל את השרשרת בפועל), דחייה, או עדכון מצב טיפול.
// ─────────────────────────────────────────────────────────────────────────────

function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

interface Row {
  id: string; kind: string; status: string
  node_id: string | null; parent_id: string | null
  proposed_name: string | null; relation: 'son' | 'son_in_law' | null
  payload: Record<string, unknown> | null
  reviewer_name: string | null; beneficiary_id: string | null
  created_at: string; resolved_at: string | null
  work_state: string | null; staff_note: string | null; touched_at: string | null
}

/** מצבי הטיפול הפתוחים. ⚠️ מקור אמת יחיד — גם הממשק קורא מכאן. */
const WORK_STATES = ['open', 'in_progress', 'waiting_family', 'later'] as const

export async function GET(request: NextRequest) {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const sp = request.nextUrl.searchParams
  // ברירת מחדל: הפתוחות בלבד — זו העבודה שממתינה.
  const scope = sp.get('scope') ?? 'pending'

  let q = admin.from('lineage_review_suggestions').select('*')
  if (scope === 'pending') q = q.eq('status', 'pending')
  else if (scope === 'done') q = q.neq('status', 'pending')
  // scope='all' — הכול

  // ⚠️ הוותיקה קודם: הבקשה שממתינה הכי הרבה זמן היא הדחופה ביותר.
  const { data, error } = await q.order('created_at', { ascending: true }).limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data ?? []) as Row[]

  // ── השרשרות הרשומות אצלנו ──
  const benIds = Array.from(new Set(rows.map(r => r.beneficiary_id).filter(Boolean) as string[]))
  const benById = new Map<string, { id: string; full_name: string | null; family_name: string | null; lineage_chain: unknown; lineage_node_id: string | null; phone: string | null; email: string | null; city: string | null }>()
  if (benIds.length) {
    const { data: bens } = await admin.from('beneficiaries')
      .select('id, full_name, family_name, lineage_chain, lineage_node_id, phone, email, city')
      .in('id', benIds)
    for (const b of bens ?? []) benById.set((b as { id: string }).id, b as never)
  }

  // שמות הצמתים המעורבים (להצעות rename/reparent/add_child הישנות).
  const nodeIds = Array.from(new Set(rows.flatMap(r => [r.node_id, r.parent_id]).filter(Boolean) as string[]))
  const nameById: Record<string, string> = {}
  if (nodeIds.length) {
    const { data: ns } = await admin.from('lineage_nodes').select('id, name').in('id', nodeIds)
    for (const n of ns ?? []) nameById[(n as { id: string }).id] = (n as { name: string }).name
  }

  const items = rows.map((r) => {
    const ben = r.beneficiary_id ? benById.get(r.beneficiary_id) : null
    const current = (Array.isArray(ben?.lineage_chain) ? ben!.lineage_chain : []) as ChainRow[]
    const proposed = extractProposedChain(r.payload)
    // ⚠️ ההשוואה מחושבת בשרת ולא בדפדפן: היא צריכה להיות זהה למה שהאישור
    // יחיל בפועל, וחישוב כפול בשני מקומות הוא בדיוק הדרך שבהם הם מסתעפים.
    const diff = proposed.length ? diffChains(current, proposed) : null
    return {
      id: r.id, kind: r.kind, status: r.status,
      workState: r.work_state ?? 'open',
      staffNote: r.staff_note,
      createdAt: r.created_at, resolvedAt: r.resolved_at, touchedAt: r.touched_at,
      beneficiaryId: r.beneficiary_id,
      // שם המבקש: מהכרטסת אם יש, אחרת מתוך גוף הבקשה.
      requesterName:
        (ben ? [ben.family_name, ben.full_name].filter(Boolean).join(' ') : null)
        || r.reviewer_name || extractRequesterName(r.payload),
      contact: ben ? { phone: ben.phone, email: ben.email, city: ben.city } : null,
      note: extractRequesterNote(r.payload),
      nodeName: r.node_id ? nameById[r.node_id] ?? null : null,
      parentName: r.parent_id ? nameById[r.parent_id] ?? null : null,
      proposedName: r.proposed_name,
      relation: r.relation,
      current, proposed, diff,
    }
  })

  // ── מונים לכותרת ──
  // ⚠️ נספרים מהרשימה המלאה ולא משאילתה נפרדת, כדי שהמספרים יתאימו בדיוק
  // למה שמוצג — מונה שסופר אחרת מהרשימה הוא בדיוק מקור חוסר האמון.
  const summary = {
    total: items.length,
    open: items.filter(i => i.status === 'pending' && (i.workState ?? 'open') === 'open').length,
    inProgress: items.filter(i => i.status === 'pending' && i.workState === 'in_progress').length,
    waitingFamily: items.filter(i => i.status === 'pending' && i.workState === 'waiting_family').length,
    later: items.filter(i => i.status === 'pending' && i.workState === 'later').length,
    done: items.filter(i => i.status !== 'pending').length,
  }

  return NextResponse.json({ items, summary })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — הכרעה על בקשה.
//   action='state'   → עדכון מצב טיפול / הערת מנהל (בלי לגעת בעץ)
//   action='reject'  → דחייה
//   action='approve' → אישור. עבור בקשת שרשרת (note עם chain) — *מחיל אותה*.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  let body: { id?: string; action?: string; workState?: string; staffNote?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const id = (body.id ?? '').trim()
  const action = body.action ?? ''
  if (!id || !['approve', 'reject', 'state'].includes(action)) {
    return NextResponse.json({ error: 'פרמטרים לא תקינים' }, { status: 400 })
  }

  const { data: sug } = await admin.from('lineage_review_suggestions').select('*').eq('id', id).maybeSingle()
  if (!sug) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  const s = sug as Row

  const now = new Date().toISOString()
  const touch = { touched_by: staff.userId, touched_at: now }

  // ── עדכון מצב טיפול / הערה — אינו נוגע בעץ ──
  if (action === 'state') {
    const patch: Record<string, unknown> = { ...touch }
    if (body.workState !== undefined) {
      if (!(WORK_STATES as readonly string[]).includes(body.workState)) {
        return NextResponse.json({ error: 'מצב טיפול לא מוכר' }, { status: 400 })
      }
      patch.work_state = body.workState
    }
    if (body.staffNote !== undefined) patch.staff_note = String(body.staffNote).slice(0, 2000)
    const { error } = await admin.from('lineage_review_suggestions').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ⚠️ מכאן והלאה — הכרעה סופית. בקשה שכבר הוכרעה אינה מוכרעת שוב:
  // אחרת שתי לחיצות (או שני מנהלים) מחילים את אותה שרשרת פעמיים.
  if (s.status !== 'pending') {
    return NextResponse.json({ error: 'הבקשה כבר טופלה' }, { status: 409 })
  }

  if (action === 'reject') {
    await admin.from('lineage_review_suggestions').update({
      status: 'rejected', resolved_at: now, resolved_by: staff.userId,
      staff_note: body.staffNote !== undefined ? String(body.staffNote).slice(0, 2000) : s.staff_note,
      ...touch,
    }).eq('id', id)
    await logActivity(admin, {
      userId: staff.userId, action: 'lineage_request_rejected',
      entityType: 'beneficiary', entityId: s.beneficiary_id ?? null,
      details: { suggestionId: id },
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  // ── אישור ──
  try {
    let applied: { createdNodes: number; movedTo: string | null } | null = null

    const proposed = extractProposedChain(s.payload)
    if (proposed.length && s.beneficiary_id) {
      applied = await applyChain(admin, s.beneficiary_id, proposed)
    } else if (s.kind === 'rename' && s.node_id && s.proposed_name) {
      await admin.from('lineage_nodes').update({ name: s.proposed_name }).eq('id', s.node_id)
    } else if (s.kind === 'reparent' && s.node_id && s.parent_id) {
      const { data: p } = await admin.from('lineage_nodes').select('generation').eq('id', s.parent_id).maybeSingle()
      const gen = ((p as { generation?: number } | null)?.generation ?? 0) + 1
      await admin.from('lineage_nodes').update({ parent_id: s.parent_id, generation: gen }).eq('id', s.node_id)
    } else if (s.kind === 'add_child' && s.parent_id && s.proposed_name) {
      const { data: p } = await admin.from('lineage_nodes').select('generation').eq('id', s.parent_id).maybeSingle()
      const gen = ((p as { generation?: number } | null)?.generation ?? 0) + 1
      await admin.from('lineage_nodes').insert({
        name: s.proposed_name, parent_id: s.parent_id, generation: gen,
        relation: s.relation ?? null, status: 'pending',
      })
    } else {
      // 🔴 אישור שאינו מחיל דבר — נכשל ברעש ולא בשקט.
      //
      // ⚠️ זה היה הבאג: בקשה מסוג 'note' בטקסט חופשי (שאינו בפורמט
      // "דור N: שם") אינה מתאימה לאף ענף, ולכן נפלה עד לכאן — ואז סומנה
      // 'approved' בלי ששום דבר בעץ השתנה. המנהל ראה "אושר", הבקשה נעלמה
      // מהרשימה, והמשפחה המתינה לתיקון שלא קרה. זה שורש 147 הבקשות
      // התקועות: הן לא "לא טופלו", הן *נבלעו*.
      //
      // ⚠️ הדחייה כאן היא 400 ולא 500: אין תקלת שרת — הבקשה פשוט אינה
      // ניתנת להחלה אוטומטית, והמנהל צריך לטפל בה ידנית (או לדחות אותה
      // עם נימוק). הסטטוס נשאר 'pending' וההצעה נשארת ברשימה.
      return NextResponse.json({
        error: 'לא ניתן להחיל את הבקשה אוטומטית — היא אינה כוללת שרשרת דורות מפורשת. ' +
          'יש לתקן את הייחוס ידנית בעץ, ואז לסמן את הבקשה כטופלה או לדחות אותה עם נימוק.',
      }, { status: 400 })
    }

    await admin.from('lineage_review_suggestions').update({
      status: 'approved', resolved_at: now, resolved_by: staff.userId,
      staff_note: body.staffNote !== undefined ? String(body.staffNote).slice(0, 2000) : s.staff_note,
      ...touch,
    }).eq('id', id)

    invalidateLineageCache()
    await logActivity(admin, {
      userId: staff.userId, action: 'lineage_request_approved',
      entityType: 'beneficiary', entityId: s.beneficiary_id ?? null,
      details: { suggestionId: id, kind: s.kind, ...applied },
    }).catch(() => {})

    return NextResponse.json({ ok: true, applied })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בהחלת הבקשה' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// החלת שרשרת דורות מבוקשת על העץ.
//
// 🔴 זה מה שהיה חסר לגמרי: 145 בקשות שרשרת נשמרו כ-note, ואישורן לא עשה
// דבר. כאן השרשרת מיושמת בפועל — הולכים מהשורש ומטה, ולכל דור מחפשים צומת
// קיים בעל אותו שם תחת אותו אב; אם אין — יוצרים אותו כ-pending.
//
// ⚠️ הצמתים החדשים נוצרים כ-'pending' ולא 'verified': המשפחה *טוענת* לייחוס,
// והטענה אינה הופכת לעובדה מאושרת רק משום שהמנהל אישר את הטיפול בבקשה.
// אישור הייחוס עצמו נעשה בכלי האישור הרגילים.
//
// ⚠️ אין מחיקה של צמתים: דור שהמשפחה "הסירה" עשוי להיות אביהם של אחרים.
// המוטב פשוט מחובר מחדש לצומת הנכון, והישן נשאר לשאר הענף.
// ─────────────────────────────────────────────────────────────────────────────
export async function applyChain(
  admin: SupabaseClient,
  beneficiaryId: string,
  chain: ChainRow[],
): Promise<{ createdNodes: number; movedTo: string | null }> {
  const { rows: nodes } = await fetchAllRows<TreeNodeRow>((from, to) =>
    admin.from('lineage_nodes').select(NODE_SELECT).range(from, to),
  )

  // השורש: צומת בלי הורה. ⚠️ העץ כולו תלוי בו, ובלעדיו אין לאן לחבר.
  const root = nodes.find(n => !n.parent_id)
  if (!root) throw new Error('לא נמצא שורש בעץ הדורות')

  const sorted = [...chain].sort((a, b) => a.generation - b.generation)
  const byParent = new Map<string, TreeNodeRow[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const l = byParent.get(n.parent_id)
    if (l) l.push(n); else byParent.set(n.parent_id, [n])
  }

  // ── שלב א': פתרון המסלול *בלי לכתוב דבר* ──
  //
  // 🔴 שני שלבים ולא אחד: אם דרך מעורפלת מתגלה באמצע השרשרת, כתיבה שכבר
  // התרחשה משאירה בעץ צמתים יתומים שאיש לא ביקש — והמשפחה נשארת מחוברת
  // לדור חלקי. כאן קודם מוודאים שכל המסלול ברור, ורק אז כותבים.
  const plan: { step: ChainRow; existingId: string | null }[] = []
  let cursor = root.id
  // ⚠️ מתחילים מדור 2: דור 1 הוא השורש עצמו (מרן החתם סופר), ואין ליצור
  // אותו מחדש גם אם המשפחה כתבה אותו קצת אחרת.
  for (const step of sorted) {
    if (step.generation <= 1) continue
    if (!normalizeName(step.name)) continue

    // 🔴 התאמה מדורגת (מלאה → שם הבעל), ולעולם לא ניחוש. 79% מהצמתים
    // כתובים "רבי X ומרת Y", ומשפחה שכותבת את שם האישה מתכוונת לאותו אדם
    // שרשום אצלנו בלי האישה — השוואה מילולית הייתה יוצרת כפילות.
    const match = matchChild(byParent.get(cursor) ?? [], step.name)

    // ⚠️ מעורפל = עצירה מוחלטת. שני מועמדים תחת אותו אב פירושם שאיננו
    // יודעים לאיזה מהם המשפחה שייכת, ובחירה שגויה מצמידה אותה לענף לא
    // לה — בדיוק הטעות שהיא ביקשה לתקן.
    if (match.how === 'ambiguous') {
      throw new Error(
        `לא ניתן להחיל אוטומטית: בדור ${step.generation} קיימים ${match.candidates.length} צמתים מתאימים ל"${step.name}" ` +
        `(${match.candidates.map(c => c.name).join(' · ')}). יש להכריע ידנית בעץ ואז לאשר.`,
      )
    }

    plan.push({ step, existingId: match.node?.id ?? null })
    if (match.node) {
      cursor = match.node.id
    } else {
      // ⚠️ מכאן והלאה כל הדורות בהכרח חדשים: אב שאינו קיים אינו יכול
      // להיות בעל ילדים קיימים. סימון מפורש כדי שהלולאה לא תחפש התאמות
      // תחת מזהה שטרם נוצר.
      cursor = ''
    }
    if (!cursor) break
  }

  // הדורות שנותרו אחרי הצומת הקיים האחרון — כולם חדשים בהכרח.
  for (const step of sorted) {
    if (step.generation <= 1 || !normalizeName(step.name)) continue
    if (plan.some(p => p.step.generation === step.generation)) continue
    plan.push({ step, existingId: null })
  }
  plan.sort((a, b) => a.step.generation - b.step.generation)

  // ── שלב ב': כתיבה ──
  let parentId = root.id
  let createdNodes = 0
  for (const { step, existingId } of plan) {
    if (existingId) { parentId = existingId; continue }
    const { data: created, error } = await admin.from('lineage_nodes').insert({
      name: step.name.trim(),
      parent_id: parentId,
      generation: step.generation,
      relation: step.relation ?? null,
      status: 'pending',
    }).select('id').single()
    if (error) throw new Error(`יצירת דור ${step.generation} נכשלה: ${error.message}`)
    parentId = (created as { id: string }).id
    createdNodes++
  }

  // ── חיבור המוטב לצומת האחרון בשרשרת ──
  await admin.from('beneficiaries').update({
    lineage_node_id: parentId,
    lineage_fix_required: false,
    lineage_fixed_at: new Date().toISOString(),
  }).eq('id', beneficiaryId)

  // רענון השרשרת השמורה — גם למוטב וגם לכל מי שתלוי בענף שהשתנה.
  const { rows: fresh } = await fetchAllRows<TreeNodeRow>((from, to) =>
    admin.from('lineage_nodes').select(NODE_SELECT).range(from, to),
  )
  const map = new Map(fresh.map(n => [n.id, n]))
  const path = pathToRoot(map, parentId)
  if (path.length) {
    await admin.from('beneficiaries')
      .update({ lineage_chain: chainFromPath(path) })
      .eq('id', beneficiaryId)
  }
  await resyncSubtree(admin, fresh, parentId).catch(() => {})

  return { createdNodes, movedTo: parentId }
}
