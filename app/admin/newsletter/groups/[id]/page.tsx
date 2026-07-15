import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import GroupDetail from './GroupDetail'

export const dynamic = 'force-dynamic'

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: group } = await supabase
    .from('contact_lists')
    .select('id, name, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!group) notFound()

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link
        href="/admin/newsletter/groups"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-700"
      >
        <ArrowRight size={16} /> חזרה לקבוצות
      </Link>

      <GroupDetail groupId={group.id} initialName={group.name} />
    </div>
  )
}
