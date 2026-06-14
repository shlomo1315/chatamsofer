import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
const BUCKET = 'documents'
const KEY = 'email_doc_templates'
const MAX_SIZE = 15 * 1024 * 1024

export interface EmailDocTemplate {
  id: string
  name: string
  file_url: string
  file_name: string
  mime_type: string
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function readList(admin: ReturnType<typeof getAdminClient>): Promise<EmailDocTemplate[]> {
  const { data } = await admin!.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  if (data?.value) { try { const p = JSON.parse(data.value); if (Array.isArray(p)) return p } catch { /* */ } }
  return []
}
async function writeList(admin: ReturnType<typeof getAdminClient>, list: EmailDocTemplate[]) {
  await admin!.from('app_settings').upsert({ key: KEY, value: JSON.stringify(list), updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ templates: [] })
  return NextResponse.json({ templates: await readList(admin) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let fd: FormData
  try { fd = await request.formData() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const name = (fd.get('name') as string | null)?.trim()
  const file = fd.get('file') as File | null
  if (!name) return NextResponse.json({ error: 'יש להזין שם לטמפלט' }, { status: 400 })
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'יש לצרף קובץ' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'הקובץ גדול מ-15MB' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const path = `email-templates/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: `שגיאה בהעלאה: ${upErr.message}` }, { status: 500 })
  const fileUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const list = await readList(admin)
  const item: EmailDocTemplate = { id: crypto.randomUUID(), name, file_url: fileUrl, file_name: file.name, mime_type: file.type || 'application/octet-stream' }
  list.push(item)
  await writeList(admin, list)
  return NextResponse.json({ ok: true, template: item })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
  const list = await readList(admin)
  await writeList(admin, list.filter(t => t.id !== id))
  return NextResponse.json({ ok: true })
}
