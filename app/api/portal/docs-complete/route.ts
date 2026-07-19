import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { maybeMarkDocsReturned } from '@/lib/docsReturnCheck'

export const dynamic = 'force-dynamic'

// מעגל תיקונים: כשכל המסמכים הנדרשים כבר קיימים במערכת, הפורטל לא מעלה כלום —
// ה-endpoint הזה מריץ את בדיקת ההשלמה בצד שרת (אחרת הצאצא נתקע ב-docs_pending).
export async function POST(request: NextRequest) {
  if (!rateLimit(`docs-complete:${clientIp(request)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  let body: { beneficiary_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const beneficiaryId = body.beneficiary_id
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה צאצא' }, { status: 400 })

  // אימות בעלות: רק בעל הסשן בפורטל רשאי לפעול על התיק שלו (מניעת IDOR)
  const sessionBeneficiaryId = getPortalBeneficiaryId(request)
  if (!sessionBeneficiaryId || sessionBeneficiaryId !== beneficiaryId) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const returned = await maybeMarkDocsReturned(admin, beneficiaryId)
  return NextResponse.json({ ok: true, returned })
}
