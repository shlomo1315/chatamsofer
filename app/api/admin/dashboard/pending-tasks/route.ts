import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const WIDOW_TYPE_LABELS: Record<string, string> = {
  financial: 'קרן סיוע כספי',
  food:      'סיוע במזון',
  general:   'בקשת עזרה כללית',
}

export async function GET() {
  // הגנת הרשאה מפורשת (defense-in-depth מעבר ל-RLS) — מחזיר PII של בקשות ממתינות
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  try {
    const supabase = await createClient()

    const [beneficiaries, loans, maternity, widows, financial] = await Promise.all([
      supabase.from('beneficiaries')
        .select('id, full_name, family_name, created_at')
        .eq('eligibility_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('loans')
        .select('id, created_at, beneficiary:beneficiary_id(full_name, family_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('maternity_aids')
        .select('id, created_at, beneficiary:beneficiary_id(full_name, family_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('widow_requests')
        .select('id, created_at, request_type, beneficiary:beneficiary_id(full_name, family_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('financial_aid_requests')
        .select('id, created_at, beneficiary:beneficiary_id(full_name, family_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    type Ben = { full_name?: string; family_name?: string } | null

    const tasks = [
      ...(beneficiaries.data ?? []).map(b => ({
        id: b.id, type: 'beneficiary' as const,
        name: [b.family_name, b.full_name].filter(Boolean).join(' ') || 'לא ידוע',
        detail: 'בקשת הצטרפות',
        href: `/admin/beneficiaries/${b.id}`,
        createdAt: b.created_at,
      })),
      ...(loans.data ?? []).map(l => ({
        id: l.id, type: 'loan' as const,
        name: [(l.beneficiary as Ben)?.family_name, (l.beneficiary as Ben)?.full_name].filter(Boolean).join(' ') || 'לא ידוע',
        detail: 'בקשת הלוואה',
        href: `/admin/loans/${l.id}`,
        createdAt: l.created_at,
      })),
      ...(maternity.data ?? []).map(m => ({
        id: m.id, type: 'maternity' as const,
        name: [(m.beneficiary as Ben)?.family_name, (m.beneficiary as Ben)?.full_name].filter(Boolean).join(' ') || 'לא ידוע',
        detail: 'בקשת יולדת',
        href: `/admin/maternity/${m.id}`,
        createdAt: m.created_at,
      })),
      ...(widows.data ?? []).map(w => ({
        id: w.id, type: 'widow' as const,
        name: [(w.beneficiary as Ben)?.family_name, (w.beneficiary as Ben)?.full_name].filter(Boolean).join(' ') || 'לא ידוע',
        detail: WIDOW_TYPE_LABELS[w.request_type] ?? 'בקשת סיוע',
        href: `/admin/widows/${w.id}`,
        createdAt: w.created_at,
      })),
      ...(financial.data ?? []).map(f => ({
        id: f.id, type: 'financial_aid' as const,
        name: [(f.beneficiary as Ben)?.family_name, (f.beneficiary as Ben)?.full_name].filter(Boolean).join(' ') || 'לא ידוע',
        detail: 'סיוע רפואי/כספי',
        href: `/admin/financial-aid/${f.id}`,
        createdAt: f.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({ tasks })
  } catch {
    return NextResponse.json({ tasks: [] }, { status: 500 })
  }
}
