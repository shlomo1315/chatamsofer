import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

const ACTION_LABELS: Record<string, string> = {
  yemot_card_registered: 'כרטיס נדרים חובר בהצלחה',
  yemot_card_already_set: 'כרטיס כבר רשום — בקשת עדכון',
  yemot_no_active_birth: 'אין לידה פעילה',
  yemot_phone_not_found: 'טלפון לא מזוהה',
  yemot_error: 'שגיאה בשיוך הכרטיס',
}

// היסטוריית פעילות טלפון (שלוחת ימות) עבור צאצא מסוים.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403, headers: NO_STORE })
  const { id } = await params
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })

  // פעולות ימות המקושרות לצאצא — דרך entity_id (beneficiary) או details.beneficiary_id (maternity_aid)
  const { data, error } = await admin
    .from('activity_log')
    .select('id, action, entity_type, entity_id, details, created_at')
    .like('action', 'yemot_%')
    .or(`entity_id.eq.${id},details->>beneficiary_id.eq.${id}`)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE })

  const rows = (data ?? []).map((r) => {
    const d = (r.details ?? {}) as Record<string, unknown>
    return {
      id: r.id,
      action: r.action,
      actionLabel: ACTION_LABELS[r.action] ?? r.action,
      ok: r.action === 'yemot_card_registered',
      isError: r.action === 'yemot_error',
      caller: (d.caller as string) ?? null,
      callId: (d.callId as string) ?? null,
      cardLast4: (d.card_number_last4 as string) ?? null,
      center: (d.center as string) ?? null,
      centerStockAfter: (d.center_stock_after as number) ?? null,
      nedarimId: (d.nedarim_id as string) ?? null,
      errorMsg: (d.error as string) ?? null,
      note: (d.note as string) ?? null,
      createdAt: r.created_at,
    }
  })

  return NextResponse.json({ rows }, { headers: NO_STORE })
}
