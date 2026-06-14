import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClient } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// Allowed document file types (extension + MIME)
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'docx', 'xlsx']
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const { messageId, attachmentId, inlineData, beneficiaryId, docType, filename, mimeType } = await request.json()

  if (!messageId || !beneficiaryId || !docType) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  // Validate file type: only images, PDF, docx and xlsx are allowed
  const fileExt = (filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
  }
  if (mimeType && !ALLOWED_MIME_TYPES.includes(String(mimeType).toLowerCase())) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
  }

  try {
    let buffer: Buffer

    if (inlineData) {
      // Small attachment already embedded inline
      buffer = Buffer.from(inlineData.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    } else {
      // Fetch from Gmail API
      const gmail = await getGmailClient()
      const res = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      })
      const data = res.data.data
      if (!data) return NextResponse.json({ error: 'empty attachment' }, { status: 404 })
      buffer = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    }

    // Upload to Supabase storage
    const supabase = getAdminClient()
    const ext = filename?.split('.').pop() ?? 'bin'
    const storagePath = `${beneficiaryId}/${docType}_${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, { contentType: mimeType ?? 'application/octet-stream', upsert: false })

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(storagePath)

    // Insert document record
    const { error: dbError } = await supabase.from('documents').insert({
      beneficiary_id: beneficiaryId,
      doc_type: docType,
      file_url: publicUrl,
      file_name: filename ?? storagePath,
    })

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
    return NextResponse.json({ ok: true, file_url: publicUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
