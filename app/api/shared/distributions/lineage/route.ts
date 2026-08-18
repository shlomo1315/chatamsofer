import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPortalToken, DIST_PORTAL_COOKIE } from '@/lib/distributionsPortalAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// עץ הדורות לדף השיתוף — מסלול נפרד, נטען לפי דרישה.
//
// 🔴 למה הופרד: הצמתים נשלפו בתוך המסלול הראשי, שרץ בכל טעינה *וכל 10
// שניות* ברענון האוטומטי. אלפי שורות עברו ברשת כל 10 שניות גם כשאיש לא
// הסתכל על העץ — וזו הייתה סיבת האיטיות של הדף כולו, לא רק של העץ.
//
// ⚠️ אותו אימות בדיוק כמו המסלול הראשי: הפרדת מסלול אינה אמורה לפתוח דלת
// עוקפת לנתונים.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.cookies.get(DIST_PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { rows } = await fetchAllRows<unknown>((from, to) => admin
    .from('lineage_nodes')
    .select('id, name, parent_id, generation, status')
    .order('id')
    .range(from, to))

  // ⚠️ מטמון קצר: העץ אינו משתנה בתדירות גבוהה, וחזרה למחלקה לא צריכה
  // לשלוף אותו מחדש.
  return NextResponse.json({ lineageNodes: rows }, {
    headers: { 'Cache-Control': 'private, max-age=120' },
  })
}
