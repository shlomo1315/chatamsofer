import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'
import { runCampaignSender } from '@/lib/newsletter/sender'

// עצירה / חידוש של קמפיין בשליחה.
// ה-worker בודק את הסטטוס לפני כל batch, ולכן העצירה נכנסת לתוקף מיד.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let payload: { action?: string }
  try { payload = await request.json() } catch { payload = {} }
  const action = payload.action === 'resume' ? 'resume' : 'pause'

  const { data: campaign } = await db.from('campaigns').select('status').eq('id', id).maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 })

  if (action === 'pause') {
    if (campaign.status !== 'sending') {
      return NextResponse.json({ error: 'הקמפיין אינו בשליחה' }, { status: 400 })
    }
    await db.from('campaigns').update({
      status: 'paused',
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'paused' })
  }

  // חידוש
  if (campaign.status !== 'paused') {
    return NextResponse.json({ error: 'הקמפיין אינו מושהה' }, { status: 400 })
  }
  await db.from('campaigns').update({
    status: 'sending',
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  void runCampaignSender().catch(e => console.error('[newsletter] חידוש נכשל:', e))
  return NextResponse.json({ ok: true, status: 'sending' })
}
