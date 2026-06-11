import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

type Tone = 'pending' | 'progress' | 'approved' | 'rejected'
interface MyRequest { id: string; kind: string; kindLabel: string; statusLabel: string; tone: Tone; amount: number | null; created_at: string }

const LOAN: Record<string, [string, Tone]> = {
  pending: ['ממתינה לאישור', 'pending'], approved: ['אושרה', 'approved'], active: ['פעילה', 'approved'],
  completed: ['הושלמה', 'approved'], rejected: ['נדחתה', 'rejected'], defaulted: ['בפיגור', 'rejected'],
}
const MATERNITY: Record<string, [string, Tone]> = {
  pending: ['ממתינה לאישור', 'pending'], active: ['אושרה', 'approved'], completed: ['הושלמה', 'approved'], cancelled: ['בוטלה', 'rejected'],
}
const FINAID: Record<string, [string, Tone]> = {
  pending: ['ממתינה לטיפול', 'pending'], awaiting_decision: ['בבדיקת הגורם המאשר', 'progress'], approved: ['אושרה', 'approved'], rejected: ['נדחתה', 'rejected'],
}
const WIDOW: Record<string, [string, Tone]> = {
  pending: ['ממתינה לטיפול', 'pending'], in_progress: ['בטיפול', 'progress'], approved: ['אושרה', 'approved'], rejected: ['נדחתה', 'rejected'],
}
const fb = (m: Record<string, [string, Tone]>, s: string): [string, Tone] => m[s] ?? [s, 'pending']

export async function GET(request: NextRequest) {
  const beneficiaryId = new URL(request.url).searchParams.get('beneficiary_id')
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ requests: [] })

  const [loans, maternity, finaid, widow] = await Promise.all([
    admin.from('loans').select('id, status, amount, created_at').eq('beneficiary_id', beneficiaryId),
    admin.from('maternity_aids').select('id, status, created_at').eq('beneficiary_id', beneficiaryId),
    admin.from('financial_aid_requests').select('id, status, amount, created_at').eq('beneficiary_id', beneficiaryId),
    admin.from('widow_requests').select('id, status, amount, created_at').eq('beneficiary_id', beneficiaryId),
  ])

  const out: MyRequest[] = []
  for (const l of loans.data ?? []) { const [statusLabel, tone] = fb(LOAN, l.status); out.push({ id: l.id, kind: 'loan', kindLabel: 'בקשת הלוואה', statusLabel, tone, amount: l.amount ?? null, created_at: l.created_at }) }
  for (const m of maternity.data ?? []) { const [statusLabel, tone] = fb(MATERNITY, m.status); out.push({ id: m.id, kind: 'maternity', kindLabel: 'בקשת הבראה ליולדת', statusLabel, tone, amount: null, created_at: m.created_at }) }
  for (const f of finaid.data ?? []) { const [statusLabel, tone] = fb(FINAID, f.status); out.push({ id: f.id, kind: 'financial_aid', kindLabel: 'בקשת סיוע כספי', statusLabel, tone, amount: f.status === 'approved' ? (f.amount ?? null) : null, created_at: f.created_at }) }
  for (const w of widow.data ?? []) { const [statusLabel, tone] = fb(WIDOW, w.status); out.push({ id: w.id, kind: 'widow', kindLabel: 'בקשת סיוע', statusLabel, tone, amount: w.amount ?? null, created_at: w.created_at }) }

  out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return NextResponse.json({ requests: out }, { headers: { 'Cache-Control': 'no-store' } })
}
