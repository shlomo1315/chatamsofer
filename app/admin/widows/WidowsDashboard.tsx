'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Eye, Phone, MapPin, Baby, Clock, Check, X } from 'lucide-react'
import { Beneficiary, WidowRequest, WIDOW_REQUEST_TYPE_LABELS, WIDOW_REQUEST_STATUS_LABELS, WIDOW_REQUEST_STATUS_COLORS } from '@/types'

const fullName = (b: Beneficiary) => [b.family_name, b.full_name].filter(Boolean).join(' ')

const TABS = [
  { key: 'widows', label: 'רשימת אלמנות/אלמנים' },
  { key: 'orphans', label: 'ילדים יתומים' },
  { key: 'requests', label: 'בקשות' },
]

const STATUS_SEL: Record<string, string> = {
  pending:     'bg-amber-100 text-amber-700',
  approved:    'bg-green-100 text-green-700',
  rejected:    'bg-red-100 text-red-700',
  docs_pending:'bg-blue-100 text-blue-700',
  review:      'bg-slate-100 text-slate-600',
}
const STATUS_LBL: Record<string, string> = {
  pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה',
  docs_pending: 'השלמת מסמכים', review: 'בבדיקה',
}

export default function WidowsDashboard({ widows, requests }: { widows: Beneficiary[]; requests: WidowRequest[] }) {
  const [tab, setTab] = useState<'widows' | 'orphans' | 'requests'>('widows')

  // Collect all orphans from children JSONB
  const orphans = widows.flatMap(w =>
    (w.children ?? []).map(c => ({ ...c, parentName: fullName(w), parentId: w.id }))
  )

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              tab === t.key
                ? 'border-purple-600 text-purple-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        {/* ── Tab 1: Widows list ── */}
        {tab === 'widows' && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-right px-4 py-3">שם</th>
                <th className="text-right px-4 py-3">ת.ז.</th>
                <th className="text-right px-4 py-3">עיר</th>
                <th className="text-right px-4 py-3">מצב</th>
                <th className="text-right px-4 py-3">ילדים</th>
                <th className="text-right px-4 py-3">סטטוס</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {widows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">אין רשומות</td></tr>
              )}
              {widows.map(w => (
                <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{fullName(w)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500" dir="ltr">{w.id_number}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {w.city ? <span className="flex items-center gap-1"><MapPin size={12} />{w.city}</span> : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                      {w.marital_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-slate-600">
                      <Baby size={13} />{w.children_count ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_SEL[w.eligibility_status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LBL[w.eligibility_status] ?? w.eligibility_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/beneficiaries/${w.id}`} className="text-indigo-600 hover:text-indigo-800">
                      <Eye size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Tab 2: Orphans ── */}
        {tab === 'orphans' && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-right px-4 py-3">שם הילד/ה</th>
                <th className="text-right px-4 py-3">ת.ז.</th>
                <th className="text-right px-4 py-3">מין</th>
                <th className="text-right px-4 py-3">תאריך לידה</th>
                <th className="text-right px-4 py-3">הורה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orphans.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-slate-400">אין ילדים רשומים</td></tr>
              )}
              {orphans.map((c, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500" dir="ltr">{c.id_number || '—'}</td>
                  <td className="px-4 py-3">
                    {c.gender === 'male'
                      ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">בן</span>
                      : c.gender === 'female'
                      ? <span className="px-2 py-0.5 rounded-full text-xs bg-pink-50 text-pink-700">בת</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.birth_date || '—'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/beneficiaries/${c.parentId}`} className="text-indigo-600 hover:underline text-xs">
                      {c.parentName}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Tab 3: Requests ── */}
        {tab === 'requests' && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-right px-4 py-3">מגיש/ה</th>
                <th className="text-right px-4 py-3">סוג בקשה</th>
                <th className="text-right px-4 py-3">פרטים</th>
                <th className="text-right px-4 py-3">סכום</th>
                <th className="text-right px-4 py-3">תאריך</th>
                <th className="text-right px-4 py-3">סטטוס</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">אין בקשות</td></tr>
              )}
              {requests.map(r => {
                const ben = r.beneficiary as (Beneficiary & { full_name: string }) | undefined
                const name = ben ? [ben.family_name, ben.full_name].filter(Boolean).join(' ') : '—'
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700">
                        {WIDOW_REQUEST_TYPE_LABELS[r.request_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{r.description || '—'}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {r.amount ? `₪${r.amount.toLocaleString('he-IL')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(r.created_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${WIDOW_REQUEST_STATUS_COLORS[r.status]}`}>
                        {WIDOW_REQUEST_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      {r.status === 'pending' && (
                        <>
                          <ApproveBtn id={r.id} />
                          <RejectBtn id={r.id} />
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function ApproveBtn({ id }: { id: string }) {
  return (
    <button
      onClick={async () => {
        await fetch('/api/admin/widow-request-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'approved' }) })
        window.location.reload()
      }}
      className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
      title="אשר"
    >
      <Check size={14} />
    </button>
  )
}

function RejectBtn({ id }: { id: string }) {
  return (
    <button
      onClick={async () => {
        await fetch('/api/admin/widow-request-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'rejected' }) })
        window.location.reload()
      }}
      className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
      title="דחה"
    >
      <X size={14} />
    </button>
  )
}
