'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RotateCcw, Ban } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

export interface UnsubRow {
  email: string
  name: string
  reason: string
  reasonLabel: string
  at: string
}

// צבע התג לפי סיבת ההסרה
const REASON_COLOR: Record<string, string> = {
  user:      'bg-slate-100 text-slate-600',
  manual:    'bg-slate-100 text-slate-600',
  complaint: 'bg-rose-100 text-rose-700',
  bounce:    'bg-amber-100 text-amber-700',
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function UnsubscribesTable() {
  const toast = useToast()
  const [rows, setRows] = useState<UnsubRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/newsletter/unsubscribes')
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'טעינה נכשלה')
      setRows(d.unsubscribes ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
      setRows([])
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  async function restore(email: string) {
    if (!confirm(`להחזיר את ${email} לרשימת התפוצה?\nהכתובת תקבל שוב דיוור.`)) return

    setBusy(email)
    try {
      const res = await fetch(`/api/admin/newsletter/unsubscribes?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'הפעולה נכשלה')
      toast.success(`${email} הוחזר/ה לרשימת התפוצה`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(null)
    }
  }

  if (rows === null) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16">
        <Loader2 size={20} className="animate-spin text-slate-300" />
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center">
        <Ban size={26} className="mx-auto mb-3 text-slate-300" />
        <p className="font-semibold text-slate-600">אף אחד לא ביקש להיות מוסר 🎉</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-right text-xs text-slate-500">
            <th className="px-4 py-3 font-semibold">שם</th>
            <th className="px-4 py-3 font-semibold">מייל</th>
            <th className="px-4 py-3 font-semibold">סיבה</th>
            <th className="px-4 py-3 font-semibold">תאריך</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => {
            const isBusy = busy === r.email
            return (
              <tr key={r.email} className={`transition hover:bg-slate-50 ${isBusy ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-semibold text-slate-800">
                  {r.name || <span className="font-normal text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-slate-600" dir="ltr">
                  <span className="block text-right">{r.email}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    REASON_COLOR[r.reason] ?? 'bg-slate-100 text-slate-600'
                  }`}>
                    {r.reasonLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{fmt(r.at)}</td>
                <td className="px-4 py-3 text-left">
                  <button
                    type="button"
                    onClick={() => restore(r.email)}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5
                               text-xs font-semibold text-slate-600 transition hover:border-indigo-300
                               hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
                  >
                    {isBusy
                      ? <Loader2 size={13} className="animate-spin" />
                      : <RotateCcw size={13} />}
                    החזר לרשימה
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
