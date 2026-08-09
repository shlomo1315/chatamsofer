import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }

// ─────────────────────────────────────────────────────────────────────────────
// צמתי דור *אחד* בעץ — לבורר "בחר צומת אחר" שבצ'יפי שרשרת הדורות.
//
// ⚠️ למה נוצר: כרטסת הצאצא שלחה את *כל* ~5000 צמתי העץ כ-prop לרכיב הלקוח
// (LineageChainChips) רק כדי שהבורר יוכל לסנן דור אחד — כלומר מאות KB עברו
// סריאליזציה ל-HTML ולפיילואד ב*כל* פתיחת כרטסת, גם כשהמשתמש בטאב אחר לגמרי
// ולא נגע בבורר. הבורר נפתח לעיתים רחוקות; אין סיבה לשלם עליו תמיד.
//
// הבורר צריך שני דורות: הדור הנבחר (`gen`) והדור שמעליו (`gen-1`) לסינון לפי
// הורה. שניהם נשלפים כאן בשאילתה אחת ומוחזרים יחד.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401, headers: NO_STORE })

  const gen = Number(request.nextUrl.searchParams.get('gen'))
  if (!Number.isInteger(gen) || gen < 1) {
    return NextResponse.json({ error: 'gen חסר או אינו מספר דור תקין' }, { status: 400, headers: NO_STORE })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ nodes: [] }, { headers: NO_STORE })

  // דור הבורר + הדור שמעליו (לסינון לפי parent_id). דור אחד מונה עשרות-מאות
  // צמתים — הרבה מתחת לתקרת 1000 של PostgREST, ולכן אין צורך ב-fetchAllRows.
  const { data, error } = await db
    .from('lineage_nodes')
    .select('id, name, generation, parent_id, status, relation')
    .in('generation', gen > 1 ? [gen - 1, gen] : [gen])
    .order('name')

  if (error) {
    console.error('[lineage/generation] load failed:', error)
    return NextResponse.json({ error: 'טעינת הדור נכשלה' }, { status: 500, headers: NO_STORE })
  }

  return NextResponse.json({ nodes: data ?? [] }, { headers: NO_STORE })
}
