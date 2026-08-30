import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/apiAuth'
import NoPermission from '@/components/ui/NoPermission'
import DistributionForm from '../../DistributionForm'

export default async function EditDistributionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // הטופס עצמו אינו כותב — ה-PATCH כבר אוכף 'edit'. הבדיקה כאן מונעת מסך
  // עריכה שנפתח, נטען, ונופל רק בשמירה.
  if (!(await requirePermission('distributions', 'edit'))) {
    return <NoPermission detail="נדרשת הרשאת עריכה בחלוקות חגים." />
  }
  if (!isSupabaseConfigured()) return <div className="p-8 text-center text-slate-400">הגדר Supabase לצפייה</div>
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('distributions')
    .select('id, name, year, description, amount_per_family, distribution_date, card_expiry, test_mode, test_email')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116' && error.code !== '22P02') throw error
  if (!data) notFound()

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link href={`/admin/distributions/${id}`} className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <h1 className="text-xl font-extrabold text-slate-900">עריכת חלוקת חגים</h1>
      </div>
      <DistributionForm initial={data} />
    </div>
  )
}
