import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPortalToken, DIST_PORTAL_COOKIE } from '@/lib/distributionsPortalAuth'
import { parseRegIds } from '@/lib/sharedBoardFetch'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// פרטי המשפחה לעמוד אחד בטבלת הנרשמים בדף השיתוף (?ids=a,b,c — עד REG_PAGE_SIZE).
//
// 🔴 24.11.2026: המסלול הראשי שלח את כל פרטי המשפחה של כל הנרשמים, והדף לא
// נטען בזמן דרך הסינון בטלפון. עכשיו הראשי שולח רק את השדות שהסיכומים
// צריכים, והטבלה מבקשת כאן את הפרטים של העמוד המוצג בלבד.
// ⚠️ אותו אימות בדיוק כמו המסלול הראשי.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.cookies.get(DIST_PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }
  const ids = parseRegIds(req.nextUrl.searchParams.get('ids'))
  if (!ids.length) return NextResponse.json({ details: [] }, { headers: { 'Cache-Control': 'no-store' } })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await admin
    .from('distribution_recipients')
    .select('id, phone, beneficiary:beneficiaries(full_name, family_name, spouse_name, phone, phone2, address)')
    .in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ details: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
