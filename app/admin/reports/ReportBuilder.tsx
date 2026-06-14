'use client'
import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, FileBarChart } from 'lucide-react'

type Row = {
  id: string; motherName: string; motherId: string; city: string; babyName: string
  birthDate: string; status: string; cardStatus: string; cardBalance: number
  recoveryHome: string; arrived: boolean | null
  recoveryAmount: number | null; recoveryAmountStatus: string; recoveryAmountAt: string; recoveryNights: number | null
}

const BIRTH_STATUS: Record<string, string> = { pending: 'ממתין לאישור', active: 'מאושר', completed: 'הושלם', cancelled: 'בוטל' }
const CARD_STATUS: Record<string, string> = { pending: 'ממתין', approved: 'אושר', awaiting_stock: 'ממתין למלאי', loaded: 'נטען', rejected: 'נדחה' }
const ils = (n: number) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`
const fmtD = (d: string) => (d ? new Date(d).toLocaleDateString('he-IL') : '')

export default function ReportBuilder() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  // filters
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [home, setHome] = useState('all')
  const [cardStatus, setCardStatus] = useState('all')
  const [birthStatus, setBirthStatus] = useState('all')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [onlyBilled, setOnlyBilled] = useState(false)

  useEffect(() => {
    fetch('/api/admin/reports/maternity')
      .then(r => r.json())
      .then(d => { if (d.rows) setRows(d.rows); else setErr(d.error || 'שגיאה') })
      .catch(() => setErr('שגיאת רשת'))
      .finally(() => setLoading(false))
  }, [])

  const homes = useMemo(() => [...new Set(rows.map(r => r.recoveryHome).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => {
    const fromT = from ? new Date(from).getTime() : 0
    const toT = to ? new Date(to).getTime() + 86400000 : Infinity
    const min = minAmount ? Number(minAmount) : -Infinity
    const max = maxAmount ? Number(maxAmount) : Infinity
    return rows.filter(r => {
      const bt = r.birthDate ? new Date(r.birthDate).getTime() : 0
      if (r.birthDate && (bt < fromT || bt >= toT)) return false
      if (!r.birthDate && (from || to)) return false
      if (home !== 'all' && r.recoveryHome !== home) return false
      if (cardStatus !== 'all' && (r.cardStatus || 'pending') !== cardStatus) return false
      if (birthStatus !== 'all' && r.status !== birthStatus) return false
      if (onlyBilled && r.recoveryAmount == null) return false
      const amt = Number(r.recoveryAmount) || 0
      if (r.recoveryAmount != null && (amt < min || amt > max)) return false
      if (r.recoveryAmount == null && (minAmount || maxAmount)) return false
      return true
    })
  }, [rows, from, to, home, cardStatus, birthStatus, minAmount, maxAmount, onlyBilled])

  const totals = useMemo(() => ({
    count: filtered.length,
    amount: filtered.reduce((s, r) => s + (Number(r.recoveryAmount) || 0), 0),
    nights: filtered.reduce((s, r) => s + (Number(r.recoveryNights) || 0), 0),
    balance: filtered.reduce((s, r) => s + (Number(r.cardBalance) || 0), 0),
  }), [filtered])

  function exportCsv() {
    const headers = ['שם היולדת', 'ת.ז', 'עיר', 'תינוק', 'תאריך לידה', 'סטטוס לידה', 'בית החלמה', 'הגעה', 'סכום שמומש', 'לילות', 'סטטוס כרטיס', 'יתרת כרטיס']
    const lines = filtered.map(r => [
      r.motherName, r.motherId, r.city, r.babyName, fmtD(r.birthDate),
      BIRTH_STATUS[r.status] ?? r.status, r.recoveryHome,
      r.arrived === true ? 'הגיעה' : r.arrived === false ? 'לא הגיעה' : '',
      r.recoveryAmount != null ? r.recoveryAmount : '', r.recoveryNights ?? '',
      CARD_STATUS[r.cardStatus] ?? r.cardStatus, r.cardBalance ?? 0,
    ])
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const csv = '﻿' + [headers, ...lines].map(row => row.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `דוח-יולדות-${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FileBarChart size={18} className="text-indigo-600" />
          <h2 className="font-semibold text-slate-900">בונה דוחות — יולדות</h2>
        </div>
        <button onClick={exportCsv} disabled={loading || filtered.length === 0}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          <Download size={16} /> הורד דוח (CSV)
        </button>
      </div>

      {/* filters */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3" dir="rtl">
        <label className="flex flex-col gap-1 text-xs text-slate-500">מתאריך (לידה)
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={selCls} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">עד תאריך
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={selCls} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">בית החלמה
          <select value={home} onChange={e => setHome(e.target.value)} className={selCls}>
            <option value="all">הכל</option>
            {homes.map(h => <option key={h} value={h}>{h}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">סטטוס כרטיס
          <select value={cardStatus} onChange={e => setCardStatus(e.target.value)} className={selCls}>
            <option value="all">הכל</option>
            {Object.entries(CARD_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">סטטוס לידה
          <select value={birthStatus} onChange={e => setBirthStatus(e.target.value)} className={selCls}>
            <option value="all">הכל</option>
            {Object.entries(BIRTH_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">סכום מ-
          <input value={minAmount} onChange={e => setMinAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={selCls} dir="ltr" /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">סכום עד
          <input value={maxAmount} onChange={e => setMaxAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={selCls} dir="ltr" /></label>
        <label className="flex items-center gap-2 text-sm text-slate-600 self-end pb-2">
          <input type="checkbox" checked={onlyBilled} onChange={e => setOnlyBilled(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          רק עם חיוב שבוצע
        </label>
      </div>

      {/* totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 pb-4">
        {[
          { label: 'מספר יולדות', value: String(totals.count), cls: 'text-slate-700 bg-slate-50 border-slate-100' },
          { label: 'סה״כ חויב', value: ils(totals.amount), cls: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
          { label: 'סה״כ לילות', value: totals.nights.toLocaleString('he-IL'), cls: 'text-indigo-700 bg-indigo-50 border-indigo-100' },
          { label: 'יתרת כרטיסים', value: ils(totals.balance), cls: 'text-amber-700 bg-amber-50 border-amber-100' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.cls}`}>
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className="text-lg font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* table */}
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto border-t border-slate-100">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm"><Loader2 size={18} className="animate-spin" /> טוען…</div>
        ) : err ? (
          <div className="py-12 text-center text-red-600 text-sm">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">אין תוצאות בסינון זה</div>
        ) : (
          <table className="w-full text-sm text-right">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                {['שם היולדת', 'ת.ז', 'תינוק', 'תאריך לידה', 'בית החלמה', 'הגעה', 'סכום שמומש', 'לילות', 'סטטוס כרטיס'].map(h => (
                  <th key={h} className="px-3 py-2.5 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{r.motherName}</td>
                  <td className="px-3 py-2 text-slate-500 ltr-num text-right">{r.motherId || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{r.babyName || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 ltr-num text-right">{fmtD(r.birthDate) || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{r.recoveryHome || '—'}</td>
                  <td className="px-3 py-2">{r.arrived === true ? '✓' : r.arrived === false ? '✗' : '—'}</td>
                  <td className="px-3 py-2 font-semibold text-emerald-700">{r.recoveryAmount != null ? ils(r.recoveryAmount) : '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{r.recoveryNights ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{CARD_STATUS[r.cardStatus] ?? r.cardStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
