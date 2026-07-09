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

// העלאת קובץ הקבלה של בית ההחלמה. מאומת דרך עוגיית הפורטל + בעלות על הרשומה.
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const home = String(form.get('home') ?? '')
  const aidId = String(form.get('aidId') ?? '')
  const file = form.get('file')
  if (!home || !aidId || !(file instanceof File)) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }

  const cookieStore = await cookies()
  if (!verifyRecoveryPortalToken(cookieStore.get(portalCookieName(home))?.value, home)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' }, { status: 400 })
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const contentType = ALLOWED[ext]
  if (!contentType) return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })

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
  const buf = await file.arrayBuffer()
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, { contentType, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path)
  const url = urlData.publicUrl

  const { error } = await admin.from('maternity_aids')
    .update({ recovery_receipt_url: url, updated_at: new Date().toISOString() }).eq('id', aidId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, url })
}
