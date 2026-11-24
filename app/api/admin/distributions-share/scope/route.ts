import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/apiAuth'
import { getHolidaysOnly, setHolidaysOnly } from '@/lib/distributionsShareScope'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET — האם דף השיתוף מציג חלוקות חגים בלבד
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })
  return NextResponse.json({ holidaysOnly: await getHolidaysOnly(adminClient()) })
}

// POST — הפעלה או כיבוי של "חגים בלבד". נכנס לתוקף בטעינה הבאה של הדף.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (typeof body?.holidaysOnly !== 'boolean') {
    return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 })
  }
  try {
    await setHolidaysOnly(adminClient(), body.holidaysOnly)
  } catch {
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, holidaysOnly: body.holidaysOnly })
}
