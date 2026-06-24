import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// סיווג פעולה ל-activity_log לקטגוריית בקשה
function categoryOf(action: string): 'maternity' | 'loan' | 'widow' | 'financial_aid' | 'other' {
  if (action.startsWith('maternity')) return 'maternity'
  if (action.startsWith('loan')) return 'loan'
  if (action.startsWith('widow')) return 'widow'
  if (action.startsWith('financial_aid')) return 'financial_aid'
  return 'other'
}

type Item = { kind: 'request' | 'email'; action: string; category: string; entityId: string | null; detail: string; at: string }
type StaffRow = {
  userId: string; name: string; department: string | null; role: string
  requests: number; emails: number
  byCategory: Record<string, number>
  emailsHandled: number; emailsReplied: number
  items: Item[]
}

// דוח פעילות מזכירים — מי טיפל באילו בקשות/מיילים ומתי, בטווח תאריכים. למנהל בלבד.
export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const sp = request.nextUrl.searchParams
  const from = sp.get('from') // ISO date/time
  const to = sp.get('to')
  const MAX_ITEMS = 80 // תקרת פירוט לכל מזכיר

  // מפת משתמשים
  const { data: profiles } = await admin.from('profiles').select('id, full_name, department, role')
  const pMap = new Map<string, { name: string; department: string | null; role: string }>()
  for (const p of profiles ?? []) {
    pMap.set(p.id, { name: p.full_name ?? '(ללא שם)', department: p.department ?? null, role: p.role ?? '' })
  }

  const rows = new Map<string, StaffRow>()
  const ensure = (userId: string): StaffRow => {
    let r = rows.get(userId)
    if (!r) {
      const p = pMap.get(userId)
      r = {
        userId, name: p?.name ?? '(משתמש לא ידוע)', department: p?.department ?? null, role: p?.role ?? '',
        requests: 0, emails: 0, byCategory: {}, emailsHandled: 0, emailsReplied: 0, items: [],
      }
      rows.set(userId, r)
    }
    return r
  }

  // 1. בקשות — מתוך activity_log
  let aq = admin.from('activity_log')
    .select('user_id, action, entity_type, entity_id, details, created_at')
    .not('user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (from) aq = aq.gte('created_at', from)
  if (to) aq = aq.lte('created_at', to)
  const { data: acts } = await aq

  for (const a of acts ?? []) {
    const uid = a.user_id as string
    const r = ensure(uid)
    const action = String(a.action ?? '')
    const cat = categoryOf(action)
    r.requests++
    r.byCategory[cat] = (r.byCategory[cat] ?? 0) + 1
    if (r.items.length < MAX_ITEMS) {
      const det = a.details as Record<string, unknown> | null
      const transition = det && det.from !== undefined ? `${det.from ?? '—'} ← ${det.to ?? '—'}` : ''
      r.items.push({
        kind: 'request', action, category: cat,
        entityId: (a.entity_id as string) ?? null,
        detail: transition, at: a.created_at as string,
      })
    }
  }

  // 2. מיילים — מתוך mail_events (טופל / הושב)
  let mq = admin.from('mail_events')
    .select('user_id, event_type, subject, from_email, created_at')
    .not('user_id', 'is', null)
    .in('event_type', ['handled', 'replied', 'auto_replied'])
    .order('created_at', { ascending: false })
    .limit(5000)
  if (from) mq = mq.gte('created_at', from)
  if (to) mq = mq.lte('created_at', to)
  const { data: mails } = await mq

  for (const m of mails ?? []) {
    const uid = m.user_id as string
    const r = ensure(uid)
    const ev = String(m.event_type ?? '')
    r.emails++
    if (ev === 'handled') r.emailsHandled++
    else r.emailsReplied++
    if (r.items.length < MAX_ITEMS) {
      r.items.push({
        kind: 'email', action: ev, category: 'email', entityId: null,
        detail: [m.from_email, m.subject].filter(Boolean).join(' — ').slice(0, 120),
        at: m.created_at as string,
      })
    }
  }

  const secretaries = [...rows.values()].sort((a, b) => (b.requests + b.emails) - (a.requests + a.emails))
  return NextResponse.json({ from, to, secretaries })
}
