import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'

// העלאת תמונה לניוזלטר.
//
// חשוב: התמונה חייבת להיות נגישה בציבור — תוכנת המייל של הנמען טוענת אותה
// ישירות, בלי אימות. לכן היא נשמרת בתיקייה נפרדת שמוגשת דרך /api/newsletter-image
// (הדלי 'documents' פרטי, ו-signed URL פג אחרי שבוע — התמונה הייתה נשברת במייל).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_MB = 5
const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 })
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך — יש להעלות תמונה (JPG/PNG/GIF/WEBP)' }, { status: 400 })
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `הקובץ גדול מדי (מקסימום ${MAX_MB}MB)` }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `newsletter/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await db.storage.from('documents').upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  })

  if (error) {
    console.error('[newsletter/upload] העלאה נכשלה:', error.message)
    return NextResponse.json({ error: 'העלאה נכשלה' }, { status: 500 })
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '')
  // כתובת ציבורית קבועה — לא פגה, ועובדת בכל תוכנת מייל
  const url = `${site}/api/newsletter-image/${encodeURIComponent(path.replace('newsletter/', ''))}`

  return NextResponse.json({ ok: true, url })
}
