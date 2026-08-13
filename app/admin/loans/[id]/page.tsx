import Link from 'next/link'
import { ArrowRight, CreditCard, FileText, Edit, CheckCircle2, Clock, ExternalLink, Users, MessageSquare } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Loan } from '@/types'
import { docViewUrl } from '@/lib/docUrl'
import { ViewDocButton } from '@/components/ui/DocViewer'
import DocThumb from '@/components/ui/DocThumb'
import SafeDocImage from '@/components/ui/SafeDocImage'
import PdfCanvasView from '@/components/ui/PdfCanvasView'
import DownloadDocButton from '@/components/ui/DownloadDocButton'
import Card from '@/components/ui/Card'
import PriorRejectionAlert from './PriorRejectionAlert'
import { LoanStatusControl, DeleteLoanButton } from '../LoanControls'
import FamilyApprovalGate from '@/components/admin/FamilyApprovalGate'
import BackButton from '@/components/ui/BackButton'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import FamilySummary from './FamilySummary'
import LoanInquiryPanel from './LoanInquiryPanel'

async function getLoan(id: string): Promise<Loan | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('loans')
    .select('*, beneficiary:beneficiaries(id, full_name, family_name, spouse_name, spouse_id_number, id_number, email, phone, address, city, marital_status, children_count, eligibility_status, lineage_chain)')
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
    .in('doc_type', ['id_husband', 'id_husband_appx', 'id_wife', 'id_wife_appx'])
    .order('uploaded_at', { ascending: false })
  if (!data) return []
  const seen = new Set<string>()
  return data.filter(d => { if (seen.has(d.doc_type)) return false; seen.add(d.doc_type); return true })
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'
const fmtCur = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('he-IL')}`

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

  const b = loan.beneficiary as (Parameters<typeof FamilyApprovalGate>[0]['beneficiary'] & { full_name?: string; family_name?: string; spouse_name?: string; id_number?: string; phone?: string; email?: string; eligibility_status?: string }) | undefined
  const familyApproved = b?.eligibility_status === 'approved'
  // הלווה = הבעל (full_name); אם אין בעל, האישה (spouse_name)
  const borrower = b ? ([b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ') || b.full_name) : undefined

  return (
    <div className="flex flex-col gap-5">
      {/* ⚠️ מוצגת לפני כל השאר: ההחלטה על הבקשה מתקבלת במסך הזה, וההתראה
          חייבת להגיע לפניה ולא אחריה. */}
      <PriorRejectionAlert loanId={loan.id} familyName={borrower ?? undefined} />
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
      {/* ─────────────────────────────────────────────────────────────────
          🔴 מסך אחד רציף, בלי טאבים.
          
          ⚠️ הטאבים הסתירו מידע שנדרש *יחד*: כדי להחליט על בקשה צריך לראות
          את הפרטים, את הבירור מול המבקש ואת המסמכים באותו רגע. מעבר בין
          טאבים הכריח לזכור מה היה בקודם.
          
          ⚠️ העליון בשני טורים: הפרטים תפסו חצי מסך והשאר עמד ריק. הבירור
          — הדבר שמסתכלים בו הכי הרבה — נכנס לחצי הפנוי במקום להיות מוסתר.
       ───────────────────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        {/* ── טור ימין: פרטי הבקשה ── */}
        <div className="flex flex-col gap-5">
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

        {/* ── טור שמאל: הבירור מול המבקש ── */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sky-600">
            <MessageSquare size={16} />
            <h2 className="text-sm font-bold text-slate-700">בירור מול המבקש</h2>
          </div>
          <LoanInquiryPanel loanId={loan.id} hasEmail={Boolean(b?.email)} applicantName={borrower} />
        </div>
      </div>

      {/* ── סיכום המשפחה ── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-violet-600 border-t border-slate-200 pt-5">
          <Users size={16} />
          <h2 className="text-sm font-bold text-slate-700">סיכום המשפחה</h2>
        </div>
        <FamilySummary loanId={loan.id} />
      </section>

      {/* ── מסמכים ── */}
      {/* ⚠️ מוצג רק כשיש מסמכים: כותרת ריקה נראית כתקלה ומעלה את השאלה
          "איפה הם", בעוד שבפועל פשוט לא צורפו. */}
      {((Array.isArray(loan.document_urls) && loan.document_urls.length > 0) || idDocs.length > 0) && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sky-600 border-t border-slate-200 pt-5">
            <FileText size={16} />
            <h2 className="text-sm font-bold text-slate-700">מסמכים</h2>
          </div>

          {Array.isArray(loan.document_urls) && loan.document_urls.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 text-indigo-600 mb-3">
                <FileText size={16} />
                <span className="text-xs font-semibold text-slate-500 uppercase">מסמכים מצורפים</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {loan.document_urls.map((d, i) => (
                  <div key={i} className="flex flex-col gap-1 w-24">
                    <DocThumb href={docViewUrl(d.url)} rawUrl={d.url} name={d.name || `מסמך ${i + 1}`} size={96} />
                    <span className="text-[11px] text-slate-600 truncate" title={d.name || ''}>{d.name || `מסמך ${i + 1}`}</span>
                    <DownloadDocButton url={d.url} docType={(d.name || `מסמך ${i + 1}`).replace(/\.[^.\s]+$/, '')} person={borrower} name={d.name || d.url} variant="icon" className="self-start" />
                  </div>
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
              <div className="grid grid-cols-2 gap-4 max-w-2xl">
                {idDocs.find(d => d.doc_type === 'id_husband') && (
                  <LoanDocCard label="ת.ז. הבעל" person={borrower} url={idDocs.find(d => d.doc_type === 'id_husband')!.file_url ?? undefined} />
                )}
                {idDocs.find(d => d.doc_type === 'id_wife') && (
                  <LoanDocCard label="ת.ז. האישה" person={borrower} url={idDocs.find(d => d.doc_type === 'id_wife')!.file_url ?? undefined} />
                )}
              </div>
            </Card>
          )}
        </section>
      )}
    </div>
  )
}

function LoanDocCard({ label, url, person }: { label: string; url?: string; person?: string }) {
  if (!url) return null
  const href = docViewUrl(url)
  const isImage = /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(url)
  const isPdf = /\.pdf(\?|$)/i.test(url)
  return (
    <div className="flex flex-col gap-1.5">
    <ViewDocButton url={url}
       className="flex flex-col gap-2 p-2 border border-slate-200 rounded-xl bg-white hover:border-indigo-300 hover:shadow-sm transition-all group">
      {isImage ? (
        <SafeDocImage path={url} name={label} alt={label} className="w-full h-72 object-contain rounded-lg bg-slate-50" />
      ) : isPdf ? (
        // תצוגה מקדימה אמיתית — העמוד הראשון מצויר על canvas
        <PdfCanvasView url={url} name={label} maxPages={1} cover className="w-full h-72 rounded-lg overflow-hidden bg-white" />
      ) : (
        <div className="w-full h-28 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center">
          <FileText size={28} className="text-slate-400" />
        </div>
      )}
      <span className="text-xs font-medium text-slate-600 group-hover:text-indigo-600 flex items-center justify-center gap-1">
        {label} <ExternalLink size={11} />
      </span>
    </ViewDocButton>
      <DownloadDocButton url={url} docType={label} person={person} variant="button" className="justify-center" />
    </div>
  )
}
