import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { uploadFileError, uploadExt, ALLOWED_UPLOAD_TYPES } from '@/lib/uploads'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

const FIELDS = ['birth_certificate_url', 'birth_certificate_url_2'] as const

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 D1: העלאת אישור לידה מתיק היולדת — בשרת, עם service-role, אחרי בדיקת הרשאה.
//
// ההעלאה נעשתה ישירות מהדפדפן, ולדלי documents אין מדיניות RLS שמתירה
// כתיבה לצוות — ולכן כל ניסיון נכשל ב-"new row violates row-level security
// policy" (התקלה מ-9.11, וגם תעודת הלידה של שיינברגר ב-24.11). אותו דפוס
// כמו /api/admin/beneficiaries/upload-document.
//
// ⚠️ שם הקובץ בנתיב הוא ASCII בלבד: שם עברי ("לידה.pdf") נדחה ע"י האחסון.
//
// aidId + field — מעדכן גם את התיק. בלעדיהם רק מעלה ומחזיר כתובת (טופס העריכה
// כותב את הכתובת בעצמו יחד עם שאר השדות).
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()

  const form = await request.formData()
  const file = form.get('file')
  const beneficiaryId = String(form.get('beneficiaryId') ?? '')
  const aidId = String(form.get('aidId') ?? '')
  const field = String(form.get('field') ?? 'birth_certificate_url') as (typeof FIELDS)[number]
  if (!(file instanceof File) || !/^[\w-]+$/.test(beneficiaryId)) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }
  if (!FIELDS.includes(field)) return NextResponse.json({ error: 'שדה לא תקין' }, { status: 400 })
  const bad = uploadFileError(file)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const ext = uploadExt(file.name, file.type)
  const path = `maternity/${beneficiaryId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error: upErr } = await admin.storage.from('documents').upload(
    path,
    Buffer.from(await file.arrayBuffer()),
    { contentType: ALLOWED_UPLOAD_TYPES[ext] ?? file.type ?? 'application/octet-stream', upsert: false },
  )
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: pub } = admin.storage.from('documents').getPublicUrl(path)

  if (aidId) {
    const { error } = await admin.from('maternity_aids').update({ [field]: pub.publicUrl })
      .eq('id', aidId).eq('beneficiary_id', beneficiaryId)
    if (error) {
      await admin.storage.from('documents').remove([path])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    await logActivity(admin, {
      userId: staff.userId, action: 'maternity_birth_certificate_uploaded',
      entityType: 'maternity_aid', entityId: aidId, details: { field, file_name: file.name },
    })
  }
  return NextResponse.json({ ok: true, url: pub.publicUrl })
}
