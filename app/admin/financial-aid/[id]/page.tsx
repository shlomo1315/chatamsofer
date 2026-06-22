import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, FileText, HandCoins } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { FinancialAidRequest, Beneficiary } from '@/types'
import { docViewUrl } from '@/lib/docUrl'
import DocThumb from '@/components/ui/DocThumb'
import Card from '@/components/ui/Card'
import FinancialAidDetail from './FinancialAidDetail'

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

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—'

export default async function FinancialAidDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const req = await getReq(id)
  if (!req && isSupabaseConfigured()) notFound()
  if (!req) return <div className="max-w-2xl bg-white rounded-xl border p-8 text-center text-slate-400">הגדר Supabase לצפייה</div>

  const b = req.beneficiary as Beneficiary | undefined
  const name = b ? ([b.family_name, b.full_name].filter(Boolean).join(' ') || b.full_name) : '—'

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/financial-aid" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div className="flex items-center gap-2">
          <HandCoins size={18} className="text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{name}</h1>
            <p className="text-sm text-slate-500 ltr-num">{b?.id_number}</p>
          </div>
        </div>
      </div>

      {/* פרטי המבקש */}
      <Card>
        <h2 className="text-xs font-semibold text-slate-500 uppercase mb-3">פרטי המבקש</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <p><span className="text-slate-500">שם מלא: </span>{name}</p>
          <p><span className="text-slate-500">ת.ז: </span><span className="ltr-num">{b?.id_number ?? '—'}</span></p>
          {b?.spouse_name && <p><span className="text-slate-500">בן/בת זוג: </span>{b.spouse_name}</p>}
          {b?.marital_status && <p><span className="text-slate-500">מצב משפחתי: </span>{b.marital_status}</p>}
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
        {req.document_url && (
          <div className="mt-3 flex flex-col gap-1 w-28">
            <DocThumb href={docViewUrl(req.document_url)} rawUrl={req.document_url} name={req.document_name || 'מסמך מצורף'} size={112} />
            <span className="text-[11px] text-slate-600 truncate" title={req.document_name || ''}>{req.document_name || 'מסמך מצורף'}</span>
          </div>
        )}
      </Card>

      {/* פאנל זרימת המייל + בקרת סטטוס */}
      <FinancialAidDetail req={req} />
    </div>
  )
}
