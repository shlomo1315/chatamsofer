import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { invalidateLineageCache } from '@/lib/lineageSync'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אישור "חוליה חוסמת" בעץ הדורות.
//
// 🔴 מה זו חוליה חוסמת: צומת שסטטוסו אינו 'verified' אך *ילדיו* מאומתים.
// בורר הדורות יורד מהשורש ומדלג על צומת לא-מאומת, ולכן כל תת-העץ שמתחתיו
// בלתי נגיש — המשפחה אינה מוצאת את עצמה והבורר נעצר באמצע.
//
// ⚠️ מאשר צומת *אחד* בלבד, ובכוונה. approve-lineage הקיים מאמת שרשרת אבות
// שלמה — פעולה רחבה שנכונה לאישור נרשם, אך כאן היא הייתה צובעת ענפים שלא
// נבדקו. כאן מתקנים חוליה בודדת שנשכחה.
//
// 🔒 נדרשת הרשאת עריכת עץ. הפעולה מתועדת ביומן.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  let body: { nodeId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const nodeId = String(body.nodeId ?? '').trim()
  if (!nodeId) return NextResponse.json({ error: 'חסר מזהה צומת' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: node } = await admin
    .from('lineage_nodes')
    .select('id, name, status, parent_id, generation')
    .eq('id', nodeId)
    .maybeSingle()
  if (!node) return NextResponse.json({ error: 'הצומת לא נמצא' }, { status: 404 })
  if ((node.status ?? '') === 'verified') {
    return NextResponse.json({ ok: true, alreadyVerified: true })
  }

  // 🔴 התנאי שמצדיק את האישור: לצומת יש ילד מאומת.
  //
  // ⚠️ בלי הבדיקה הזו הנתיב היה הופך ל"אשר כל צומת שתרצה" — עקיפה של
  // תהליך האישור הרגיל דרך כלי שנועד לתקן תקלת נתונים בלבד. אי אפשר לאשר
  // ילד בלי שההורה קיים, ולכן ילד מאומת הוא העדות שההורה כבר הוכר בפועל
  // ורק סטטוסו לא עודכן.
  const { count } = await admin
    .from('lineage_nodes')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', nodeId)
    .eq('status', 'verified')
  if (!count) {
    return NextResponse.json(
      { error: 'לצומת אין ילדים מאומתים — אישור כאן שמור לחוליות שחוסמות מסלול קיים' },
      { status: 400 })
  }

  const { error } = await admin
    .from('lineage_nodes')
    .update({ status: 'verified' })
    .eq('id', nodeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  invalidateLineageCache()

  try {
    await admin.from('activity_log').insert({
      user_id: staff.userId,
      action: 'lineage_blocked_link_approved',
      entity_type: 'lineage_node',
      entity_id: nodeId,
      details: { name: node.name, generation: node.generation, verifiedChildren: count },
    })
  } catch { /* תיעוד בלבד — לא חוסם */ }

  return NextResponse.json({ ok: true, name: node.name, unblockedChildren: count })
}
