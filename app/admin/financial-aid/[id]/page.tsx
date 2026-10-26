import { guardPage } from '@/lib/pageGuard'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, FileText, HandCoins } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { FinancialAidRequest, Beneficiary } from '@/types'
import { docViewUrl } from '@/lib/docUrl'
import DocThumb from '@/components/ui/DocThumb'
import DownloadDocButton from '@/components/ui/DownloadDocButton'
import Card from '@/components/ui/Card'
import FinancialAidDetail from './FinancialAidDetail'
import { FINANCIAL_AID_STATUS_LABELS } from '@/types'
import { registrationSourceLabel } from '@/lib/distributionSources'

async function getReq(id: string): Promise<FinancialAidRequest | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('financial_aid_requests')
    .select('*, beneficiary:beneficiaries(*)')
    .eq('id', id).single()
  // לא נמצא (PGRST116) או מזהה לא תקין (22P02) → notFound; שאר השגיאות מופצות הלאה
  if (error && error.code !== 'PGRST116' && error.code !== '22P02') throw error
  return data
}

type DocRow = { kind: string; file_url: string; file_name: string | null }
type HistRow = { id: string; created_at: string; status: keyof typeof FINANCIAL_AID_STATUS_LABELS; requested_amount: number | null; amount: number | null; is_descendant: boolean | null }

// מסמכי הבקשה (טבלה חדשה; ריקה/חסרה בבקשות ישנות) והיסטוריית בקשות קודמות לפי ת.ז.
async function getExtras(req: FinancialAidRequest): Promise<{ docs: DocRow[]; history: HistRow[] }> {
  const supabase = await createClient()
  const { data: docs } = await supabase.from('financial_aid_documents').select('kind, file_url, file_name').eq('request_id', req.id).order('created_at')
  const b = req.beneficiary as Beneficiary | undefined
  const idNum = b?.id_number || req.applicant_id_number
  let history: HistRow[] = []
  if (idNum || req.beneficiary_id) {
    const ors = [req.beneficiary_id ? `beneficiary_id.eq.${req.beneficiary_id}` : '', idNum ? `applicant_id_number.eq.${idNum}` : ''].filter(Boolean).join(',')
    const { data } = await supabase.from('financial_aid_requests')
      .select('id, created_at, status, requested_amount, amount, is_descendant')
      .or(ors).neq('id', req.id).order('created_at', { ascending: false })
    history = (data ?? []) as HistRow[]
  }
  return { docs: (docs ?? []) as DocRow[], history }
}

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—'

export default async function FinancialAidDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await guardPage('financial_aid')
  const { id } = await params
  const req = await getReq(id)
  if (!req && isSupabaseConfigured()) notFound()
  if (!req) return <div className="max-w-2xl bg-white rounded-xl border p-8 text-center text-slate-400">הגדר Supabase לצפייה</div>

  const b = req.beneficiary as Beneficiary | undefined
  const name = b ? ([b.family_name, b.full_name].filter(Boolean).join(' ') || b.full_name) : (req.applicant_name || '—')
  const idNumber = b?.id_number ?? req.applicant_id_number
  const { docs, history } = await getExtras(req)
  const money = (n?: number | null) => n != null ? `₪${Number(n).toLocaleString('he-IL')}` : '—'

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/financial-aid" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div className="flex items-center gap-2">
          <HandCoins size={18} className="text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{name}{req.is_descendant === false && <span className="mr-2 rounded-full bg-orange-100 px-2 py-0.5 align-middle text-xs font-semibold text-orange-700">לא צאצא</span>}</h1>
            <p className="text-sm text-slate-500 ltr-num">{idNumber}</p>
          </div>
        </div>
      </div>

      {/* פרטי המבקש */}
      <Card>
        <h2 className="text-xs font-semibold text-slate-500 uppercase mb-3">פרטי המבקש</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <p><span className="text-slate-500">שם מלא: </span>{name}</p>
          <p><span className="text-slate-500">ת.ז: </span><span className="ltr-num">{idNumber ?? '—'}</span></p>
          {b?.spouse_name && <p><span className="text-slate-500">בן/בת זוג: </span>{b.spouse_name}</p>}
          {b?.marital_status && <p><span className="text-slate-500">מצב משפחתי: </span>{b.marital_status}</p>}
          {(b as { community_affiliation?: string | null })?.community_affiliation?.trim() &&
            <p><span className="text-slate-500">קהילה: </span>{(b as { community_affiliation?: string | null }).community_affiliation}</p>}
          <p><span className="text-slate-500">אופן ההרשמה: </span>{registrationSourceLabel((b as { registration_source?: string | null })?.registration_source)}</p>
          {!b && req.applicant_phone && <p><span className="text-slate-500">טלפון: </span><span className="ltr-num">{req.applicant_phone}</span></p>}
          {!b && req.applicant_email && <p><span className="text-slate-500">מייל: </span><span className="ltr-num">{req.applicant_email}</span></p>}
          {!b && (req.applicant_address || req.applicant_city) && <p className="col-span-2"><span className="text-slate-500">כתובת: </span>{[req.applicant_address, req.applicant_city].filter(Boolean).join(', ')}</p>}
          {req.requested_amount != null && <p><span className="text-slate-500">סכום מבוקש: </span><span className="ltr-num font-semibold">{money(req.requested_amount)}</span></p>}
          {b?.phone && <p><span className="text-slate-500">טלפון: </span><span className="ltr-num">{b.phone}</span></p>}
          {(b?.address || b?.city) && <p className="col-span-2"><span className="text-slate-500">כתובת: </span>{[b.address, b.city].filter(Boolean).join(', ')}</p>}
          <p><span className="text-slate-500">מספר ילדים: </span>{b?.children_count ?? 0}</p>
          <p><span className="text-slate-500">תאריך הבקשה: </span><span className="ltr-num">{fmtDate(req.created_at)}</span></p>
        </div>
      </Card>

      {/* נימוק + מסמך */}
      <Card>
        <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2">סיבת הבקשה</h2>
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{req.reason ?? '—'}</p>
        {docs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {docs.map(d => (
              <div key={d.file_url} className="flex w-28 flex-col gap-1">
                <DocThumb href={docViewUrl(d.file_url)} rawUrl={d.file_url} name={d.file_name || 'מסמך'} size={112} />
                <span className="truncate text-[11px] text-slate-600" title={d.file_name || ''}>{d.kind === 'id_card' ? 'צילום ת.ז.' : (d.file_name || 'מסמך רפואי')}</span>
                <DownloadDocButton url={d.file_url} docType={d.kind === 'id_card' ? 'צילום ת.ז.' : 'מסמך רפואי'} person={name} name={d.file_name || d.file_url} variant="icon" className="self-start" />
              </div>
            ))}
          </div>
        )}
        {docs.length === 0 && req.document_url && (
          <div className="mt-3 flex flex-col gap-1 w-28">
            <DocThumb href={docViewUrl(req.document_url)} rawUrl={req.document_url} name={req.document_name || 'מסמך מצורף'} size={112} />
            <span className="text-[11px] text-slate-600 truncate" title={req.document_name || ''}>{req.document_name || 'מסמך מצורף'}</span>
            <DownloadDocButton url={req.document_url} docType="מסמך בקשת סיוע" person={name} name={req.document_name || req.document_url} variant="icon" className="self-start" />
          </div>
        )}
      </Card>

      {/* היסטוריית בקשות קודמות של אותו מבקש (לפי ת.ז.) */}
      {history.length > 0 && (
        <Card>
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-3">בקשות קודמות ({history.length})</h2>
          <div className="min-w-0">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-xs text-slate-500">
                <th className="py-1 font-medium">הוגשה</th><th className="py-1 font-medium">ביקש</th><th className="py-1 font-medium">החלטה</th><th className="py-1 font-medium">קיבל</th>
              </tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-t border-slate-100">
                    <td className="py-1.5 ltr-num">{fmtDate(h.created_at)}</td>
                    <td className="py-1.5 ltr-num">{money(h.requested_amount)}</td>
                    <td className="py-1.5"><Link href={`/admin/financial-aid/${h.id}`} className="hover:underline">{FINANCIAL_AID_STATUS_LABELS[h.status] ?? h.status}</Link>{h.is_descendant === false && <span className="mr-1 text-xs text-orange-700">(לא צאצא)</span>}</td>
                    <td className="py-1.5 ltr-num">{h.status === 'approved' ? money(h.amount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* פאנל זרימת המייל + בקרת סטטוס */}
      <FinancialAidDetail key={`${req.status}-${req.amount ?? 0}`} req={req} />
    </div>
  )
}
