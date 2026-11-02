import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { buildFixHistory } from '@/lib/docsFixHistory'
import { getDocTypes } from '@/lib/serverDocTypes'
import { docTypeLabel } from '@/lib/docTypes'

export const dynamic = 'force-dynamic'

// היסטוריית תיקונים של תיק לידה: אילו מסמכים התבקשו ומתי כל אחד הושלם. קריאה בלבד.
export async function GET(request: NextRequest) {
  const staff = await requirePermission('maternity', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const aidId = request.nextUrl.searchParams.get('aidId') ?? ''
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק לידה' }, { status: 400 })

  const { data: aid } = await db.from('maternity_aids').select('beneficiary_id').eq('id', aidId).maybeSingle()
  if (!aid?.beneficiary_id) return NextResponse.json({ error: 'תיק הלידה לא נמצא' }, { status: 404 })

  const [reqs, docs, types] = await Promise.all([
    db.from('docs_fix_requests').select('required_docs, docs_notes, requested_by_name, created_at').eq('beneficiary_id', aid.beneficiary_id),
    db.from('documents').select('doc_type, uploaded_at').eq('beneficiary_id', aid.beneficiary_id),
    getDocTypes(),
  ])
  if (reqs.error || docs.error) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const history = buildFixHistory(reqs.data ?? [], docs.data ?? []).map(h => ({
    ...h,
    items: h.items.map(i => ({ ...i, label: docTypeLabel(i.docType, types) })),
  }))
  return NextResponse.json({ history })
}
