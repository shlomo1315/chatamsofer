// שמירת הערת פורטל על הלוואה (PUT). טקסט ריק מוחק את ההערה.
import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'
import { normalizePortalNote } from '@/lib/loansPortalNote'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const { id } = await params
  let body: { note?: unknown } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const parsed = normalizePortalNote(body.note)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // ⚠️ רק הלוואות שמוצגות בפורטל (מאושרות/פעילות).
  const { data, error } = await adminClient()
    .from('loans')
    .update({ portal_note: parsed.value, updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['approved', 'active'])
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'ההלוואה לא נמצאה' }, { status: 404 })
  return NextResponse.json({ ok: true, note: parsed.value })
}
