'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users, Loader2, ArrowLeft, GitBranch, Banknote, IdCard, ExternalLink } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// סיכום המשפחה שמאחורי הבקשה — כדי שההחלטה תתקבל עם כל התמונה, בלי לצאת
// מהמסך: פרטי ההורים וגילם, ילדים (כולל כמה נשואים — חישוב אוטומטי),
// סדר הדורות, צילומי ת"ז, והיסטוריית ההלוואות הקודמות.
// ─────────────────────────────────────────────────────────────────────────────

interface Summary {
  beneficiary: {
    id: string
    familyName?: string | null
    husbandName?: string | null
    husbandAge?: number | null
    wifeName?: string | null
    wifeAge?: number | null
    phone?: string | null
    city?: string | null
    address?: string | null
    eligibilityStatus?: string | null
  }
  children: { total: number; married: number; atHome: number }
  lineage: string[]
  idDocs: { type: string; name?: string | null; url: string | null }[]
  loanHistory: {
    count: number
    approvedCount: number
    totalApproved: number
    loans: { id: string; amount: number; approved_amount?: number | null; status: string; created_at: string }[]
  }
}

const STATUS_HE: Record<string, string> = {
  pending: 'ממתין', inquiry: 'בתהליך בירור', approved: 'מאושר',
  active: 'פעיל', completed: 'הושלם', rejected: 'נדחה', defaulted: 'בפיגור',
}

const fmtCur = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL')

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-left">{value}</span>
    </div>
  )
}

export default function FamilySummary({ loanId }: { loanId: string }) {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/loans/${loanId}/summary`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [loanId])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-slate-400" />
      </div>
    )
  }
  if (!data) return null

  const { beneficiary: b, children, lineage, idDocs, loanHistory } = data
  const family = [b.familyName, b.husbandName].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-4">
      {/* פרטי המשפחה */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-indigo-600" />
            <h3 className="font-semibold text-slate-900 text-sm">סיכום המשפחה</h3>
          </div>
          {/* מעבר לכרטסת המלאה */}
          <Link
            href={`/admin/beneficiaries/${b.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-100 transition-colors"
          >
            לכרטסת המלאה <ArrowLeft size={13} />
          </Link>
        </div>

        <div className="px-4 py-3">
          <Row label="בעל" value={b.husbandName ? `${b.husbandName}${b.husbandAge != null ? ` · בן ${b.husbandAge}` : ''}` : null} />
          <Row label="אשה" value={b.wifeName ? `${b.wifeName}${b.wifeAge != null ? ` · בת ${b.wifeAge}` : ''}` : null} />
          <Row label="כתובת" value={[b.address, b.city].filter(Boolean).join(', ')} />
          <Row label="טלפון" value={b.phone ? <span dir="ltr" className="tabular-nums">{b.phone}</span> : null} />
        </div>

        {/* ילדים — הפילוח שמשפיע על ההחלטה */}
        <div className="px-4 pb-4 grid grid-cols-3 gap-2">
          {[
            { label: 'סה״כ ילדים', value: children.total, color: 'bg-slate-50 text-slate-800 border-slate-200' },
            { label: 'נשואים', value: children.married, color: 'bg-violet-50 text-violet-800 border-violet-200' },
            { label: 'בבית', value: children.atHome, color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border px-3 py-2.5 text-center ${c.color}`}>
              <p className="text-2xl font-extrabold leading-none">{c.value}</p>
              <p className="text-[11px] mt-1 opacity-80">{c.label}</p>
            </div>
          ))}
        </div>

        {/* סדר הדורות */}
        {lineage.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-start gap-2 bg-violet-50/60 border border-violet-100 rounded-xl px-3 py-2.5">
              <GitBranch size={14} className="text-violet-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[11px] text-violet-700 font-semibold mb-0.5">סדר הדורות</p>
                <p className="text-xs text-violet-900 leading-relaxed">{lineage.join(' ← ')}</p>
              </div>
            </div>
          </div>
        )}

        {/* צילומי ת"ז */}
        {idDocs.length > 0 && (
          <div className="px-4 pb-4 flex flex-wrap gap-2">
            {idDocs.map((d, i) => (
              <a
                key={i}
                href={d.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                <IdCard size={13} className="text-slate-500" />
                {d.type}
                <ExternalLink size={11} className="text-slate-400" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* היסטוריית הלוואות */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Banknote size={16} className="text-emerald-600" />
          <h3 className="font-semibold text-slate-900 text-sm">היסטוריית הלוואות</h3>
        </div>

        {loanHistory.count === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-slate-400">
            זו הבקשה הראשונה של המשפחה
          </p>
        ) : (
          <>
            <div className="px-4 py-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
                <p className="text-xl font-extrabold text-slate-800 leading-none">{loanHistory.approvedCount}</p>
                <p className="text-[11px] text-slate-500 mt-1">הלוואות שאושרו בעבר</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center">
                <p className="text-xl font-extrabold text-emerald-800 leading-none tabular-nums">
                  {fmtCur(loanHistory.totalApproved)}
                </p>
                <p className="text-[11px] text-emerald-700 mt-1">סה״כ שאושר</p>
              </div>
            </div>

            <div className="px-4 pb-4 flex flex-col gap-1.5">
              {loanHistory.loans.map(l => (
                <Link
                  key={l.id}
                  href={`/admin/loans/${l.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 hover:border-slate-200 transition-colors"
                >
                  <span className="text-xs text-slate-500">{fmtDate(l.created_at)}</span>
                  <span className="text-sm font-semibold text-slate-800 tabular-nums">
                    {fmtCur(Number(l.approved_amount ?? l.amount))}
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
                    {STATUS_HE[l.status] ?? l.status}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
