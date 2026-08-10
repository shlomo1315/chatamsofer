import { NextResponse, type NextRequest } from 'next/server'
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

// מי באמת חסר צומת. משותף ל-GET ול-POST כדי ששניהם יראו בדיוק את אותה
// רשימה — אחרת התצוגה המקדימה והביצוע יכולים להסתמך על כללים שונים.
async function computeMissing(admin: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { linked, unlinked } = await loadCandidates(admin)
  if (linked.error) return { error: linked.error, missing: [], linked, unlinked, diag: null }

  // ⚠️ שליפה מלאה בדפים ולא .in() על מזהים: רשימת 500 UUID בונה כתובת של
  // ~18KB, וכשהיא נדחית בשקט המפה יוצאת ריקה וכל הנרשמים נראים כחסרים.
  const allNodes = await fetchAllRows<{ id: string; name: string | null; id_number: string | null }>((from, to) =>
    admin.from('lineage_nodes').select('id, name, id_number').range(from, to))
  if (allNodes.error) return { error: `טעינת העץ נכשלה: ${allNodes.error}`, missing: [], linked, unlinked, diag: null }

  const nodeById = new Map(allNodes.rows.map(n => [n.id, {
    idNumber: String(n.id_number ?? '').replace(/\D/g, ''),
    name: String(n.name ?? ''),
  }]))
  const clean = (v: unknown) => String(v ?? '').replace(/\D/g, '')
  let byId = 0, byName = 0, noNode = 0
  const hasOwn = (r: Row) => {
    const node = nodeById.get(r.lineage_node_id!)
    if (!node) { noNode++; return false }
    if (node.idNumber && node.idNumber === clean(r.id_number)) { byId++; return true }
    if (nodeIsSelf(r, node.name)) { byName++; return true }
    return false
  }
  const missing = linked.rows.filter(r => !hasOwn(r))
  return {
    error: null, missing, linked, unlinked,
    diag: { treeNodes: allNodes.rows.length, matchedById: byId, matchedByName: byName, linkedToMissingNode: noNode },
  }
}

export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { error, missing, linked, unlinked, diag } = await computeMissing(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })
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
    diag,
    families: missing.slice(0, 500).map(r => ({
      id: r.id,
      name: beneficiaryNodeName(r) || '(אין שם לבניית צומת)',
      idNumber: r.id_number,
      buildable: !!beneficiaryNodeName(r),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ מנה חסומה בגודלה, וברירת מחדל של 400.
  //
  // ההרצה על כל 3,281 חרגה מתקרת 5 הדקות של הנתיב, השרת החזיר דף שגיאה
  // במקום JSON, והמסך הציג "Unexpected token '<'". העבודה שכבר בוצעה נשמרה,
  // אבל המשתמש לא ידע את זה. מנה קטנה חוזרת תמיד בזמן, והלקוח חוזר עליה.
  const asked = Number(request.nextUrl.searchParams.get('limit') ?? 0)
  const batch = Math.min(Math.max(asked || 400, 1), 1000)

  const { error, missing } = await computeMissing(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })

  // ⚠️ רק מי שבאמת חסר, ולא ראש הרשימה הכללית. קודם המנה נחתכה מכל הנרשמים,
  // ולכן הרצה חוזרת טיפלה שוב באותם אנשים שכבר תוקנו במקום להתקדם.
  //
  // ⚠️ ומי שאין לו שם לבניית צומת מסונן החוצה לפני החיתוך: הוא לעולם לא ייבנה,
  // וכשהוא נשאר בראש הרשימה כל מנה חוזרת מבזבזת את עצמה עליו ו-remaining נתקע.
  const buildable = missing.filter(r => beneficiaryNodeName(r))
  const targets = buildable.slice(0, batch)

  let created = 0, adopted = 0, claimed = 0, skipped = 0
  const failures: { name: string; reason: string }[] = []

  // ⚠️ סדרתי: שתי יצירות מקבילות תחת אותו אב היו יוצרות שני צמתים לאותו אדם.
  for (const ben of targets) {
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

  if (created || adopted || claimed) invalidateLineageCache()

  const remaining = Math.max(0, buildable.length - targets.length)

  await logActivity(admin, {
    userId: staff.userId,
    action: 'lineage_backfill_beneficiary_nodes',
    entityType: 'lineage_node',
    details: { created, adopted, claimed, skipped, failed: failures.length, remaining },
  }).catch(() => {})

  console.log(`[lineage-backfill] נוצרו ${created} · סומנו ${claimed} · אומצו ${adopted} · דולגו ${skipped} · כשלים ${failures.length} · נותרו ${remaining}`)
  return NextResponse.json({
    created, adopted, claimed, skipped, failed: failures.length, remaining,
    processed: targets.length,
    failures: failures.slice(0, 20),
    summary: `נוצרו ${created} צמתים` +
      (claimed ? ` · ${claimed} כבר היו בעץ וסומנו` : '') +
      (adopted ? ` · ${adopted} קושרו לצומת קיים` : '') +
      (failures.length ? ` · ${failures.length} נכשלו` : '') +
      (remaining ? ` · נותרו ${remaining}` : ' · הושלם'),
  })
}
