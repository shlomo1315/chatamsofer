'use client'
import { useState } from 'react'
import { Loader2, FileText, Send, Check, X, Eye } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// שליחת שוברי החגים.
//
// 🔴 תצוגה מקדימה לפני הכול: השובר נשלח לאלפי משפחות, וטעות עיצוב
// שמתגלה אצל הנמענים אי אפשר להחזיר.
//
// ⚠️ נשלח רק למי שבחר מוקד — השובר כולו בנוי סביב המוקד.
// ─────────────────────────────────────────────────────────────────────────────

interface Stats {
  withCenter: number
  sendable: number
  alreadySent: number
  noEmail: number
}

const fmt = (n: number) => new Intl.NumberFormat('he-IL').format(n)

export default function SendVouchersPanel({ distributionId }: { distributionId: string }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  async function check() {
    setBusy(true); setErr(''); setDone('')
    try {
      const res = await fetch(`/api/admin/holiday-voucher/send?distribution_id=${encodeURIComponent(distributionId)}`,
        { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'הבדיקה נכשלה'); return }
      setStats(d)
    } catch { setErr('שגיאת רשת') } finally { setBusy(false) }
  }

  async function send() {
    if (!stats) return
    if (!confirm(`לשלוח ${fmt(stats.sendable)} שוברים במייל?`)) return

    setBusy(true); setErr(''); setDone('')
    try {
      const res = await fetch('/api/admin/holiday-voucher/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribution_id: distributionId, confirm: true }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'השליחה נכשלה'); return }
      setDone(`${fmt(d.sent ?? 0)} שוברים נשלחו` + (d.failed ? ` · ${fmt(d.failed)} נכשלו` : ''))
      setStats(null)
    } catch { setErr('שגיאת רשת') } finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-extrabold text-indigo-900">
        <FileText size={15} /> שוברי החלוקה
      </h3>
      <p className="mb-3 text-[11px] text-slate-500">
        השובר כולל את המוקד שנבחר, הכתובת והשעות.
        <strong className="text-slate-700"> נשלח רק למי שבחר מוקד.</strong>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {/* 🔴 לראות לפני ששולחים. */}
        <a href="/api/admin/holiday-voucher/preview" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-white px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50">
          <Eye size={13} /> תצוגה מקדימה של השובר
        </a>
        <button type="button" onClick={check} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          {busy && !stats ? <Loader2 size={13} className="animate-spin" /> : null}
          בדיקה לפני שליחה
        </button>
      </div>

      {stats && (
        <div className="mt-3 rounded-xl border border-indigo-300 bg-white p-3.5">
          <p className="text-sm text-slate-700">
            יישלחו <strong className="text-indigo-800">{fmt(stats.sendable)}</strong> שוברים
          </p>
          <ul className="my-2 flex flex-col gap-0.5 text-[11px] text-slate-500">
            <li>· {fmt(stats.withCenter)} משפחות בחרו מוקד</li>
            {stats.alreadySent > 0 && <li>· {fmt(stats.alreadySent)} כבר קיבלו ולא יקבלו שוב</li>}
            {stats.noEmail > 0 && (
              <li className="text-amber-700">· {fmt(stats.noEmail)} בלי כתובת מייל — לא יקבלו</li>
            )}
          </ul>

          {stats.sendable > 0 ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={send} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-40">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                שלח {fmt(stats.sendable)} שוברים
              </button>
              <button type="button" onClick={() => setStats(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700">ביטול</button>
            </div>
          ) : (
            <p className="text-xs font-semibold text-slate-500">אין שוברים לשליחה</p>
          )}
        </div>
      )}

      {done && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <Check size={15} /> {done}
        </p>
      )}
      {err && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <X size={15} /> {err}
        </p>
      )}
    </div>
  )
}
