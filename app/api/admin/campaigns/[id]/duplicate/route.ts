import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'

// שכפול קמפיין — יוצר טיוטה חדשה עם כל התוכן, הקהל וההגדרות של המקור.
// שימושי לשליחה חוזרת או לקמפיין דומה, בלי לבנות הכל מחדש.
export const dynamic = 'force-dynamic'

export async function POST(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'add')
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: src } = await db
    .from('campaigns')
    .select('name, subject, preheader, from_department, content, content_mode, raw_html, segment, attachments')
    .eq('id', id)
    .maybeSingle()

  if (!src) return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 })

  // הקמפיין החדש נוצר כטיוטה — לא נשלח בטעות.
  // המונים והסטטיסטיקות לא מועתקים (זו שליחה חדשה).
  const { data: copy, error } = await db.from('campaigns').insert({
    name: `${src.name} (עותק)`.slice(0, 120),
    subject: src.subject,
    preheader: src.preheader,
    from_department: src.from_department,
    content: src.content,
    content_mode: src.content_mode,
    raw_html: src.raw_html,
    segment: src.segment,
    attachments: src.attachments,
    status: 'draft',
    created_by: ctx?.userId ?? null,
  }).select('id').single()

  if (error || !copy) {
    console.error('[newsletter] שכפול נכשל:', error?.message)
    return NextResponse.json({ error: 'שכפול נכשל' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: copy.id })
}
