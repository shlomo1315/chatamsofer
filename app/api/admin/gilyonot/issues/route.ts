import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { gilyonFileName } from '@/lib/gilyonotFileName'
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

  const file2 = form.get('file2')
  const hasFile2 = file2 instanceof File && file2.size > 0
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'בחרו את קובץ הגיליון' }, { status: 400 })
  const ext = ALLOWED[file.type]
  if (!ext) return NextResponse.json({ error: 'סוג קובץ לא נתמך. אפשר PDF, Word או תמונה.' }, { status: 400 })
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `הקובץ גדול מדי (עד ${MAX_MB}MB)` }, { status: 400 })
  const ext2 = hasFile2 ? ALLOWED[file2.type] : undefined
  if (hasFile2 && !ext2) return NextResponse.json({ error: 'קובץ "היכלות": סוג קובץ לא נתמך. אפשר PDF, Word או תמונה.' }, { status: 400 })
  if (hasFile2 && file2.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `קובץ "היכלות" גדול מדי (עד ${MAX_MB}MB)` }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'כתבו שם לגיליון' }, { status: 400 })
  if (!parasha) return NextResponse.json({ error: 'כתבו את שם הפרשה' }, { status: 400 })

  const id = crypto.randomUUID()
  const path = `gilyonot/${id}/gilyon.${ext}`
  // שם הקובץ שיוצג להורדה: מהשם המקורי, בלי תווים שעלולים לשבור כותרות
  const fileName = gilyonFileName({ title, parasha }, file.name || `gilyon.${ext}`)

  const { error: upErr } = await db.storage.from('documents')
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
  if (upErr) {
    console.error('[gilyonot] העלאה נכשלה:', upErr.message)
    return NextResponse.json({ error: 'העלאת הקובץ נכשלה' }, { status: 500 })
  }

  const path2 = hasFile2 ? `gilyonot/${id}/heichalot.${ext2}` : null
  if (hasFile2 && path2) {
    const { error: up2 } = await db.storage.from('documents')
      .upload(path2, Buffer.from(await file2.arrayBuffer()), { contentType: file2.type, upsert: false })
    if (up2) {
      await db.storage.from('documents').remove([path])
      console.error('[gilyonot] העלאת היכלות נכשלה:', up2.message)
      return NextResponse.json({ error: 'העלאת קובץ "היכלות" נכשלה' }, { status: 500 })
    }
  }

  const { error } = await db.from('gilyonot_issues').insert({
    id, title, parasha, subject, intro: intro || null,
    file_path: path, file_name: fileName, file_size: file.size, created_by: staff.userId,
    ...(hasFile2 ? { file2_path: path2, file2_name: `היכלות.${ext2}`, file2_size: file2.size } : {}),
  })
  if (error) {
    await db.storage.from('documents').remove([path, ...(path2 ? [path2] : [])])
    console.error('[gilyonot] יצירת גיליון נכשלה:', error.message)
    return NextResponse.json({ error: 'שמירת הגיליון נכשלה' }, { status: 500 })
  }
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_issue_create', entityType: 'gilyonot_issue', entityId: id, details: { title, parasha } })
  return NextResponse.json({ ok: true, id })
}
