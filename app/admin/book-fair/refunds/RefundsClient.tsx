'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Check, Undo2, Phone, Mail, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { ilDateTime } from '@/lib/israelTime'
import { useCan } from '@/components/StaffPermissions'

// ─────────────────────────────────────────────────────────────────────────────
// רשימת הזיכויים — מי צריך לקבל כסף בחזרה, ומי כבר קיבל.
//
// 🔴 הזיכוי אינו אוטומטי: נדרים אינה מחזירה כסף דרך ה-API שלנו,
// וההחזר נעשה ידנית. המסך הזה הוא רשימת המשימות של מי שמבצע אותו.
//
// ⚠️ "ממתין" ראשון ובולט: זו הרשימה שפועלים לפיה. המטופלים נשארים
// למטה לתיעוד בלבד.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string
  amount_agorot: number
  reason: string | null
  note: string | null
  created_at: string
  settled_at: string | null
  settled_note: string | null
  order: {
    id: string
    order_number: string
    customer_name: string | null
    customer_phone: string | null
    customer_email: string | null
    total_agorot: number
    channel: string
  } | null
}

export default function RefundsClient() {
  const canEdit = useCan('book_fair', 'edit')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/book-fair/refunds', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'טעינת הרשימה נכשלה'); return }
      setRows(json.refunds ?? [])
    } catch {
      setError('טעינת הרשימה נכשלה — בדקו את החיבור')
    }
  }, [])

  // ⚠️ setTimeout(0) ולא קריאה ישירה: הכלל set-state-in-effect מסמן
  // גם טעינה אסינכרונית תקינה כמו זו, והדחייה מוציאה את העדכון
  // מה-effect בלי לשנות התנהגות.
  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  async function toggle(r: Row) {
    const undo = Boolean(r.settled_at)
    if (!undo) {
      const who = r.order?.customer_name || r.order?.order_number || 'הלקוח'
      if (!window.confirm(
        `לסמן ש-${fmtAgorot(r.amount_agorot)} הוחזרו ל${who}?\n\n` +
        'סמנו רק אחרי שהכסף הועבר בפועל.'
      )) return
    }

    setBusy(r.id)
    try {
      const res = await fetch('/api/admin/book-fair/refunds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, undo }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error ?? 'העדכון נכשל'); return }
      await load()
    } catch {
      alert('העדכון נכשל — בדקו את החיבור')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!rows) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> טוען…
      </div>
    )
  }

  const pending = rows.filter(r => !r.settled_at)
  const done = rows.filter(r => r.settled_at)
  const pendingTotal = pending.reduce((s, r) => s + r.amount_agorot, 0)

  return (
    <div className="flex flex-col gap-5">
      {/* ── סיכום ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="ממתינים לזיכוי" value={String(pending.length)} tone="amber" />
        <Stat label="סכום לזיכוי" value={fmtAgorot(pendingTotal)} tone="amber" />
        <Stat label="זוכו" value={String(done.length)} tone="emerald" />
      </div>

      {pending.length === 0 && done.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          אין זיכויים רשומים.
        </p>
      )}

      {/* ── ממתינים ── */}
      {pending.length > 0 && (
        <section className="rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle size={17} /> ממתינים לזיכוי
          </h2>
          <p className="mb-4 text-sm text-amber-800">
            הכסף טרם הוחזר. בצעו את ההעברה ואז סמנו &quot;זוכה&quot;.
          </p>
          <div className="flex flex-col gap-3">
            {pending.map(r => (
              <Card key={r.id} r={r} busy={busy === r.id} canEdit={canEdit} onToggle={() => toggle(r)} />
            ))}
          </div>
        </section>
      )}

      {/* ── שזוכו ── */}
      {done.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-700">
            <Check size={17} className="text-emerald-600" /> זוכו
          </h2>
          <div className="flex flex-col gap-3">
            {done.map(r => (
              <Card key={r.id} r={r} busy={busy === r.id} canEdit={canEdit} onToggle={() => toggle(r)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Card({ r, busy, canEdit, onToggle }: {
  r: Row; busy: boolean; canEdit: boolean; onToggle: () => void
}) {
  const settled = Boolean(r.settled_at)
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 ${
      settled ? 'border-slate-100 bg-slate-50/50' : 'border-amber-200 bg-white'
    }`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-lg font-bold ${settled ? 'text-slate-500' : 'text-amber-700'}`}>
            {fmtAgorot(r.amount_agorot)}
          </span>
          {r.order && (
            <Link
              href={`/admin/book-fair/orders/${r.order.id}`}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              הזמנה {r.order.order_number}
            </Link>
          )}
        </div>

        <div className="mt-1 text-sm text-slate-700">
          {r.order?.customer_name || '—'}
        </div>

        {/* 🔴 הטלפון לחיץ: זו הפעולה הראשונה של מי שמזכה. */}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          {r.order?.customer_phone && (
            <a href={`tel:${r.order.customer_phone}`}
               className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
              <Phone size={12} /> {r.order.customer_phone}
            </a>
          )}
          {r.order?.customer_email && (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Mail size={12} /> {r.order.customer_email}
            </span>
          )}
        </div>

        {(r.reason || r.note) && (
          <p className="mt-2 text-xs text-slate-500">
            {[r.reason, r.note].filter(Boolean).join(' — ')}
          </p>
        )}

        <p className="mt-1 text-xs text-slate-400">
          נרשם {ilDateTime(r.created_at)}
          {settled && ` · זוכה ${ilDateTime(r.settled_at!)}`}
        </p>
      </div>

      {canEdit && (
        <button
          onClick={onToggle}
          disabled={busy}
          className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
            settled
              ? 'border border-slate-200 text-slate-600 hover:bg-slate-100'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" />
            : settled ? <Undo2 size={14} /> : <Check size={14} />}
          {settled ? 'ביטול סימון' : 'הכסף הוחזר'}
        </button>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'emerald' }) {
  const cls = tone === 'amber'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return (
    <div className={`rounded-xl border-2 p-4 ${cls}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-0.5 text-xs font-medium">{label}</div>
    </div>
  )
}
