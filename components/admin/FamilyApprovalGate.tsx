'use client'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ExternalLink, ChevronLeft } from 'lucide-react'
import StatusControl from '@/app/admin/beneficiaries/[id]/StatusControl'
import type { EligibilityStatus } from '@/types'

interface GateBeneficiary {
  id: string
  full_name?: string | null
  family_name?: string | null
  id_number?: string | null
  spouse_name?: string | null
  spouse_id_number?: string | null
  marital_status?: string | null
  phone?: string | null
  city?: string | null
  address?: string | null
  children_count?: number | null
  eligibility_status?: string | null
  lineage_chain?: { generation: number; name: string; relation?: 'son' | 'son_in_law' | null }[] | null
}

// שער אישור משפחה — מוצג בכרטיס בקשה (הלוואה/לידה/וכו').
// אם המשפחה טרם אושרה: מציג את פרטי המשפחה והייחוס + אפשרות לאשר אותה ישירות,
// ומונע אישור הבקשה לפני שהמשפחה מאושרת.
export default function FamilyApprovalGate({ beneficiary, compact }: { beneficiary: GateBeneficiary; compact?: boolean }) {
  const approved = beneficiary.eligibility_status === 'approved'
  const fullName = [beneficiary.family_name, beneficiary.full_name].filter(Boolean).join(' ') || (beneficiary.full_name ?? '')
  const married = (beneficiary.marital_status ?? '').startsWith('נשו')

  if (approved) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
        <CheckCircle2 size={16} className="flex-shrink-0" />
        <span className="font-semibold">משפחה מאושרת</span>
        <span className="text-green-700">— ניתן לאשר את הבקשה.</span>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/60 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-100/70 flex-wrap">
        <div className="flex items-center gap-2 text-amber-900">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <span className="font-bold text-sm">המשפחה טרם אושרה — יש לאשר אותה לפני אישור הבקשה</span>
        </div>
        {/* אישור המשפחה ישירות מכאן */}
        <StatusControl id={beneficiary.id} status={(beneficiary.eligibility_status ?? 'pending') as EligibilityStatus} />
      </div>

      {!compact && (
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-amber-700 uppercase">כרטסת המשפחה — לבדיקה ואישור</h3>
          <Link href={`/admin/beneficiaries/${beneficiary.id}`} className="text-xs text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
            לכרטסת המלאה <ExternalLink size={12} />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm bg-white rounded-xl border border-amber-100 p-3">
          <p><span className="text-slate-500">שם: </span><span className="font-medium text-slate-800">{fullName}</span></p>
          <p><span className="text-slate-500">ת.ז: </span><span className="ltr-num">{beneficiary.id_number ?? '—'}</span></p>
          {beneficiary.marital_status && <p><span className="text-slate-500">מצב משפחתי: </span>{beneficiary.marital_status}</p>}
          {married && beneficiary.spouse_name && <p><span className="text-slate-500">בן/בת זוג: </span>{beneficiary.spouse_name}</p>}
          {married && beneficiary.spouse_id_number && <p><span className="text-slate-500">ת.ז בן/זוג: </span><span className="ltr-num">{beneficiary.spouse_id_number}</span></p>}
          {beneficiary.phone && <p><span className="text-slate-500">טלפון: </span><span className="ltr-num">{beneficiary.phone}</span></p>}
          {(beneficiary.address || beneficiary.city) && <p className="col-span-2"><span className="text-slate-500">כתובת: </span>{[beneficiary.address, beneficiary.city].filter(Boolean).join(', ')}</p>}
          <p><span className="text-slate-500">מספר ילדים: </span>{beneficiary.children_count ?? 0}</p>
        </div>

        {Array.isArray(beneficiary.lineage_chain) && beneficiary.lineage_chain.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-amber-700 mb-1.5">סדר הייחוס:</p>
            <div className="flex items-center gap-1 flex-wrap">
              {beneficiary.lineage_chain.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronLeft size={11} className="text-amber-300" />}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white text-amber-800 border border-amber-200">
                    {c.name}
                    {(c.relation === 'son' || c.relation === 'son_in_law') && (
                      <span className="text-[10px] text-amber-400 mr-1">({c.relation === 'son' ? 'בן' : 'חתן'})</span>
                    )}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
