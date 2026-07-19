import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { applyLabelToExistingMail, type GmailAccount } from '@/lib/legacyMailSync'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// שיוך בדיעבד: מחיל את תווית התיבה על מיילים ישנים שכבר נקלטו (source='legacy'
// באותה מחלקה). שימושי למיילים שנמשכו לפני שהתיבה קיבלה תווית.
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  let accountId: string | null = null
  try { accountId = (await request.json())?.accountId ?? null } catch { /* גוף ריק */ }
  if (!accountId) return NextResponse.json({ error: 'חסר מזהה תיבה' }, { status: 400 })

  const db = admin()
  const { data: acc } = await db
    .from('gmail_accounts')
    .select('id, refresh_token, department, label_id, last_sync_epoch')
    .eq('id', accountId)
    .maybeSingle()
  if (!acc) return NextResponse.json({ error: 'התיבה לא נמצאה' }, { status: 404 })
  if (!acc.label_id) return NextResponse.json({ error: 'לתיבה זו אין תווית מוגדרת' }, { status: 400 })

  const count = await applyLabelToExistingMail(db, acc as GmailAccount)
  return NextResponse.json({ ok: true, labeled: count })
}
