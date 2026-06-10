'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw, Mail, Check, Eye, Loader2 } from 'lucide-react'
import type { FinancialAidRequest, FinancialAidStatus } from '@/types'
import { FINANCIAL_AID_STATUS_LABELS, FINANCIAL_AID_STATUS_COLORS } from '@/types'

type Ben = { full_name?: string; family_name?: string; spouse_name?: string; id_number?: string; spouse_id_number?: string; phone?: string }
const name = (b?: Ben) => b ? ([b.family_name, b.full_name].filter(Boolean).join(' ') || b.full_name || '—') : '—'
const fmtCur = (n?: number | null) => n != null ? `₪${Number(n).toLocaleString('he-IL')}` : '—'
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—'

const FILTERS: { key: FinancialAidStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'ממתין' },
  { key: 'awaiting_decision', label: 'נשלח לגורם מאשר' },
  { key: 'approved', label: 'מאושר' },
  { key: 'rejected', label: 'נדחה' },
]

export default function FinancialAidClient({ requests }: { requests: FinancialAidRequest[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<FinancialAidStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [checking, setChecking] = useState(false)

  // הגדרת מייל הגורם המאשר
  const [decisionEmail, setDecisionEmail] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  useEffect(() => {
    fetch('/api/admin/financial-aid/decision-email').then(r => r.json()).then(d => { setDecisionEmail(d.email ?? ''); setEmailInput(d.email ?? '') }).catch(() => {})
  }, [])
  const saveEmail = async () => {
    setSavingEmail(true)
    const r = await fetch('/api/admin/financial-aid/decision-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput }) })
    if (r.ok) setDecisionEmail(emailInput.trim())
    setSavingEmail(false)
  }

  // שליפת תשובות אוטומטית בכניסה + כפתור ידני
  const checkReplies = useCallback(async (silent: boolean) => {
    if (!silent) setChecking(true)
    try {
      const r = await fetch('/api/admin/financial-aid/check-replies', { method: 'POST' })
      const d = await r.json()
      if (d.updated > 0) router.refresh()
    } catch { /* ignore */ }
    if (!silent) setChecking(false)
  }, [router])
  useEffect(() => { checkReplies(true) }, [checkReplies])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: requests.length }
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [requests])

  const filtered = requests.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false
    if (!query.trim()) return true
    const b = r.beneficiary as Ben | undefined
    return [name(b), b?.id_number, b?.spouse_id_number, r.reason].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase())
  })

  return (
    <div className="flex flex-col gap-4">
      {/* הגדרת מייל גורם מאשר */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <Mail size={16} className="text-emerald-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-slate-700">מייל הגורם המאשר:</span>
        <input value={emailInput} onChange={e => setEmailInput(e.target.value)} dir="ltr" placeholder="decision@example.com"
          className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button onClick={saveEmail} disabled={savingEmail || emailInput.trim() === decisionEmail}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2">
          {savingEmail ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} שמור
        </button>
      </div>

      {/* קוביות סינון */}
      <div className="flex gap-2 flex-wrap items-center">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${filter === f.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>
            {f.label} <span className="opacity-70">{counts[f.key] ?? 0}</span>
          </button>
        ))}
        <button onClick={() => checkReplies(false)} disabled={checking}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 rounded-lg px-3 py-1.5">
          {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} בדוק תשובות
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-slate-900">בקשות סיוע כספי</h2>
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש…"
              className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['שם', 'ת.ז.', 'סיבת הבקשה', 'סכום מאושר', 'סטטוס', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">אין בקשות בסינון זה</td></tr>
              ) : filtered.map(r => {
                const b = r.beneficiary as Ben | undefined
                return (
                  <tr key={r.id} onClick={() => router.push(`/admin/financial-aid/${r.id}`)} className="hover:bg-emerald-50/40 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{name(b)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600"><span className="ltr-num">{b?.id_number ?? b?.spouse_id_number ?? '—'}</span></td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{r.reason ?? '—'}</td>
                    <td className="px-4 py-3 font-bold text-slate-800 ltr-num">{r.status === 'approved' ? fmtCur(r.amount) : '—'}</td>
                    <td className="px-4 py-3"><span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${FINANCIAL_AID_STATUS_COLORS[r.status]}`}>{FINANCIAL_AID_STATUS_LABELS[r.status]}</span></td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><Eye size={13} /> פרטים</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
