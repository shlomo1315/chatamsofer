'use client'

import { useState } from 'react'
import { Globe, Mail, FileImage, Check, X, Download, Loader2, Send, CheckCircle2 } from 'lucide-react'

export interface GratitudeRow {
  id: string
  maternity_aid_id: string
  source: 'web' | 'email' | 'scan'
  body: string | null
  signature: string | null
  is_anonymous: boolean
  scan_url: string | null
  status: 'received' | 'approved' | 'rejected'
  sent_to_donor_at: string | null
  sent_to_donor_email: string | null
  created_at: string
  aid: {
    birth_date?: string | null
    recovery_home?: string | null
    beneficiary?: { family_name?: string | null; spouse_name?: string | null; full_name?: string | null; email?: string | null } | null
  } | null
}

function motherEmailOf(row: GratitudeRow): string {
  return (row.aid?.beneficiary?.email ?? '').trim()
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
  // בחירה לשליחה מרוכזת + חלונית שליחה (בודדת או מרוכזת)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sendModal, setSendModal] = useState<{ ids: string[]; email: string } | null>(null)
  const [sending, setSending] = useState(false)

  const filtered = statusFilter === 'all' ? items : items.filter(r => r.status === statusFilter)
  // ניתן לשלוח רק מכתבים שאושרו
  const selectableIds = filtered.filter(r => r.status === 'approved').map(r => r.id)

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(prev => (prev.size === selectableIds.length ? new Set() : new Set(selectableIds)))
  }

  // פותח את חלונית השליחה — לברכה בודדת או למרוכזת. ברירת מחדל לכתובת: מייל היולדת (בודדת).
  function openSend(ids: string[]) {
    const defaultEmail = ids.length === 1 ? motherEmailOf(items.find(r => r.id === ids[0]) ?? {} as GratitudeRow) : ''
    setSendModal({ ids, email: defaultEmail })
  }

  async function confirmSend() {
    if (!sendModal) return
    const { ids, email } = sendModal
    setSending(true)
    try {
      const isBulk = ids.length > 1
      const url = isBulk ? '/api/admin/gratitude/send-bulk' : `/api/admin/gratitude/${ids[0]}/send`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isBulk ? { ids, email } : { email }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'שליחה נכשלה'); return }
      const sentAt = d.sentAt ?? new Date().toISOString()
      // עדכון סטטוס מקומי לכל מה שנשלח בפועל (בבודדת — כולם; במרוכזת — לפי מה ששרת עדכן, אך
      // כאן מסמנים את הנבחרים שהיו approved; שרת דילג על שנשלחו לאותה כתובת)
      const sentIds = new Set(ids)
      setItems(prev => prev.map(r => (sentIds.has(r.id) && r.status === 'approved'
        ? { ...r, sent_to_donor_at: sentAt, sent_to_donor_email: email } : r)))
      setSendModal(null)
      setSelected(new Set())
      if (isBulk) alert(`נשלחו ${d.sent}, דילוג ${d.skipped}${d.failed ? `, נכשלו ${d.failed}` : ''}`)
    } finally {
      setSending(false)
    }
  }

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
      {/* סינון + שליחה מרוכזת */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
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
        <div className="flex-1" />
        <button
          onClick={() => openSend([...selected])}
          disabled={selected.size === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition
                     bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={14} /> שליחה מרוכזת לנדיב{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
      </div>

      {/* טבלה */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-right text-xs text-slate-500">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectableIds.length > 0 && selected.size === selectableIds.length}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  title="בחר הכל (מאושרים)"
                  className="accent-pink-600 cursor-pointer disabled:cursor-not-allowed"
                />
              </th>
              <th className="px-4 py-3 font-semibold">תאריך</th>
              <th className="px-4 py-3 font-semibold">שם היולדת</th>
              <th className="px-4 py-3 font-semibold">מקור</th>
              <th className="px-4 py-3 font-semibold">הברכה</th>
              <th className="px-4 py-3 font-semibold">סטטוס</th>
              <th className="px-4 py-3 font-semibold">נשלח לנדיב</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(row => {
              const meta = SOURCE_META[row.source]
              const Icon = meta.icon
              const canSend = row.status === 'approved'
              return (
                <tr
                  key={row.id}
                  onClick={() => { setOpen(row); setPdf(null) }}
                  className="hover:bg-slate-50 cursor-pointer transition"
                >
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                      disabled={!canSend}
                      title={canSend ? '' : 'ניתן לשלוח רק ברכה שאושרה'}
                      className="accent-pink-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                    />
                  </td>
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
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {row.sent_to_donor_at ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle2 size={13} /> {fmtDate(row.sent_to_donor_at)}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {canSend && (
                      <button
                        onClick={() => openSend([row.id])}
                        title="שליחת הברכה לנדיב במייל"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                                   bg-white border border-pink-200 text-pink-600 hover:bg-pink-50 transition whitespace-nowrap"
                      >
                        <Send size={13} /> שלח
                      </button>
                    )}
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
                {open.status === 'approved' && (
                  <button
                    onClick={() => openSend([open.id])}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pink-600 text-white text-sm font-semibold
                               hover:bg-pink-700 transition"
                  >
                    <Send size={16} /> שלח לנדיב
                  </button>
                )}
              </div>
              {open.sent_to_donor_at && (
                <p className="mt-3 text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={13} /> נשלח לנדיב ב-{fmtDate(open.sent_to_donor_at)}
                  {open.sent_to_donor_email ? ` · ${open.sent_to_donor_email}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* חלונית שליחה לנדיב — בודדת או מרוכזת */}
      {sendModal && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-[60] flex items-center justify-center p-4"
          onClick={() => !sending && setSendModal(null)}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Send size={18} className="text-pink-600" />
              <h2 className="font-bold text-slate-800">
                {sendModal.ids.length > 1 ? `שליחת ${sendModal.ids.length} ברכות לנדיב` : 'שליחת ברכה לנדיב'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              המכתב יישלח כקובץ PDF מעוצב, מאגף עזר ליולדות, לכתובת שתבחר.
            </p>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">כתובת המייל של הנדיב</label>
            <input
              type="email"
              dir="ltr"
              value={sendModal.email}
              onChange={e => setSendModal(m => (m ? { ...m, email: e.target.value } : m))}
              placeholder="donor@example.com"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm mb-5
                         focus:outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-400"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setSendModal(null)}
                disabled={sending}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                ביטול
              </button>
              <button
                onClick={confirmSend}
                disabled={sending || !sendModal.email.trim()}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-pink-600 text-white text-sm font-semibold
                           hover:bg-pink-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? 'שולח…' : 'שלח'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
