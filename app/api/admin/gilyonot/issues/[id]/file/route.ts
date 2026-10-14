import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { loadIssue } from '@/lib/gilyonotSender'

// צפייה בקובץ הגיליון מהמסך — קישור חתום קצר, כי הדלי documents פרטי. לא נספר כהורדה.
export const dynamic = 'force-dynamic'

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('gilyonot', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  const { data } = await db.storage.from('documents').createSignedUrl(issue.file_path, 120)
  if (!data?.signedUrl) return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl, 302)
}
