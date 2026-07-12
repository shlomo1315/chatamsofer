'use client'

import { useState } from 'react'
import { Globe, Mail, FileImage, Check, X, Download, Loader2 } from 'lucide-react'

export interface GratitudeRow {
  id: string
  maternity_aid_id: string
  source: 'web' | 'email' | 'scan'
  body: string | null
  signature: string | null
  is_anonymous: boolean
  scan_url: string | null
  status: 'received' | 'approved' | 'rejected'
  created_at: string
  aid: {
    birth_date?: string | null
    recovery_home?: string | null
    beneficiary?: { family_name?: string | null; spouse_name?: string | null; full_name?: string | null } | null
  } | null
}

const SOURCE_META = {
  web:   { label: 'טופס',  icon: Globe,     color: 'text-sky-600 bg-sky-50' },
  email: { label: 'מייל',  icon: Mail,      color: 'text-violet-600 bg-violet-50' },
  scan:  { label: 'סריקה', icon: FileImage, color: 'text-amber-600 bg-amber-50' },
} as const

const STATUS_META = {
  received: { label: 'התקבל', color: 'bg-slate-100 text-slate-600' },
  approved: { label: 'אושר',  color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'נדחה',  color: 'bg-rose-100 text-rose-600' },
} as const

function motherName(row: GratitudeRow): string {
  const b = row.aid?.beneficiary
  if (!b) return '—'
  return [b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || '—'
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL')
}

export default function GratitudeTable({ rows }: { rows: GratitudeRow[] }) {
  const [items, setItems] = useState(rows)
  const [open, setOpen] = useState<GratitudeRow | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'received' | 'approved' | 'rejected'>('all')
  const [busy, setBusy] = useState(false)
  const [pdf, setPdf] = useState<string | null>(null)

  const filtered = statusFilter === 'all' ? items : items.filter(r => r.status === statusFilter)

  async function decide(id: string, status: 'approved' | 'rejected') {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/gratitude/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setItems(prev => prev.map(r => (r.id === id ? { ...r, status } : r)))
        setOpen(prev => (prev && prev.id === id ? { ...prev, status } : prev))
      }
    } finally {
      setBusy(false)
    }
  }

  async function loadPdf(row: GratitudeRow) {
    setPdf(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/gratitude/${row.id}?pdf=1`)
      const data = await res.json()
      if (res.ok && data.pdf) setPdf(data.pdf)
    } finally {
      setBusy(false)
    }
  }

  if (!items.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="text-4xl mb-3">💌</div>
        <p className="text-slate-500 text-sm">עדיין לא התקבלו מכתבי ברכה.</p>
        <p className="text-slate-400 text-xs mt-1">
          המייל נשלח אוטומטית 10 ימים אחרי אישור הלידה.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* סינון */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'received', 'approved', 'rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
              statusFilter === s
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s === 'all' ? `הכל (${items.length})` : `${STATUS_META[s].label} (${items.filter(r => r.status === s).length})`}
          </button>
        ))}
      </div>

      {/* טבלה */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-right text-xs text-slate-500">
              <th className="px-4 py-3 font-semibold">תאריך</th>
              <th className="px-4 py-3 font-semibold">שם היולדת</th>
              <th className="px-4 py-3 font-semibold">מקור</th>
              <th className="px-4 py-3 font-semibold">הברכה</th>
              <th className="px-4 py-3 font-semibold">סטטוס</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(row => {
              const meta = SOURCE_META[row.source]
              const Icon = meta.icon
              return (
                <tr
                  key={row.id}
                  onClick={() => { setOpen(row); setPdf(null) }}
                  className="hover:bg-slate-50 cursor-pointer transition"
                >
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(row.created_at)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {motherName(row)}
                    {row.is_anonymous && (
                      <span className="mr-2 text-[10px] text-slate-400 font-normal">(אנונימי)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${meta.color}`}>
                      <Icon size={13} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    <span className="line-clamp-1">
                      {row.body?.slice(0, 80) || (row.scan_url ? '— שובר סרוק —' : '—')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_META[row.status].color}`}>
                      {STATUS_META[row.status].label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* מודל */}
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-800">{motherName(open)}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {fmtDate(open.created_at)} · {SOURCE_META[open.source].label}
                  {open.is_anonymous && ' · אנונימי'}
                </p>
              </div>
              <button onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {open.body && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 mb-4">
                  <p className="text-slate-700 text-[15px] leading-relaxed whitespace-pre-wrap">{open.body}</p>
                  {open.signature && (
                    <p className="mt-4 pt-3 border-t border-slate-200 text-slate-500 text-sm">
                      בכבוד רב, <strong className="text-slate-700">{open.signature}</strong>
                    </p>
                  )}
                </div>
              )}

              {open.scan_url && (
                <a
                  href={open.scan_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-slate-200 overflow-hidden mb-4 hover:border-slate-300"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={open.scan_url} alt="שובר סרוק" className="w-full" />
                </a>
              )}

              {pdf && (
                <iframe
                  src={`data:application/pdf;base64,${pdf}`}
                  className="w-full rounded-xl border border-slate-200 mb-4"
                  style={{ height: '60vh' }}
                  title="השובר"
                />
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => decide(open.id, 'approved')}
                  disabled={busy || open.status === 'approved'}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold
                             hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <Check size={16} /> אישור
                </button>
                <button
                  onClick={() => decide(open.id, 'rejected')}
                  disabled={busy || open.status === 'rejected'}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-rose-200 text-rose-600 text-sm font-semibold
                             hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <X size={16} /> דחייה
                </button>
                {!open.scan_url && (
                  <button
                    onClick={() => loadPdf(open)}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-semibold
                               hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    הצגת השובר
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
