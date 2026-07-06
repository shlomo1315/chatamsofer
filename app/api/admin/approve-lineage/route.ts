// סנכרון צבע צומת הדורות עם סטטוס המשפחה: אישור משפחה → הצומת של הנרשם
// (וכל אבותיו ה"ממתינים" שהוא הוסיף) הופכים ל"מאומת" (ירוק). סטטוס אחר → חזרה ל"ממתין".
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  let body: { beneficiaryId?: string; approved?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const beneficiaryId = String(body.beneficiaryId ?? '')
  const approved = !!body.approved
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin.from('beneficiaries').select('lineage_node_id').eq('id', beneficiaryId).maybeSingle()
  const nodeId = ben?.lineage_node_id as string | null | undefined
  if (!nodeId) return NextResponse.json({ ok: true, updated: 0 }) // אין צומת מקושר — אין מה לעדכן

  if (!approved) {
    // החזרת הצומת של הנרשם בלבד ל"ממתין" (לא נוגעים באבות שעשויים להיות משותפים)
    await admin.from('lineage_nodes').update({ status: 'pending' }).eq('id', nodeId).then(undefined, () => {})
    return NextResponse.json({ ok: true, updated: 1 })
  }

  // אישור: מאמתים את הצומת של הנרשם וכל שרשרת האבות ה"ממתינים" מעליו עד הצומת המאומת הראשון.
  let cur: string | null = nodeId
  let updated = 0
  const guard = new Set<string>()
  while (cur && !guard.has(cur)) {
    guard.add(cur)
    const { data: node } = await admin.from('lineage_nodes').select('id, parent_id, status').eq('id', cur).maybeSingle() as {
      data: { id: string; parent_id: string | null; status: string } | null
    }
    if (!node) break
    if (node.status === 'verified') break // הגענו לחלק המאומת — עוצרים
    await admin.from('lineage_nodes').update({ status: 'verified' }).eq('id', cur).then(undefined, () => {})
    updated++
    cur = (node.parent_id as string | null) ?? null
  }
  return NextResponse.json({ ok: true, updated })
}
