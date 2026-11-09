import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { uploadFileError, uploadExt, ALLOWED_UPLOAD_TYPES } from '@/lib/uploads'

export const dynamic = 'force-dynamic'

// העלאת מסמך למוטב מכרטסת הניהול. נעשית בשרת עם service-role, אחרי בדיקת הרשאה,
// כי העלאה ישירה מהדפדפן נחסמה ב-RLS ("new row violates row-level security policy").
export async function POST(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden()

  const form = await request.formData()
  const file = form.get('file')
  const beneficiaryId = String(form.get('beneficiaryId') ?? '')
  const docType = String(form.get('docType') ?? '')
  if (!(file instanceof File) || !beneficiaryId || !docType) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }
  const bad = uploadFileError(file)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const ext = uploadExt(file.name, file.type)
  const path = `${beneficiaryId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error: upErr } = await admin.storage.from('documents').upload(
    path,
    Buffer.from(await file.arrayBuffer()),
    { contentType: ALLOWED_UPLOAD_TYPES[ext] ?? file.type ?? 'application/octet-stream', upsert: false },
  )
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: pub } = admin.storage.from('documents').getPublicUrl(path)
  const { error: insErr } = await admin.from('documents').insert({
    beneficiary_id: beneficiaryId,
    doc_type: docType,
    file_url: pub.publicUrl,
    file_name: file.name,
  })
  if (insErr) {
    await admin.storage.from('documents').remove([path])
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
