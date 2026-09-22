import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// העלאה ומחיקה של תמונת כריכה.
//
// ⚠️ הבקט ציבורי (רק עטיפות ספרים, בלי מידע אישי), אבל ההעלאה עוברת
// דרך נתיב מוגן: בלי זה כל אחד יכול להעלות קבצים לאחסון שלנו.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BUCKET = 'book-fair-images'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'לא התקבל קובץ' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'התמונה גדולה מדי (מעל 5MB)' }, { status: 400 })
  }
  // ⚠️ בדיקת סוג בשרת ולא רק ב-accept של הטופס: הטופס ניתן לעקיפה.
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'יש להעלות תמונה בפורמט JPG, PNG, WEBP או GIF' }, { status: 400 })
  }

  const { data: book } = await db.from('book_fair_books')
    .select('id, sku, image_path').eq('id', id).maybeSingle()
  if (!book) return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 })

  // ⚠️ שם קובץ ייחודי לכל העלאה, ולא שם קבוע לפי מזהה הספר: שם קבוע
  // נשמר במטמון הדפדפן וב-CDN, והחלפת תמונה הייתה מציגה את הישנה
  // לנצח — בלי שום סימן שמשהו לא עבד.
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: upErr } = await db.storage.from(BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })

  if (upErr) {
    console.error('[book-fair/image] upload failed:', upErr)
    return NextResponse.json({ error: 'העלאת התמונה נכשלה' }, { status: 500 })
  }

  const { error: dbErr } = await db.from('book_fair_books')
    .update({ image_path: path }).eq('id', id)

  if (dbErr) {
    // ⚠️ ניקוי הקובץ שהועלה: אחרת נשאר קובץ יתום שאיש לא יודע עליו.
    await db.storage.from(BUCKET).remove([path]).then(undefined, () => {})
    console.error('[book-fair/image] db update failed:', dbErr)
    return NextResponse.json({ error: 'שמירת התמונה נכשלה' }, { status: 500 })
  }

  // מחיקת הקודמת — best-effort, אחרי שהחדשה כבר נשמרה בהצלחה
  if (book.image_path) {
    await db.storage.from(BUCKET).remove([book.image_path]).then(undefined, () => {})
  }

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path)

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'book_fair_book',
    entityId: id, details: { image: true, sku: book.sku },
  })

  return NextResponse.json({ ok: true, image_path: path, url: publicUrl })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params
  const { data: book } = await db.from('book_fair_books')
    .select('image_path').eq('id', id).maybeSingle()
  if (!book) return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 })

  await db.from('book_fair_books').update({ image_path: null }).eq('id', id)
  if (book.image_path) {
    await db.storage.from(BUCKET).remove([book.image_path]).then(undefined, () => {})
  }

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'book_fair_book',
    entityId: id, details: { image_removed: true },
  })

  return NextResponse.json({ ok: true })
}
