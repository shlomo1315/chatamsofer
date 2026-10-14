import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { defaultSubject } from '@/lib/gilyonotMail'

// גיליון חדש: מעלה את הקובץ לדלי הפרטי documents ויוצר טיוטה.
// השליחה עצמה: issues/[id]/send. ההורדה לנמענים: /api/gilyonot/d/<token>.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_MB = 25
const ALLOWED: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}
const str = (v: FormDataEntryValue | null, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function POST(request: Request) {
  const staff = await requirePermission('gilyonot', 'add')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const file = form.get('file')
  const title = str(form.get('title'), 120)
  const parasha = str(form.get('parasha'), 60)
  const intro = str(form.get('intro'), 4000)
  const subject = str(form.get('subject'), 200) || defaultSubject(title, parasha)

  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 })
  const ext = ALLOWED[file.type]
  if (!ext) return NextResponse.json({ error: 'סוג קובץ לא נתמך. אפשר PDF, Word או תמונה.' }, { status: 400 })
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `הקובץ גדול מדי (עד ${MAX_MB}MB)` }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'חסר שם לגיליון' }, { status: 400 })
  if (!parasha) return NextResponse.json({ error: 'חסרה פרשה' }, { status: 400 })

  const id = crypto.randomUUID()
  const path = `gilyonot/${id}/gilyon.${ext}`
  // שם הקובץ שיוצג להורדה: מהשם המקורי, בלי תווים שעלולים לשבור כותרות
  const fileName = (file.name || `gilyon.${ext}`).replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120) || `gilyon.${ext}`

  const { error: upErr } = await db.storage.from('documents')
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
  if (upErr) {
    console.error('[gilyonot] העלאה נכשלה:', upErr.message)
    return NextResponse.json({ error: 'העלאת הקובץ נכשלה' }, { status: 500 })
  }

  const { error } = await db.from('gilyonot_issues').insert({
    id, title, parasha, subject, intro: intro || null,
    file_path: path, file_name: fileName, file_size: file.size, created_by: staff.userId,
  })
  if (error) {
    await db.storage.from('documents').remove([path])
    console.error('[gilyonot] יצירת גיליון נכשלה:', error.message)
    return NextResponse.json({ error: 'שמירת הגיליון נכשלה' }, { status: 500 })
  }
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_issue_create', entityType: 'gilyonot_issue', entityId: id, details: { title, parasha } })
  return NextResponse.json({ ok: true, id })
}
