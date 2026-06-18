import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// טעינת מיילים מ-Supabase (החליף את Gmail). תומך בסינון לפי מחלקה ובחיפוש.
export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const folder = request.nextUrl.searchParams.get('folder') ?? 'INBOX'
  // מנטרלים תווים שמורים של מסנן PostgREST .or() ושל תבנית ilike (% _ * , ( ) \ " ')
  // כדי למנוע "פריצה" של המסנן והרצת תנאים נוספים (filter injection)
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().replace(/[,()*%_\\"']/g, ' ').trim()
  const department = request.nextUrl.searchParams.get('department') ?? ''

  const admin = getAdminClient()
  const deptEmail = department && DEPARTMENTS[department as DepartmentKey]?.email

  if (folder === 'SENT') {
    let query = admin.from('sent_emails').select('*').order('sent_at', { ascending: false }).limit(50)
    if (department) query = query.eq('department', department)
    if (q) query = query.or(`subject.ilike.%${q}%,to_email.ilike.%${q}%`)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const messages = (data ?? []).map(m => ({
      id: m.id,
      threadId: m.id,
      subject: m.subject ?? '',
      from: `${m.from_name ?? 'היכל החתם סופר'} <${m.reply_to ?? 'noreply@chasamsofer.info'}>`,
      fromEmail: m.reply_to ?? 'noreply@chasamsofer.info',
      to: m.to_email,
      toEmail: m.to_email,
      snippet: (m.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120),
      date: m.sent_at,
      isRead: true,
      body: m.html ?? '',
      attachments: m.attachments ?? [],
      labelIds: [],
    }))
    return NextResponse.json({ messages })
  }

  // INBOX
  let query = admin.from('inbound_emails').select('*').order('received_at', { ascending: false }).limit(50)
  if (deptEmail) query = query.eq('to_email', deptEmail)
  if (q) query = query.or(`subject.ilike.%${q}%,from_email.ilike.%${q}%,from_name.ilike.%${q}%`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messages = (data ?? []).map(m => ({
    id: m.id,
    threadId: m.id,
    subject: m.subject ?? '',
    from: m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email,
    fromEmail: m.from_email,
    to: m.to_email,
    toEmail: m.to_email,
    snippet: (m.plain_text ?? m.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120),
    date: m.received_at,
    isRead: m.is_read,
    body: m.html ?? m.plain_text ?? '',
    attachments: m.attachments ?? [],
    labelIds: [],
  }))

  return NextResponse.json({ messages })
}
