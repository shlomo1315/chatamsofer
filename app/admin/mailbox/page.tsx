export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MailMessage } from '@/types'
import MailboxClient from './MailboxClient'

export default async function MailboxPage() {
  // ללא חיבור Supabase — מציגים מצב ריק
  if (!isSupabaseConfigured()) {
    return <MailboxClient initialMessages={[]} configured={false} />
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // שכבת הגנה: מנהל בלבד
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') redirect('/admin/dashboard')

  const { data } = await supabase
    .from('mail_messages')
    .select('*, attachments:mail_attachments(*)')
    .order('created_at', { ascending: false })
    .limit(300)

  return <MailboxClient initialMessages={(data ?? []) as MailMessage[]} configured />
}
