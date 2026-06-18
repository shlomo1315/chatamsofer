import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { storagePath } from '@/lib/docUrl'

export const dynamic = 'force-dynamic'

// פרוקסי גישה מאומת למסמכים בדלי 'documents'.
// צוות מאומת רואה כל מסמך; מוטב בפורטל רואה רק מסמכים שנתיב האחסון שלהם כולל
// את מזהה המוטב שבסשן שלו. הגישה בפועל נעשית דרך signed URL קצר-מועד (5 דק').
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('p') ?? ''
  const path = storagePath(raw)
  if (!path || path.includes('..')) {
    return NextResponse.json({ error: 'נתיב לא תקין' }, { status: 400 })
  }

  // הרשאה
  let allowed = false
  if (await requireStaff()) {
    allowed = true
  } else {
    const benId = getPortalBeneficiaryId(request)
    if (benId && path.split('/').includes(benId)) allowed = true
  }
  if (!allowed) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await admin.storage.from('documents').createSignedUrl(path, 300)
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 })

  const res = NextResponse.redirect(data.signedUrl)
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
