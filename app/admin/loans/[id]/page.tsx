import Link from 'next/link'
import { ArrowRight, CreditCard, FileText, Edit, CheckCircle2, Clock, ExternalLink } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Loan } from '@/types'
import { docViewUrl } from '@/lib/docUrl'
import Card from '@/components/ui/Card'
import { LoanStatusControl, DeleteLoanButton } from '../LoanControls'
import FamilyApprovalGate from '@/components/admin/FamilyApprovalGate'
import BackButton from '@/components/ui/BackButton'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

async function getLoan(id: string): Promise<Loan | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('loans')
    .select('*, beneficiary:beneficiaries(id, full_name, family_name, spouse_name, spouse_id_number, id_number, phone, address, city, marital_status, children_count, eligibility_status, lineage_chain)')
    .eq('id', id)
    .single()
  // לא נמצא (PGRST116) או מזהה לא תקין (22P02) → notFound; שאר השגיאות מופצות הלאה
  if (error && error.code !== 'PGRST116' && error.code !== '22P02') throw error
  return data
}

async function getBeneficiaryIdDocs(beneficiaryId: string): Promise<{ doc_type: string; file_url: string | null; file_name: string | null }[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('doc_type, file_url, file_name')
    .eq('beneficiary_id', beneficiaryId)
    .in('doc_type', ['id_husband', 'id_wife'])
    .order('uploaded_at', { ascending: false })
  if (!data) return []
  const seen = new Set<string>()
  return data.filter(d => { if (seen.has(d.doc_type)) return false; seen.add(d.doc_type); return true })
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'
const fmtCur = (n: number) => `₪${Math.round(Number(n) || 0).toLocaleString('he-IL')}`

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loan = await getLoan(id)
  const beneficiaryId = (loan?.beneficiary as { id?: string } | undefined)?.id
  const idDocs = beneficiaryId ? await getBeneficiaryIdDocs(beneficiaryId) : []

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

  const b = loan.beneficiary as (Parameters<typeof FamilyApprovalGate>[0]['beneficiary'] & { full_name?: string; family_name?: string; spouse_name?: string; id_number?: string; phone?: string; eligibility_status?: string }) | undefined
  const familyApproved = b?.eligibility_status === 'approved'
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
          <LoanStatusControl loan={loan} advance familyApproved={familyApproved} />
          <Link href={`/admin/loans/${loan.id}/edit`}>
            <button className="flex items-center gap-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 transition-colors">
              <Edit size={14} /> עריכה
            </button>
          </Link>
          <DeleteLoanButton loanId={loan.id} redirect />
        </div>
      </div>

      {/* שער אישור המשפחה — אם טרם אושרה, מציג פרטים+ייחוס ומאפשר אישור ישיר; חוסם אישור בקשה לפני כן */}
      {b && <FamilyApprovalGate beneficiary={b} />}

      <Card>
          <div className="flex items-center gap-2 text-indigo-600 mb-3">
            <CreditCard size={16} />
            <span className="text-xs font-semibold text-slate-500 uppercase">פרטי הלוואה</span>
          </div>
          <div className="space-y-2 text-sm">
            <p><span className="text-slate-500">סכום מבוקש: </span><span className="font-bold ltr-num">{fmtCur(loan.amount)}</span></p>
            {loan.approved_amount != null && (
              <p><span className="text-slate-500">סכום שאושר: </span><span className="font-bold text-green-700 ltr-num">{fmtCur(loan.approved_amount)}</span></p>
            )}
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
              <a key={i} href={docViewUrl(d.url)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 bg-slate-50 hover:bg-indigo-50 border border-slate-200 rounded-lg px-3 py-2 transition-colors">
                <FileText size={14} className="flex-shrink-0" />
                <span className="truncate">{d.name || `מסמך ${i + 1}`}</span>
              </a>
            ))}
          </div>
        </Card>
      )}

      {idDocs.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 text-indigo-600 mb-3">
            <FileText size={16} />
            <span className="text-xs font-semibold text-slate-500 uppercase">תעודות זהות</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {idDocs.find(d => d.doc_type === 'id_husband') && (
              <LoanDocCard label="ת.ז. הבעל" url={idDocs.find(d => d.doc_type === 'id_husband')!.file_url ?? undefined} />
            )}
            {idDocs.find(d => d.doc_type === 'id_wife') && (
              <LoanDocCard label="ת.ז. האישה" url={idDocs.find(d => d.doc_type === 'id_wife')!.file_url ?? undefined} />
            )}
          </div>
        </Card>
      )}

      {/* ביצוע הלוואה */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          {loan.disbursed_at
            ? <CheckCircle2 size={16} className="text-emerald-500" />
            : <Clock size={16} className="text-amber-500" />}
          <span className="text-xs font-semibold text-slate-500 uppercase">ביצוע הלוואה</span>
        </div>
        {loan.disbursed_at ? (
          <div className="space-y-1.5 text-sm">
            <p><span className="text-slate-500">סטטוס: </span><span className="font-semibold text-emerald-700">בוצע ✓</span></p>
            <p><span className="text-slate-500">תאריך ביצוע: </span><span className="ltr-num">{fmtDate(loan.disbursed_at)}</span></p>
            {loan.disbursed_by && <p><span className="text-slate-500">בוצע על ידי: </span>{loan.disbursed_by}</p>}
          </div>
        ) : (
          <p className="text-sm text-slate-400">טרם בוצע — יסומן דרך פורטל הביצוע</p>
        )}
      </Card>

      {loan.notes && (
        <Card>
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2">הערות</h2>
          <p className="text-sm text-slate-700">{loan.notes}</p>
        </Card>
      )}
    </div>
  )
}

function LoanDocCard({ label, url }: { label: string; url?: string }) {
  if (!url) return null
  const isImage = /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(url)
  const href = docViewUrl(url)
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="flex flex-col gap-2 p-2 border border-slate-200 rounded-xl bg-white hover:border-indigo-300 hover:shadow-sm transition-all group">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={href} alt={label} className="w-full h-28 object-cover rounded-lg bg-slate-100" />
      ) : (
        <div className="w-full h-28 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center">
          <FileText size={28} className="text-slate-400" />
        </div>
      )}
      <span className="text-xs font-medium text-slate-600 group-hover:text-indigo-600 flex items-center justify-center gap-1">
        {label} <ExternalLink size={11} />
      </span>
    </a>
  )
}
