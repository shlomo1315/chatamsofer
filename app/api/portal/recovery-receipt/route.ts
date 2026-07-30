import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { portalCookieName } from '../login/route'
import { verifyRecoveryPortalToken } from '@/lib/recoveryPortalAuth'

export const dynamic = 'force-dynamic'

const BUCKET = 'documents'
const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', gif: 'image/gif', pdf: 'application/pdf',
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ─────────────────────────────────────────────────────────────────────────────
// משיכת קובץ מקישור חיצוני שהודבק בפורטל.
//
// 🔒 הגנת SSRF: השרת שלנו מבצע כאן בקשה ליעד שהמשתמש בחר, ולכן מותרים רק
// http/https, וכתובות פנימיות (localhost, טווחים פרטיים, metadata של הענן)
// נחסמות. בנוסף — הפניות אינן נעקבות אוטומטית, יש תקרת גודל ומגבלת זמן.
// ─────────────────────────────────────────────────────────────────────────────
const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i

type FetchedFile = { bytes: ArrayBuffer; ext: string; contentType: string }

async function fetchLinkedFile(link: string): Promise<FetchedFile | { error: string }> {
  let u: URL
  try { u = new URL(link) } catch { return { error: 'הקישור אינו תקין' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { error: 'הקישור חייב להתחיל ב-http או https' }
  }
  if (PRIVATE_HOST.test(u.hostname)) return { error: 'הקישור אינו נתמך' }

  let res: Response
  try {
    res = await fetch(u.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'chasamsofer-portal/1.0' },
    })
  } catch {
    return { error: 'לא ניתן להוריד את הקובץ מהקישור — ודאו שהוא ציבורי ונגיש' }
  }
  if (!res.ok) return { error: `הקישור החזיר שגיאה (${res.status}) — ודאו שהוא ציבורי` }

  const declared = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const bytes = await res.arrayBuffer()
  if (bytes.byteLength === 0) return { error: 'הקובץ בקישור ריק' }
  if (bytes.byteLength > MAX_SIZE) return { error: 'הקובץ גדול מדי (מקסימום 10MB)' }

  // סוג הקובץ — לפי הכותרת, ובנפילה לפי הסיומת שבקישור
  let ext = Object.entries(ALLOWED).find(([, ct]) => ct === declared)?.[0] ?? ''
  if (!ext) ext = (u.pathname.split('.').pop() ?? '').toLowerCase()
  const contentType = ALLOWED[ext]
  if (!contentType) {
    return { error: 'סוג הקובץ בקישור אינו נתמך — נדרשת תמונה או PDF' }
  }
  return { bytes, ext, contentType }
}

// העלאת קובץ הקבלה של בית ההחלמה (קובץ או קישור). מאומת דרך עוגיית הפורטל + בעלות על הרשומה.
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const home = String(form.get('home') ?? '')
  const aidId = String(form.get('aidId') ?? '')
  const file = form.get('file')
  // ⚠️ נציג בית ההחלמה יכול לצרף קובץ *או* להדביק קישור ישיר אליו. הקישור
  // אינו נשמר כמות שהוא: הוא נמשך כאן בשרת ומאוחסן אצלנו, כדי שהקבלה תהיה
  // בכרטסת הלידה ולא תלויה בשרת חיצוני שעלול להימחק או להיחסם.
  const link = String(form.get('link') ?? '').trim()
  if (!home || !aidId || (!(file instanceof File) && !link)) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }

  const cookieStore = await cookies()
  if (!verifyRecoveryPortalToken(cookieStore.get(portalCookieName(home))?.value, home)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  let bytes: ArrayBuffer
  let ext: string
  let contentType: string

  if (file instanceof File) {
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' }, { status: 400 })
    ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const ct = ALLOWED[ext]
    if (!ct) return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
    contentType = ct
    bytes = await file.arrayBuffer()
  } else {
    const fetched = await fetchLinkedFile(link)
    if ('error' in fetched) return NextResponse.json({ error: fetched.error }, { status: 400 })
    bytes = fetched.bytes; ext = fetched.ext; contentType = fetched.contentType
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // אימות בעלות: הרשומה שייכת לבית החלמה זה ואינה נעולה
  const { data: aid } = await admin.from('maternity_aids')
    .select('id, recovery_home, beneficiary_id, recovery_locked').eq('id', aidId).maybeSingle()
  if (!aid || aid.recovery_home !== home) {
    return NextResponse.json({ error: 'הרשומה לא נמצאה בבית החלמה זה' }, { status: 404 })
  }
  if (aid.recovery_locked) return NextResponse.json({ error: 'הרשומה נעולה' }, { status: 403 })

  const path = `${aid.beneficiary_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path)
  const url = urlData.publicUrl

  const { error } = await admin.from('maternity_aids')
    .update({ recovery_receipt_url: url, updated_at: new Date().toISOString() }).eq('id', aidId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, url })
}
