import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

const ACTION_LABELS: Record<string, string> = {
  yemot_card_registered:  'כרטיס נרשם בהצלחה',
  yemot_card_already_set: 'כרטיס כבר רשום — בקשת עדכון',
  yemot_no_active_birth:  'אין לידה פעילה',
  yemot_phone_not_found:  'טלפון לא מזוהה',
  yemot_error:            'שגיאה',
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '100'), 200)

  const admin = adminClient()
  const { data, error } = await admin
    .from('activity_log')
    .select('id, action, entity_type, entity_id, details, created_at')
    .like('action', 'yemot_%')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    actionLabel: ACTION_LABELS[r.action] ?? r.action,
    ok: r.action === 'yemot_card_registered',
    caller: (r.details as Record<string, string>)?.caller ?? '—',
    callId: (r.details as Record<string, string>)?.callId ?? '',
    cardLast4: (r.details as Record<string, string>)?.card_number_last4 ?? null,
    errorMsg: (r.details as Record<string, string>)?.error ?? null,
    entityId: r.entity_id ?? null,
    createdAt: r.created_at,
  }))

  return NextResponse.json({ rows })
}
