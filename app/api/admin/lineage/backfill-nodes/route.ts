import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { ensureBeneficiaryNode, beneficiaryNodeName, nodeIsSelf, type BeneficiaryForNode } from '@/lib/beneficiaryNode'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// השלמה למפרע: צומת בעץ לכל נרשם שאין לו.
//
// עד היום צומת לנרשם נוצר רק אם הוא הוסיף דורות ידנית בטופס. כל השאר נשמרו
// ככרטסת מקושרת לצומת האב, ולכן לא היה להם ייצוג בעץ — בדיוק התלונה
// "יש צאצאים שרשומים ולא מופיעים בעץ".
//
// GET  — תצוגה מקדימה: כמה חסרים, מי הם, ומי לא ניתן להשלים ולמה.
// POST — מבצע. אידמפוטנטי (מזהה לפי ת"ז), וניתן להריץ שוב בבטחה.
//
// ⚠️ הצמתים נוצרים בסטטוס 'pending' בלבד. אין כאן אישור אוטומטי של אף אחד.
// ─────────────────────────────────────────────────────────────────────────────

type Row = BeneficiaryForNode & { id_number: string | null }

const COLS = 'id, id_number, full_name, spouse_name, family_name, gender, lineage_node_id, lineage_chain'

async function loadCandidates(admin: NonNullable<ReturnType<typeof getServiceClient>>) {
  // כל מי שמשויך לצומת בעץ. מי שאינו משויך כלל אינו ניתן למיקום, ומדווח בנפרד.
  const linked = await fetchAllRows<Row>((from, to) =>
    admin.from('beneficiaries').select(COLS).not('lineage_node_id', 'is', null).range(from, to))
  const unlinked = await fetchAllRows<Row>((from, to) =>
    admin.from('beneficiaries').select(COLS).is('lineage_node_id', null).range(from, to))
  return { linked, unlinked }
}

export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { linked, unlinked } = await loadCandidates(admin)
  if (linked.error) return NextResponse.json({ error: linked.error }, { status: 500 })

  // ⚠️ "האם יש לו צומת משלו" נבדק מול הצומת שהוא מקושר אליו, בשני סימנים:
  //
  //  • ת"ז זהה על אותו צומת.
  //  • 🔴 *או* שם הצומת הוא שמו (nodeIsSelf). זה הסימן הקריטי: הרישום בפורטל
  //    יוצר צומת לנרשם אך **בלי id_number**, ולכן זיהוי לפי ת"ז בלבד סימן
  //    אלפי נרשמים שכן נמצאים בעץ כ"חסרים" — וההשלמה הייתה יוצרת להם עותק
  //    שני כילד של הצומת של עצמם, דור אחד עמוק מדי.
  const nodeIds = [...new Set(linked.rows.map(r => r.lineage_node_id!).filter(Boolean))]
  const nodeById = new Map<string, { idNumber: string; name: string }>()
  for (let i = 0; i < nodeIds.length; i += 500) {
    const { data } = await admin.from('lineage_nodes')
      .select('id, name, id_number').in('id', nodeIds.slice(i, i + 500))
    for (const n of data ?? []) {
      const row = n as { id: string; name?: string | null; id_number?: string | null }
      nodeById.set(row.id, {
        idNumber: String(row.id_number ?? '').replace(/\D/g, ''),
        name: String(row.name ?? ''),
      })
    }
  }
  const clean = (v: unknown) => String(v ?? '').replace(/\D/g, '')
  const hasOwn = (r: Row) => {
    const node = nodeById.get(r.lineage_node_id!)
    if (!node) return false
    if (node.idNumber && node.idNumber === clean(r.id_number)) return true
    return nodeIsSelf(r, node.name)
  }

  const missing = linked.rows.filter(r => !hasOwn(r))
  const noName = missing.filter(r => !beneficiaryNodeName(r))

  return NextResponse.json({
    stats: {
      total: linked.rows.length + unlinked.rows.length,
      haveOwnNode: linked.rows.length - missing.length,
      missing: missing.length,
      buildable: missing.length - noName.length,
      noName: noName.length,
      notLinkedToTree: unlinked.rows.length,
    },
    families: missing.slice(0, 500).map(r => ({
      id: r.id,
      name: beneficiaryNodeName(r) || '(אין שם לבניית צומת)',
      idNumber: r.id_number,
      buildable: !!beneficiaryNodeName(r),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST() {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { linked } = await loadCandidates(admin)
  if (linked.error) return NextResponse.json({ error: linked.error }, { status: 500 })

  let created = 0, adopted = 0, claimed = 0, skipped = 0
  const failures: { name: string; reason: string }[] = []

  // ⚠️ סדרתי ולא במקביל: כל יצירה קוראת את צומת האב ואת אחיו, ושתי יצירות
  // מקבילות תחת אותו אב היו יוצרות שני צמתים לאותו אדם — בדיוק הכפילות
  // שהפונקציה נועדה למנוע.
  for (const ben of linked.rows) {
    const res = await ensureBeneficiaryNode(admin, ben)
    if (!res.ok) {
      if (res.reason === 'אין שם לבניית צומת' || res.reason === 'אין שיוך לעץ') skipped++
      else failures.push({ name: beneficiaryNodeName(ben) || ben.id, reason: res.reason })
      continue
    }
    if (res.created) created++
    else if (res.adopted) adopted++
    else if (res.claimed) claimed++
    else skipped++
  }

  if (created || adopted) invalidateLineageCache()

  await logActivity(admin, {
    userId: staff.userId,
    action: 'lineage_backfill_beneficiary_nodes',
    entityType: 'lineage_node',
    details: { created, adopted, claimed, skipped, failed: failures.length },
  }).catch(() => {})

  console.log(`[lineage-backfill] נוצרו ${created} · סומנו ${claimed} · אומצו ${adopted} · דולגו ${skipped} · כשלים ${failures.length}`)
  return NextResponse.json({
    created, adopted, claimed, skipped, failed: failures.length,
    failures: failures.slice(0, 20),
    summary: `נוצרו ${created} צמתים חדשים בעץ` +
      (claimed ? ` · ${claimed} צמתים קיימים סומנו כשלהם (היו בעץ כבר)` : '') +
      (adopted ? ` · ${adopted} קושרו לצומת קיים` : '') +
      (skipped ? ` · ${skipped} דולגו` : '') +
      (failures.length ? ` · ${failures.length} נכשלו` : ''),
  })
}
