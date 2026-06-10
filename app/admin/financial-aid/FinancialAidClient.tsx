'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw, Mail, Check, Eye, Loader2, Plus, X, Upload } from 'lucide-react'
import type { FinancialAidRequest, FinancialAidStatus } from '@/types'
import { FINANCIAL_AID_STATUS_LABELS, FINANCIAL_AID_STATUS_COLORS } from '@/types'
import { createClient } from '@/lib/supabase/client'

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
  const supabase = createClient()
  const [filter, setFilter] = useState<FinancialAidStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [checking, setChecking] = useState(false)

  // בקשה חדשה מהניהול
  const [newOpen, setNewOpen] = useState(false)
  const [idInput, setIdInput] = useState('')
  const [found, setFound] = useState<{ id: string; name: string; id_number?: string } | null>(null)
  const [lookupErr, setLookupErr] = useState('')
  const [looking, setLooking] = useState(false)
  const [newReason, setNewReason] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const lookup = async () => {
    const raw = idInput.trim()
    if (!raw) return
    setLooking(true); setLookupErr(''); setFound(null)
    try {
      const digits = raw.replace(/\D/g, '')
      const variants = Array.from(new Set([raw, digits].filter(Boolean)))
      const orFilter = variants.flatMap(v => [`id_number.eq.${v}`, `spouse_id_number.eq.${v}`]).join(',')
      const { data } = await supabase.from('beneficiaries').select('id, full_name, family_name, id_number').or(orFilter).maybeSingle()
      if (!data) setLookupErr('לא נמצא נתמך עם ת.ז זו')
      else setFound({ id: data.id, name: [data.family_name, data.full_name].filter(Boolean).join(' '), id_number: data.id_number })
    } catch { setLookupErr('שגיאת רשת') }
    setLooking(false)
  }

  const resetNew = () => { setNewOpen(false); setIdInput(''); setFound(null); setLookupErr(''); setNewReason(''); setNewFile(null); setSaveErr('') }

  const submitNew = async () => {
    if (!found) { setSaveErr('יש לבחור נתמך'); return }
    if (!newReason.trim()) { setSaveErr('יש לפרט את סיבת הבקשה'); return }
    setSaving(true); setSaveErr('')
    try {
      const fd = new FormData()
      fd.append('beneficiary_id', found.id)
      fd.append('reason', newReason.trim())
      if (newFile) fd.append('file', newFile)
      const r = await fetch('/api/admin/financial-aid/create', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) { setSaveErr(d.error || 'שגיאה'); setSaving(false); return }
      resetNew(); router.refresh()
    } catch { setSaveErr('שגיאת רשת') }
    setSaving(false)
  }

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
        <button onClick={() => { resetNew(); setNewOpen(true) }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5">
          <Plus size={13} /> בקשה חדשה
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

      {/* מודל בקשה חדשה */}
      {newOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">בקשת סיוע כספי חדשה</h2>
              <button onClick={resetNew} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              {/* בחירת נתמך לפי ת.ז */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">תעודת זהות של הנתמך <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input value={idInput} onChange={e => { setIdInput(e.target.value); setFound(null) }} onKeyDown={e => e.key === 'Enter' && lookup()}
                    dir="ltr" placeholder="ת.ז (בעל/אישה)" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm ltr-num" />
                  <button onClick={lookup} disabled={looking || !idInput.trim()}
                    className="inline-flex items-center gap-1 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-3 py-2">
                    {looking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} חפש
                  </button>
                </div>
                {lookupErr && <p className="text-xs text-red-600 mt-1">{lookupErr}</p>}
                {found && <p className="text-sm text-green-700 mt-1.5 flex items-center gap-1"><Check size={14} /> {found.name} <span className="text-slate-400 ltr-num">({found.id_number})</span></p>}
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">סיבת הבקשה <span className="text-red-500">*</span></label>
                <textarea value={newReason} onChange={e => setNewReason(e.target.value)} rows={4}
                  placeholder="פרט/י את המקרה, הצורך והעלויות. אם רפואי — אבחנה/טיפול/עלות בקצרה."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">מסמך מצורף (לא חובה)</label>
                {newFile ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                    <span className="text-sm text-green-700 flex items-center gap-2 min-w-0"><Check size={14} className="flex-shrink-0" /><span className="truncate">{newFile.name}</span></span>
                    <button type="button" onClick={() => setNewFile(null)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg px-3 py-3 text-sm text-slate-500 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40">
                    <Upload size={16} /> העלאת מסמך
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setNewFile(e.target.files?.[0] ?? null)} />
                  </label>
                )}
              </div>

              {saveErr && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{saveErr}</div>}
              <button onClick={submitNew} disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold py-3 rounded-xl">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} צור בקשה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
