import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// שמירת סימוני הצבע הידניים לדורות (מנהל/מזכיר עם הרשאת עריכת צאצאים).
// body: { beneficiaryId, marks: { "<generation>": "red" | "green" | null } }
export async function POST(request: NextRequest) {
  if (!(await requirePermission('beneficiaries', 'edit'))) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { beneficiaryId?: string; marks?: Record<string, unknown> }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.beneficiaryId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  // נרמול — רק ערכים חוקיים (red/green), מפתחות מספריים. null מוחק סימון.
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.marks ?? {})) {
    if (!/^\d+$/.test(k)) continue
    if (v === 'red' || v === 'green') clean[k] = v
  }

  const { error } = await admin.from('beneficiaries')
    .update({ lineage_manual_marks: Object.keys(clean).length ? clean : null })
    .eq('id', body.beneficiaryId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, marks: clean })
}
