import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// מחיקת נתמך (משפחה) + סנכרון עם עץ הדורות: מוחק גם את צומת העץ המקושר,
// אך רק אם הוא "עלה" (אין לו צאצאים בעץ) — כדי לא ליתם ענפים שלמים.
export async function POST(request: NextRequest) {
  if (!(await requirePermission('beneficiaries', 'delete'))) return forbidden()
  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // צומת העץ המקושר למשפחה
  const { data: ben } = await admin.from('beneficiaries').select('lineage_node_id').eq('id', id).maybeSingle()
  const nodeId = (ben as { lineage_node_id?: string | null } | null)?.lineage_node_id ?? null

  // מחיקת כל הרשומות הקשורות תחילה — מסמכים, לידות, הלוואות, סיוע ואלמנות.
  // חובה: בלי זה מחיקת המשפחה עלולה להיחסם ע"י מפתח זר (אם אין ON DELETE CASCADE),
  // והמחיקה "מצליחה למראית עין" אך המשפחה נשארת רשומה — מזוהה בכניסה ושולחת לה מיילים.
  const relatedTables = ['documents', 'maternity_aids', 'loans', 'financial_aid_requests', 'widow_support_payments', 'widow_requests']
  for (const table of relatedTables) {
    const { error: relErr } = await admin.from(table).delete().eq('beneficiary_id', id)
    // 42P01 = טבלה לא קיימת בסביבה זו — מתעלמים; שגיאה אחרת נרשמת ללוג בלבד
    if (relErr && relErr.code !== '42P01') console.error(`[delete-beneficiary] ${table}:`, relErr.message)
  }

  const { error } = await admin.from('beneficiaries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // מחיקת צומת העץ — רק אם אין לו צאצאים בעץ (עלה), כדי לא ליתם ענפים
  let treeRemoved = false
  if (nodeId) {
    const { count } = await admin.from('lineage_nodes').select('id', { count: 'exact', head: true }).eq('parent_id', nodeId)
    if ((count ?? 0) === 0) {
      const { error: delErr } = await admin.from('lineage_nodes').delete().eq('id', nodeId)
      if (!delErr) treeRemoved = true
    }
  }

  return NextResponse.json({ ok: true, treeRemoved })
}
