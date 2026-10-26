import { NextResponse } from 'next/server'
import { attachmentDisposition, gilyonFileName } from '@/lib/gilyonotFileName'
import { getServiceClient } from '@/lib/apiAuth'

// קישור ההורדה שבמייל. רושם הורדה לנמען (וגם פתיחה, אם הפיקסל נחסם),
// ומגיש את הקובץ מהדלי הפרטי documents (גיליונות ישנים שנשלחו כקישור).
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function notFound() {
  return new NextResponse(
    '<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>הקובץ לא נמצא</title></head>'
    + '<body style="font-family:Arial,sans-serif;background:#f8fafc;text-align:center;padding:60px 20px;color:#334155;"><h1 style="color:#2563eb;font-size:20px;">הקובץ לא נמצא</h1><p>ייתכן שהקישור ישן. אפשר לפנות אלינו ונשלח את הגיליון שוב.</p></body></html>',
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(_r: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!UUID_RE.test(token)) return notFound()
  const db = getServiceClient()
  if (!db) return notFound()

  const { data: issueId, error } = await db.rpc('gilyonot_track', { p_token: token, p_kind: 'download' })
  if (error || !issueId) return notFound()

  const { data: issue } = await db.from('gilyonot_issues').select('file_path, file_name, title, parasha').eq('id', issueId as string).maybeSingle()
  if (!issue?.file_path) return notFound()

  // הקובץ מוגש מכאן ולא בהפניה לקישור חתום: שם עברי בפרמטר ההורדה של האחסון יוצא מקודד (%D7...).
  const { data: file } = await db.storage.from('documents').download(issue.file_path as string)
  if (!file) return notFound()
  const name = gilyonFileName(issue as { title: string; parasha: string }, issue.file_name as string)
  return new NextResponse(file.stream(), {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Disposition': attachmentDisposition(name),
      'Cache-Control': 'private, no-store',
    },
  })
}
