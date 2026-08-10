import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { buildUnlinkedRows, type UnlinkedBen, type TreeNode } from '@/lib/unlinkedSuggest'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// נרשמים ללא שיוך לעץ הדורות — הרשימה שההשלמה האוטומטית אינה יכולה לגעת בה.
//
// ⚠️ למה הם נשארים מחוץ להשלמה: ensureBeneficiaryNode תולה צומת חדש *תחת האב*,
// והאב הוא lineage_node_id. בלעדיו אין מקום בעץ, וכל ניחוש היה ממציא ייחוס.
//
// אבל רובם אינם חסרי מידע — בטופס הרישום נשמרה lineage_chain, שרשרת הדורות
// שהנרשם עצמו הזין. כאן מחפשים את הדורות שלה בעץ ומציעים את הצומת העמוק ביותר
// שנמצא, כדי שהמנהל יאשר בלחיצה במקום לחפש כל אחד בכרטסת.
//
// ⚠️ הצעה בלבד. השיוך עצמו נעשה דרך /api/admin/lineage/assign, בלחיצה מפורשת.
// ─────────────────────────────────────────────────────────────────────────────

const COLS = 'id, id_number, full_name, spouse_name, family_name, email, phone, created_at, lineage_chain'

export async function GET() {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const bens = await fetchAllRows<UnlinkedBen>((from, to) =>
    admin.from('beneficiaries').select(COLS).is('lineage_node_id', null).range(from, to))
  if (bens.error) return NextResponse.json({ error: `טעינת הנרשמים נכשלה: ${bens.error}` }, { status: 500 })

  // ⚠️ שליפה מלאה בדפים ולא .in() על מזהים: PostgREST חותך ב-1000 שורות, וכתובת
  // עם מאות UUID נדחית בשקט — ואז כל ההצעות יוצאות ריקות בלי שום שגיאה.
  const nodes = await fetchAllRows<TreeNode>((from, to) =>
    admin.from('lineage_nodes').select('id, name, generation, parent_id').range(from, to))
  if (nodes.error) return NextResponse.json({ error: `טעינת העץ נכשלה: ${nodes.error}` }, { status: 500 })

  const rows = buildUnlinkedRows(bens.rows, nodes.rows)

  // הצעה ודאית קודם, ואחריה העמוקה יותר: זה סדר העבודה בפועל — קודם מסיימים
  // את מה שאפשר בלחיצה, ורק אז יושבים על מה שדורש בירור.
  rows.sort((a, b) => {
    const rank = (r: typeof a) => (r.suggestion ? (r.suggestion.ambiguous ? 1 : 0) : 2)
    return rank(a) - rank(b)
      || (b.suggestion?.matchedGeneration ?? 0) - (a.suggestion?.matchedGeneration ?? 0)
      || a.name.localeCompare(b.name, 'he')
  })

  return NextResponse.json({
    stats: {
      total: rows.length,
      withSuggestion: rows.filter(r => r.suggestion && !r.suggestion.ambiguous).length,
      ambiguous: rows.filter(r => r.suggestion?.ambiguous).length,
      noChain: rows.filter(r => !r.chainLength).length,
      chainNotFound: rows.filter(r => r.chainLength > 0 && !r.suggestion).length,
    },
    rows,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
