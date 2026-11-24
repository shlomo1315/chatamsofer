import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { loadCampaignReport } from '@/lib/newsletter/reportData'

// דוח קמפיין מלא: מדדים, גרפי זמן, מכשירים, קישורים, נמענים ותגובות.
export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let loaded
  try {
    loaded = await loadCampaignReport(db, id)
  } catch (e) {
    console.error('[newsletter] טעינת דוח נכשלה:', e)
    return NextResponse.json({ error: 'טעינת הדוח נכשלה' }, { status: 500 })
  }
  if (!loaded) return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 })

  // תגובות שהתקבלו לקמפיין (נמענים שהשיבו למייל)
  const { data: replies } = await db
    .from('inbound_emails')
    .select('id, from_email, from_name, subject, plain_text, received_at')
    .eq('campaign_id', id)
    .order('received_at', { ascending: false })
    .limit(100)

  return NextResponse.json({
    campaign: loaded.campaign,
    ...loaded.report,
    replies: (replies ?? []).map(r => ({
      id: r.id,
      from: r.from_name || r.from_email,
      email: r.from_email,
      subject: r.subject,
      text: String(r.plain_text ?? '').slice(0, 300),
      at: r.received_at,
    })),
  })
}
