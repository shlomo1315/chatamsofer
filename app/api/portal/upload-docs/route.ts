import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const BUCKET = 'documents'
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const beneficiaryId = formData.get('beneficiary_id') as string | null
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה נתמך' }, { status: 400 })

  // Verify beneficiary exists
  const { data: ben, error: benErr } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status')
    .eq('id', beneficiaryId)
    .maybeSingle()
  if (benErr || !ben) return NextResponse.json({ error: 'נתמך לא נמצא' }, { status: 404 })

  const uploaded: string[] = []
  let lastUrl = ''

  // איסוף כל הקבצים שנשלחו: כל שדה File שאינו 'beneficiary_id'. שם השדה = סוג המסמך.
  // תמיכה לאחור: השדה הגנרי 'file' נשמר כ-'birth_cert' (זרימת אישור לידה).
  const fileEntries: { docType: string; file: File }[] = []
  for (const [key, val] of formData.entries()) {
    if (key === 'beneficiary_id') continue
    if (typeof val === 'string') continue
    const docType = key === 'file' ? 'birth_cert' : key
    fileEntries.push({ docType, file: val as File })
  }

  for (const { docType, file: singleFile } of fileEntries) {
    if (!singleFile || typeof singleFile === 'string') continue
    if (singleFile.size > MAX_SIZE) return NextResponse.json({ error: `הקובץ ${singleFile.name} גדול מ-10MB` }, { status: 400 })

    const ext = singleFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${beneficiaryId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const arrayBuffer = await singleFile.arrayBuffer()

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, arrayBuffer, {
      contentType: singleFile.type,
      upsert: false,
    })
    if (upErr) return NextResponse.json({ error: `שגיאה בהעלאת ${singleFile.name}` }, { status: 500 })

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path)
    lastUrl = urlData.publicUrl

    await admin.from('documents').insert({
      beneficiary_id: beneficiaryId,
      doc_type: docType,
      file_url: urlData.publicUrl,
      file_name: singleFile.name,
    })

    uploaded.push(docType)
  }

  if (uploaded.length === 0) {
    return NextResponse.json({ error: 'לא הועלו קבצים' }, { status: 400 })
  }

  // עדכון סטטוס לאחר העלאת מסמכים:
  // • אם הנתמך השלים בקשת מסמכים (docs_pending) — כל העלאה מעבירה ל"ממתין לאישור מסמכים" (review) + ניקוי הרשימה.
  // • אחרת (אימות זהות ראשוני, העלאת ת.ז) — נכנס ל"השלמת מסמכים" לבדיקת המזכירות.
  const hasIdDoc = uploaded.some(d => d === 'id_husband' || d === 'id_wife' || d === 'id_child')
  let update: Record<string, unknown> | null = null
  if (ben.eligibility_status === 'docs_pending') {
    update = { eligibility_status: 'review', required_docs: '', updated_at: new Date().toISOString() }
  } else if (hasIdDoc) {
    update = { eligibility_status: 'docs_pending', updated_at: new Date().toISOString() }
  }
  if (update) await admin.from('beneficiaries').update(update).eq('id', beneficiaryId)

  return NextResponse.json({ ok: true, uploaded, url: lastUrl })
}
