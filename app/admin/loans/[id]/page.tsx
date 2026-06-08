import Link from 'next/link'
import { ArrowRight, CreditCard, FileText, Edit } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Loan } from '@/types'
import Card from '@/components/ui/Card'
import { LoanStatusControl, DeleteLoanButton } from '../LoanControls'
import BackButton from '@/components/ui/BackButton'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

async function getLoan(id: string): Promise<Loan | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('loans')
      .select('*, beneficiary:beneficiaries(full_name, family_name, spouse_name, id_number, phone)')
      .eq('id', id)
      .single()
    return data
  } catch {
    return null
  }
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'
const fmtCur = (n: number) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loan = await getLoan(id)

  if (!loan && isSupabaseConfigured()) notFound()

  if (!loan) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/admin/loans" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
          <h1 className="text-xl font-bold">פרטי הלוואה</h1>
        </div>
        <div className="bg-white rounded-xl border p-8 text-center text-slate-400">הגדר Supabase לצפייה</div>
      </div>
    )
  }

  const b = loan.beneficiary as { full_name?: string; family_name?: string; spouse_name?: string; id_number?: string; phone?: string } | undefined
  // הלווה = הבעל (full_name); אם אין בעל, האישה (spouse_name)
  const borrower = b ? ([b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ') || b.full_name) : undefined

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton fallback="/admin/loans" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{borrower ?? 'פרטי הלוואה'}</h1>
            <p className="text-sm text-slate-500 ltr-num">{b?.id_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LoanStatusControl loan={loan} />
          <Link href={`/admin/loans/${loan.id}/edit`}>
            <button className="flex items-center gap-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 transition-colors">
              <Edit size={14} /> עריכה
            </button>
          </Link>
          <DeleteLoanButton loanId={loan.id} redirect />
        </div>
      </div>

      <Card>
          <div className="flex items-center gap-2 text-indigo-600 mb-3">
            <CreditCard size={16} />
            <span className="text-xs font-semibold text-slate-500 uppercase">פרטי הלוואה</span>
          </div>
          <div className="space-y-2 text-sm">
            <p><span className="text-slate-500">סכום: </span><span className="font-bold ltr-num">{fmtCur(loan.amount)}</span></p>
            <p><span className="text-slate-500">מספר תשלומים: </span>{loan.installments}</p>
            <p><span className="text-slate-500">מטרה: </span>{loan.purpose ?? '—'}</p>
            {loan.purpose_details && <p><span className="text-slate-500">פירוט מטרה: </span>{loan.purpose_details}</p>}
            {loan.declaration && <p><span className="text-slate-500">פנייה קודמת לגמ״ח: </span>{loan.declaration}</p>}
            <p><span className="text-slate-500">תאריך הגשה: </span><span className="ltr-num">{fmtDate(loan.created_at)}</span></p>
          </div>
      </Card>

      {Array.isArray(loan.document_urls) && loan.document_urls.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 text-indigo-600 mb-3">
            <FileText size={16} />
            <span className="text-xs font-semibold text-slate-500 uppercase">מסמכים מצורפים</span>
          </div>
          <div className="flex flex-col gap-2">
            {loan.document_urls.map((d, i) => (
              <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 bg-slate-50 hover:bg-indigo-50 border border-slate-200 rounded-lg px-3 py-2 transition-colors">
                <FileText size={14} className="flex-shrink-0" />
                <span className="truncate">{d.name || `מסמך ${i + 1}`}</span>
              </a>
            ))}
          </div>
        </Card>
      )}

      {loan.notes && (
        <Card>
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2">הערות</h2>
          <p className="text-sm text-slate-700">{loan.notes}</p>
        </Card>
      )}
    </div>
  )
}
