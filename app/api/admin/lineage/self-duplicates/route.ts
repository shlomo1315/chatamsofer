import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { findSelfDuplicates, type SelfDupNode, type SelfDupBen } from '@/lib/selfDuplicateNodes'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// "דור אחרון כפול" — נרשם שנתלה כילד של עצמו.
//
// GET  — סריקה בלבד. מחזיר את המספרים ואת הרשימה, בלי לגעת בדבר.
// POST — התיקון, על מזהים שנבחרו במפורש בלבד.
//
// 🔴 ה-POST סורק מחדש בשרת ומתקן *רק* שורות שעברו את הזיהוי המלא כאן ועכשיו.
// מזהים שמגיעים מהלקוח הם בחירה, לא הוכחה: העץ זז בין הסריקה ללחיצה, ולקוח
// שמבקש למחוק צומת שצבר בינתיים ילדים לא יקבל את זה.
//
// הזיהוי, שתי הראיות ושני הסייגים נמצאים ב-lib/selfDuplicateNodes ומכוסים
// בבדיקות. כאן רק השליפה, ההרשאות, וסדר הפעולות.
// ─────────────────────────────────────────────────────────────────────────────

const NODE_COLS = 'id, name, parent_id, generation, status, id_number'
const BEN_COLS = 'id, id_number, full_name, spouse_name, family_name, gender, lineage_node_id, lineage_chain'

// תקרת שורות בתשובה. הספירה המלאה מוחזרת תמיד ואינה מקוצצת.
const MAX_ROWS = 500

async function loadAll(admin: ReturnType<typeof getServiceClient>) {
  // ⚠️ שליפה בדפים ולא .limit(): PostgREST חותך ב-1000 בלי שגיאה, והתוצאה
  // הייתה מספר חלקי שנראה מלא — אסור במסך שנועד לאשר מספרים לפני מחיקה.
  return Promise.all([
    fetchAllRows<SelfDupNode>((from, to) =>
      admin!.from('lineage_nodes').select(NODE_COLS).range(from, to)),
    fetchAllRows<SelfDupBen>((from, to) =>
      admin!.from('beneficiaries').select(BEN_COLS).range(from, to)),
  ])
}

export async function GET() {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()

  // ⚠️ אותה מדיניות כמו שאר מסכי האבחון: המסך בנוי סביב ת"ז ושמות משפחה.
  // המספרים לכולם, הפרטים המזהים רק למי שרשאי לצפות במשפחות.
  const canSeeBeneficiaries = !!(await requirePermission('beneficiaries', 'view'))

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const [nodes, bens] = await loadAll(admin)
  if (nodes.error) return NextResponse.json({ error: `טעינת העץ נכשלה: ${nodes.error}` }, { status: 500 })
  if (bens.error) return NextResponse.json({ error: `טעינת הכרטסות נכשלה: ${bens.error}` }, { status: 500 })

  const scan = findSelfDuplicates(nodes.rows, bens.rows)
  const mask = <T extends { benIdNumber: string; benId: string }>(r: T) =>
    canSeeBeneficiaries ? r : { ...r, benIdNumber: '', benId: '' }

  return NextResponse.json({
    rows: scan.rows.slice(0, MAX_ROWS).map(mask),
    blocked: scan.blocked.slice(0, MAX_ROWS).map(mask),
    total: scan.total,
    blockedTotal: scan.blocked.length,
    scannedNodes: scan.scannedNodes,
    scannedBeneficiaries: scan.scannedBeneficiaries,
    truncated: scan.total > MAX_ROWS,
    maxRows: MAX_ROWS,
    restricted: !canSeeBeneficiaries,
  })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const wanted: string[] = Array.isArray(body?.dupNodeIds) ? body.dupNodeIds.map(String) : []
  if (!wanted.length) return NextResponse.json({ error: 'לא נבחרו צמתים' }, { status: 400 })

  const [nodes, bens] = await loadAll(admin)
  if (nodes.error || bens.error) {
    return NextResponse.json({ error: 'טעינת הנתונים נכשלה' }, { status: 500 })
  }

  // 🔴 הזיהוי מחדש. רק שורה שעוברת את שתי הראיות ואת שני הסייגים *עכשיו*
  // מתוקנת, גם אם הלקוח ביקש אחרת.
  const scan = findSelfDuplicates(nodes.rows, bens.rows)
  const eligible = new Map(scan.rows.map(r => [r.dupNodeId, r]))
  const targets = wanted.map(id => eligible.get(id)).filter(Boolean) as typeof scan.rows
  const rejected = wanted.length - targets.length

  let fixed = 0, removed = 0, claimed = 0
  const failures: { node: string; reason: string }[] = []

  // ⚠️ סדרתי ולא במקביל: שתי מחיקות מקבילות תחת אותו אב הן בדיוק המצב שבו
  // ספירת הילדים שנקראה מראש כבר אינה נכונה.
  for (const r of targets) {
    try {
      // 1) הת"ז עוברת לצומת שנשאר, כדי שהבעלות תזוהה מיד בכל סריקה עתידית.
      if (r.willCopyIdNumber) {
        const { error } = await admin.from('lineage_nodes')
          .update({ id_number: r.benIdNumber }).eq('id', r.keepNodeId)
        if (error) throw new Error(error.message)
        claimed++
      }

      // 2) הכרטסת מצביעה על הצומת האמיתי — *לפני* המחיקה.
      // ⚠️ הסדר אינו סגנוני: מחיקה קודם הייתה משאירה את הכרטסת מצביעה על
      // צומת שאינו קיים, וזה בדיוק המצב שאין ממנו דרך חזרה אוטומטית.
      const { error: benErr } = await admin.from('beneficiaries')
        .update({ lineage_node_id: r.keepNodeId }).eq('id', r.benId)
      if (benErr) throw new Error(benErr.message)

      // 3) הצומת המיותר נמחק. הוא הוכח כעלה בלי כרטסות אחרות.
      const { error: delErr } = await admin.from('lineage_nodes').delete().eq('id', r.dupNodeId)
      if (delErr) throw new Error(delErr.message)

      fixed++; removed++
    } catch (e) {
      failures.push({ node: r.dupNodeName, reason: e instanceof Error ? e.message : 'שגיאה' })
    }
  }

  if (removed) invalidateLineageCache()

  await logActivity(admin, {
    userId: staff.userId,
    action: 'lineage_self_duplicate_fix',
    entityType: 'lineage_node',
    details: { requested: wanted.length, fixed, removed, claimed, rejected, failed: failures.length },
  }).catch(() => {})

  console.log(`[self-duplicates] תוקנו ${fixed} · הוסרו ${removed} צמתים · ת"ז הועברה ${claimed} · נדחו ${rejected} · כשלים ${failures.length}`)

  return NextResponse.json({
    fixed, removed, claimed, rejected,
    failures: failures.slice(0, 20),
    remaining: scan.total - fixed,
  })
}
