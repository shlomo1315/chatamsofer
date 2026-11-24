import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/apiAuth'
import { getHolidaysOnly, setHolidaysOnly, getClosesAt, setClosesAt, parseClosesAt } from '@/lib/distributionsShareScope'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET — האם דף השיתוף מציג חלוקות חגים בלבד, ומועד הסגירה לשעון העצר
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })
  const admin = adminClient()
  const [holidaysOnly, closesAt] = await Promise.all([getHolidaysOnly(admin), getClosesAt(admin)])
  return NextResponse.json({ holidaysOnly, closesAt })
}

// POST — { holidaysOnly?: boolean, closesAt?: string | null }. נכנס לתוקף בטעינה הבאה של הדף.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const hasScope = typeof body?.holidaysOnly === 'boolean'
  const hasClose = body != null && 'closesAt' in body
  if (!hasScope && !hasClose) return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 })

  const closesAt = hasClose ? parseClosesAt(body.closesAt) : null
  if (hasClose && body.closesAt && !closesAt) {
    return NextResponse.json({ error: 'מועד לא תקין' }, { status: 400 })
  }
  try {
    const admin = adminClient()
    if (hasScope) await setHolidaysOnly(admin, body.holidaysOnly)
    if (hasClose) await setClosesAt(admin, closesAt)
  } catch {
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, closesAt })
}
