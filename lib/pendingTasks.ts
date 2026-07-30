import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// מקור אמת יחיד ל"ממתינים לטיפול" — גם הכרטיס בדשבורד וגם הפאנל משתמשים בו,
// כדי שלא יהיה פער (הכרטיס הראה 1 והרשימה 4). מחזיר את רשימת המשימות הממתינות
// אחרי סינון מדויק של מה שהוסתר (dismissed_pending_tasks) לפי type:id — לא
// לפי ניכוי-ספירה שגרם לפערים כשהיו שורות dismissed יתומות.
// ─────────────────────────────────────────────────────────────────────────────

const WIDOW_TYPE_LABELS: Record<string, string> = {
  financial: 'קרן סיוע כספי',
  food:      'סיוע במזון',
  general:   'בקשת עזרה כללית',
}

export interface PendingTask {
  id: string
  type: 'beneficiary' | 'loan' | 'maternity' | 'widow' | 'financial_aid'
  name: string
  detail: string
  href: string
  createdAt: string
}

type Ben = { full_name?: string; family_name?: string } | null
const benName = (b: Ben) => [b?.family_name, b?.full_name].filter(Boolean).join(' ') || 'לא ידוע'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPendingTasks(supabase: SupabaseClient<any>): Promise<PendingTask[]> {
  const [beneficiaries, loans, maternity, widows, financial, dismissed] = await Promise.all([
    supabase.from('beneficiaries')
      .select('id, full_name, family_name, created_at')
      .eq('eligibility_status', 'pending')
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('loans')
      .select('id, created_at, beneficiary:beneficiary_id(full_name, family_name)')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    supabase.from('maternity_aids')
      .select('id, created_at, beneficiary:beneficiary_id(full_name, family_name)')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    supabase.from('widow_requests')
      .select('id, created_at, request_type, beneficiary:beneficiary_id(full_name, family_name)')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    supabase.from('financial_aid_requests')
      .select('id, created_at, beneficiary:beneficiary_id(full_name, family_name)')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    supabase.from('dismissed_pending_tasks').select('entity_type, entity_id'),
  ])

  // ─────────────────────────────────────────────────────────────────────────
  // משפחות שכבר טופלו — יורדות מהרשימה.
  //
  // ⚠️ משפחה נכנסת לכאן כשהיא ב-eligibility_status='pending', והיא יוצאת רק
  // אם מישהו נגע בכרטסת שלה במפורש. אבל בפועל מטפלים בה דרך המחלקה: מאשרים
  // לה בקשת לידה במסך היולדות, מטפלים בהלוואה וכו' — ואישור בקשה אינו מקדם
  // את המשפחה (הופרד בכוונה). התוצאה: הרשימה רק גדלה ולעולם לא מתרוקנת.
  //
  // לכן: משפחה שיש לה *ולו בקשה אחת שכבר הוכרעה* (סטטוס שאינו 'pending')
  // נחשבת מטופלת ואינה מוצגת. הנתונים שלה לא משתנים — רק התצוגה.
  // ─────────────────────────────────────────────────────────────────────────
  const pendingBenIds = (beneficiaries.data ?? []).map((b: { id: string }) => b.id)
  const handledBenIds = new Set<string>()
  if (pendingBenIds.length) {
    const decided = await Promise.all([
      supabase.from('loans').select('beneficiary_id').in('beneficiary_id', pendingBenIds).neq('status', 'pending'),
      supabase.from('maternity_aids').select('beneficiary_id').in('beneficiary_id', pendingBenIds).neq('status', 'pending'),
      supabase.from('financial_aid_requests').select('beneficiary_id').in('beneficiary_id', pendingBenIds).neq('status', 'pending'),
      supabase.from('widow_requests').select('beneficiary_id').in('beneficiary_id', pendingBenIds).neq('status', 'pending'),
    ])
    for (const r of decided) {
      for (const row of (r.data ?? []) as { beneficiary_id: string | null }[]) {
        if (row.beneficiary_id) handledBenIds.add(row.beneficiary_id)
      }
    }
  }

  const dismissedSet = new Set(
    (dismissed?.data ?? []).map((d: { entity_type: string; entity_id: string }) => `${d.entity_type}:${d.entity_id}`),
  )

  const tasks: PendingTask[] = [
    ...(beneficiaries.data ?? []).filter(b => !handledBenIds.has(b.id)).map((b): PendingTask => ({
      id: b.id, type: 'beneficiary', name: benName({ full_name: b.full_name, family_name: b.family_name }),
      detail: 'בקשת הצטרפות', href: `/admin/beneficiaries/${b.id}`, createdAt: b.created_at,
    })),
    ...(loans.data ?? []).map((l): PendingTask => ({
      id: l.id, type: 'loan', name: benName(l.beneficiary as Ben),
      detail: 'בקשת הלוואה', href: `/admin/loans/${l.id}`, createdAt: l.created_at,
    })),
    ...(maternity.data ?? []).map((m): PendingTask => ({
      id: m.id, type: 'maternity', name: benName(m.beneficiary as Ben),
      detail: 'בקשת יולדת', href: `/admin/maternity/${m.id}`, createdAt: m.created_at,
    })),
    ...(widows.data ?? []).map((w): PendingTask => ({
      id: w.id, type: 'widow', name: benName(w.beneficiary as Ben),
      detail: WIDOW_TYPE_LABELS[w.request_type] ?? 'בקשת סיוע', href: `/admin/widows/${w.id}`, createdAt: w.created_at,
    })),
    ...(financial.data ?? []).map((f): PendingTask => ({
      id: f.id, type: 'financial_aid', name: benName(f.beneficiary as Ben),
      detail: 'סיוע רפואי/כספי', href: `/admin/financial-aid/${f.id}`, createdAt: f.created_at,
    })),
  ]
    .filter(t => !dismissedSet.has(`${t.type}:${t.id}`))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return tasks
}
