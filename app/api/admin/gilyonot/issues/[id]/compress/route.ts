import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { loadIssue, fitsInMail } from '@/lib/gilyonotSender'
import { compressFile, MIME_BY_EXT } from '@/lib/gilyonotCompress'

// כיווץ קובץ הגיליון בלי פגיעה באיכות. שתי הגרסאות נשמרות עד שבוחרים:
//   try    – מכווץ את המקור ושומר ליד המקור (compressed.<סיומת>), בלי להחליף כלום
//   use    – הגיליון עובר להשתמש בגרסה המכווצת
//   revert – חוזרים למקור
// המקור (gilyon.<סיומת>) לא נמחק לעולם עד מחיקת הטיוטה.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  if (issue.status !== 'draft') return NextResponse.json({ error: 'אפשר לכווץ רק טיוטה' }, { status: 409 })

  const { action } = await request.json().catch(() => ({})) as { action?: string }
  const dir = issue.file_path.replace(/\/[^/]+$/, '')
  const ext = issue.file_path.split('.').pop() ?? ''
  const original = `${dir}/gilyon.${ext}`
  const compressed = `${dir}/compressed.${ext}`
  const bucket = db.storage.from('documents')

  async function size(path: string): Promise<number | null> {
    const { data } = await bucket.download(path)
    return data ? data.size : null
  }

  if (action === 'try') {
    const { data, error } = await bucket.download(original)
    if (error || !data) return NextResponse.json({ error: 'הקובץ המקורי לא נמצא' }, { status: 404 })
    const mime = MIME_BY_EXT[ext]
    if (!mime) return NextResponse.json({ error: 'סוג הקובץ לא נתמך לכיווץ' }, { status: 400 })
    const r = await compressFile(Buffer.from(await data.arrayBuffer()), mime)
    // חיסכון זניח – כותבים ולא שומרים גרסה חדשה
    if (!r.worthIt) return NextResponse.json({ ok: true, before: r.before, after: r.after, savedPct: r.savedPct, worthIt: false, fits: fitsInMail(r.before) })
    const { error: upErr } = await bucket.upload(compressed, r.buffer, { contentType: mime, upsert: true })
    if (upErr) return NextResponse.json({ error: 'שמירת הגרסה המכווצת נכשלה' }, { status: 500 })
    return NextResponse.json({ ok: true, before: r.before, after: r.after, savedPct: r.savedPct, worthIt: true, fits: fitsInMail(r.after) })
  }

  if (action === 'use' || action === 'revert') {
    const target = action === 'use' ? compressed : original
    const bytes = await size(target)
    if (bytes == null) return NextResponse.json({ error: action === 'use' ? 'אין גרסה מכווצת. כווץ קודם.' : 'הקובץ המקורי לא נמצא' }, { status: 404 })
    const { error } = await db.from('gilyonot_issues')
      .update({ file_path: target, file_size: bytes, updated_at: new Date().toISOString() }).eq('id', issue.id).eq('status', 'draft')
    if (error) return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
    return NextResponse.json({ ok: true, size: bytes, fits: fitsInMail(bytes) })
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
}
