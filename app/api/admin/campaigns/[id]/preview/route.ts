import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { resolveSegment, type SegmentDef } from '@/lib/newsletter/segments'
import { applyMerge } from '@/lib/newsletter/merge'
import { buildCampaignHtml, type Block } from '@/lib/newsletter/blocks'
import { unsubscribeUrl } from '@/lib/unsubscribe'
import { deliverMail } from '@/lib/sendMail'
import { mailFor, type DepartmentKey } from '@/lib/departments'

// תצוגה מקדימה עם נתונים אמיתיים + שליחת מייל בדיקה.
export const dynamic = 'force-dynamic'

// GET — תצוגה מקדימה: המייל כפי שייראה אצל נמען אמיתי
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: campaign } = await db.from('campaigns').select('*').eq('id', id).maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 })

  // דגימת נמענים אמיתיים מהקהל — כדי לראות את המשתנים ממולאים באמת
  const { recipients, stats } = await resolveSegment(db, (campaign.segment ?? {}) as SegmentDef)

  const index = Math.max(0, Math.min(
    Number(request.nextUrl.searchParams.get('i') ?? 0),
    Math.max(recipients.length - 1, 0),
  ))
  const sample = recipients[index]

  // אין נמענים — מציגים עם ערכי דוגמה
  const data = sample?.mergeData ?? {
    'פנייה': 'שלום וברכה, הרב כהן הי״ו,',
    'שם_משפחה': 'כהן',
    'שם_פרטי': 'משה',
    'שם_מלא': 'כהן משה',
    'עיר': 'בני ברק',
    'מספר_ילדים': '7',
  }

  const unsubUrl = unsubscribeUrl(sample?.email ?? 'demo@example.com', id)
  const merged = { ...data, 'קישור_הסרה': unsubUrl }

  const html = buildCampaignHtml({
    preheader: applyMerge(campaign.preheader ?? '', merged, true),
    blocks: (campaign.content ?? []) as Block[],
    rawHtml: campaign.raw_html ?? undefined,
    mode: campaign.content_mode,
    unsubscribeUrl: unsubUrl,
  })

  return NextResponse.json({
    html: applyMerge(html, merged, true),
    subject: applyMerge(campaign.subject, merged, false),
    sampleEmail: sample?.email ?? null,
    index,
    total: recipients.length,
    stats,
  })
}

// POST — שליחת מייל בדיקה לכתובת שנבחרה
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let payload: { to?: string }
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const to = String(payload.to ?? '').trim()
  if (!to.includes('@')) return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })

  const { data: campaign } = await db.from('campaigns').select('*').eq('id', id).maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 })

  const { recipients } = await resolveSegment(db, (campaign.segment ?? {}) as SegmentDef)

  const data = recipients[0]?.mergeData ?? {
    'פנייה': 'שלום וברכה,',
    'שם_משפחה': 'לדוגמה',
    'שם_פרטי': 'ישראל',
    'שם_מלא': 'ישראל לדוגמה',
    'עיר': 'בני ברק',
    'מספר_ילדים': '5',
  }

  const unsubUrl = unsubscribeUrl(to, id)
  const merged = { ...data, 'קישור_הסרה': unsubUrl }

  const html = buildCampaignHtml({
    preheader: applyMerge(campaign.preheader ?? '', merged, true),
    blocks: (campaign.content ?? []) as Block[],
    rawHtml: campaign.raw_html ?? undefined,
    mode: campaign.content_mode,
    unsubscribeUrl: unsubUrl,
  })

  const dept = mailFor((campaign.from_department as DepartmentKey) ?? 'main')
  const res = await deliverMail(
    to,
    `[בדיקה] ${applyMerge(campaign.subject, merged, false)}`,
    applyMerge(html, merged, true),
    undefined,
    { ...dept, skipLog: true },
  )

  if (!res.ok) return NextResponse.json({ error: res.error ?? 'שליחה נכשלה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
