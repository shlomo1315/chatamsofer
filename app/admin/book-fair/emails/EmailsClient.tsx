'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Mail, Search, Send, Loader2, Check, X, Plus,
} from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'

// מיילים של היריד: מה נשלח, ושליחה חדשה מכתובת המחלקה
// (yerid@chasamsofer.info).

type Row = {
  id: string
  to_email: string | null
  subject: string | null
  sent_at: string | null
}

export default function EmailsClient() {
  const canSend = useCan('book_fair', 'edit')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  // ── חלון השליחה ──
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentOk, setSentOk] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await fetch(`/api/admin/book-fair/emails${q ? `?q=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'הטעינה נכשלה'); return }
      setRows(d.emails ?? [])
    } catch {
      setError('הטעינה נכשלה — בדקו את החיבור')
    }
  }, [q])

  // ⚠️ setTimeout(0) — כמו במסך הזיכויים: הכלל set-state-in-effect
  // מסמן גם טעינה אסינכרונית תקינה.
  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  async function send() {
    setError(''); setBusy(true)
    try {
      const res = await fetch('/api/admin/book-fair/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, text }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'השליחה נכשלה'); return }
      setSentOk(true)
      setTimeout(() => { setOpen(false); setSentOk(false); setTo(''); setSubject(''); setText('') }, 1200)
      void load()
    } catch {
      setError('השליחה נכשלה — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  const fmt = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${d.toLocaleDateString('he-IL')} · ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">מיילים</h1>
          <p className="text-sm text-slate-500">
            כל מה שנשלח מכתובת <span className="font-mono">yerid@chasamsofer.info</span>
          </p>
        </div>
        {canSend && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={16} /> מייל חדש
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="חיפוש לפי נושא או כתובת"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
      ) : !rows.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <Mail size={36} className="text-slate-300" />
          <p className="text-slate-500">{q ? 'לא נמצאו מיילים' : 'טרם נשלחו מיילים'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full table-fixed">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-3 py-3 text-right">נושא</th>
                <th className="w-56 px-3 py-3 text-right">אל</th>
                <th className="w-36 px-3 py-3 text-right">נשלח</th>
                <th className="w-24 px-3 py-3 text-right">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => (
                <tr key={r.id} className="text-sm hover:bg-slate-50">
                  <td className="truncate px-3 py-2.5" title={r.subject ?? ''}>{r.subject || '—'}</td>
                  <td className="truncate px-3 py-2.5 text-slate-600" dir="ltr" title={r.to_email ?? ''}>
                    {r.to_email || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{fmt(r.sent_at)}</td>
                  <td className="px-3 py-2.5">
                    {/* sent_emails מתעדת רק מייל שיצא בהצלחה — כישלון
                        שליחה מוצג מיד בחלון השליחה ולא נשמר כשורה. */}
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                      <Check size={13} /> נשלח
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── חלון שליחה ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-900">מייל חדש</h2>
              <button onClick={() => setOpen(false)} disabled={busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3 p-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">אל</span>
                <input value={to} onChange={e => setTo(e.target.value)} dir="ltr" className={INPUT} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">נושא</span>
                <input value={subject} onChange={e => setSubject(e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">תוכן</span>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={7} className={INPUT} />
              </label>
              <p className="text-xs text-slate-400">
                נשלח מ-<span className="font-mono">yerid@chasamsofer.info</span>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button onClick={() => setOpen(false)} disabled={busy} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
                ביטול
              </button>
              <button
                onClick={send}
                disabled={busy || !to.trim() || !subject.trim() || !text.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : sentOk ? <Check size={15} /> : <Send size={15} />}
                {sentOk ? 'נשלח' : 'שליחה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const INPUT = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
