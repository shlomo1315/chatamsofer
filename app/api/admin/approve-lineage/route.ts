// סנכרון צבע צומת הדורות עם סטטוס המשפחה: אישור משפחה → הצומת של הנרשם
// (וכל אבותיו ה"ממתינים" שהוא הוסיף) הופכים ל"מאומת" (ירוק). סטטוס אחר → חזרה ל"ממתין".
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { syncChildrenOfBeneficiary } from '@/lib/lineageFamilyChildren'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { planApproveChain, type ApproveChainNode } from '@/lib/lineageApproveChain'

export const dynamic = 'force-dynamic'

/**
 * טוען את הצמתים ומחזיר את מה שיאושר אם יאושר הנרשם.
 *
 * 🔴 משמש גם את התצוגה המקדימה וגם את הביצוע, דרך אותה planApproveChain.
 * שתי הגדרות מקבילות של "מה עומד להתאשר" נפרדות בתיקון הבא, ואז האזהרה
 * מבטיחה דבר אחד והשרת עושה אחר.
 */
async function loadPlan(admin: NonNullable<ReturnType<typeof getServiceClient>>, beneficiaryId: string) {
  const { data: ben } = await admin.from('beneficiaries')
    .select('lineage_node_id').eq('id', beneficiaryId).maybeSingle()
  const nodeId = (ben as { lineage_node_id?: string | null } | null)?.lineage_node_id ?? null
  if (!nodeId) return { nodeId: null, plan: [] }

  // ⚠️ שליפה בדפים: תקרת 1000 של PostgREST הייתה קוטעת את העץ בשקט, והשרשרת
  // הייתה נעצרת באמצע — האזהרה הייתה מציגה פחות דורות ממה שבאמת ישתנו.
  const { rows } = await fetchAllRows<ApproveChainNode>((from, to) =>
    admin.from('lineage_nodes').select('id, name, parent_id, generation, status').range(from, to))
  return { nodeId, plan: planApproveChain(new Map(rows.map(n => [n.id, n])), nodeId) }
}

// ─────────────────────────────────────────────────────────────────────────────
// תצוגה מקדימה — מה יאושר, לפני שמאשרים.
//
// ⚠️ אישור נרשם מאמת גם את כל אבותיו הממתינים, וזו פעולה רחבה בהרבה ממה
// שהכפתור מרמז. המנהל צריך לראות את הרשימה המלאה, לפי סדר הדורות, *לפני*
// הלחיצה — ולא לגלות בדיעבד שצבע חצי ענף.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const beneficiaryId = request.nextUrl.searchParams.get('beneficiaryId') ?? ''
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { nodeId, plan } = await loadPlan(admin, beneficiaryId)
  return NextResponse.json({
    hasNode: !!nodeId,
    chain: plan,
    // כמה מהם אבות ולא הנרשם עצמו — זה המספר שמפתיע, ולכן הוא מוחזר בנפרד.
    ancestors: plan.filter(s => !s.isSelf).length,
  })
}

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
    invalidateLineageCache()
    return NextResponse.json({ ok: true, updated: 1 })
  }

  // אישור: מאמתים את הצומת של הנרשם וכל שרשרת האבות ה"ממתינים" מעליו עד הצומת
  // המאומת הראשון.
  //
  // ⚠️ אותה planApproveChain שמזינה את התצוגה המקדימה — כדי שמה שהמנהל אישר
  // באזהרה יהיה בדיוק מה שקורה. בעבר זה היה לולאת while נפרדת כאן, ואילו
  // האזהרה הייתה מחשבת לבד, שתי ההגדרות היו נפרדות בתיקון הראשון.
  const { plan } = await loadPlan(admin, beneficiaryId)
  let updated = 0
  if (plan.length) {
    const ids = plan.map(s => s.id)
    const { error } = await admin.from('lineage_nodes').update({ status: 'verified' }).in('id', ids)
    if (!error) updated = ids.length
    else console.error('[approve-lineage] update failed:', error.message)
  }
  if (updated) invalidateLineageCache()

  // ── הילדים שהמשפחה הזינה נכנסים לעץ כמאושרים ──
  // ⚠️ החיסכון האמיתי: היחוס של הילדים *הוא* היחוס של המשפחה שאושרה כעת, ואין
  // סיבה לאשר כל אחד מהם שוב כשיבוא להירשם. משנכנסו לעץ כמאושרים הם מופיעים
  // ברשימת הבחירה, הנרשם בוחר את עצמו במקום ליצור רשומה חדשה, וכשמשפחתו שלו
  // תאושר — גם ילדיו ייכנסו כמאושרים, וכן הלאה.
  // best-effort: כשל כאן לא הופך את האישור עצמו לכושל.
  let children = { created: 0, verified: 0, linked: 0 }
  try {
    children = (await syncChildrenOfBeneficiary(admin, beneficiaryId)) ?? children
    // ⚠️ "ממתינים" ולא "אושרו": הסנכרון אינו מאשר איש. ראו syncApprovedFamilyChildren.
    if (children.created || children.linked) {
      console.log(`[approve-lineage] ${beneficiaryId} → ${children.created} ילדים נוספו לעץ כממתינים, ${children.linked} קושרו לצומת קיים`)
    }
  } catch (e) {
    console.error('[approve-lineage] children sync failed:', e)
  }

  return NextResponse.json({ ok: true, updated, children })
}
