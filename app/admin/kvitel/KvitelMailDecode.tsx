'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { decodeKvitelPayload, type KvitelScrambled } from '@/lib/kvitelPayload'
import type { KvitelMailDecode as Decode } from '@/lib/kvitelMailDecode'

// עמודת "הפיענוח" בלשונית המייל של הקוויטלעך: מה נקלט מהמייל שנבחר (שם, בן/בת, שם האם, בקשה).
// הנתונים מגיעים מעורבלים מ-/api/admin/kvitel/mail-decode, בגלל נטפרי.

type State = { mailId: string; data: Decode | null; error: string | null }

export default function KvitelMailDecode({ mailId }: { mailId: string }) {
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/kvitel/mail-decode?id=${encodeURIComponent(mailId)}`, { cache: 'no-store' })
      .then(async res => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error || 'טעינת הפיענוח נכשלה')
        return decodeKvitelPayload<Decode>(body as KvitelScrambled)
      })
      .then(data => { if (alive) setState({ mailId, data, error: null }) })
      .catch((e: Error) => { if (alive) setState({ mailId, data: null, error: e.message }) })
    return () => { alive = false }
  }, [mailId])

  if (!state || state.mailId !== mailId) {
    return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> טוען פיענוח...</div>
  }
  if (state.error || !state.data) {
    return <p className="m-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{state.error}</p>
  }

  const d = state.data
  return (
    <div className="space-y-4 p-4 text-sm">
      <p className="flex items-center gap-2 text-slate-600">
        {d.source === 'saved'
          ? <><CheckCircle2 size={16} className="text-emerald-600" /> נקלט כבקשה · {d.status}</>
          : <><AlertTriangle size={16} className="text-amber-600" /> המייל עוד לא נקלט כבקשה: פענוח לפי תבנית</>}
      </p>
      {d.note && <p className="text-xs text-slate-500">{d.note}</p>}

      {d.failed && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 font-medium text-red-800">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" /> {d.failed}
        </div>
      )}

      {d.lines.length > 0 && (
        <table className="w-full border-collapse overflow-hidden rounded-lg bg-white text-right">
          <thead className="bg-slate-100 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">שם</th>
              <th className="px-3 py-2 font-semibold">בן/בת</th>
              <th className="px-3 py-2 font-semibold">שם האם</th>
              <th className="px-3 py-2 font-semibold">בקשה</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i} className={`border-t border-slate-100 align-top ${l.flag ? 'bg-amber-50' : ''}`}>
                <td className="px-3 py-2 font-medium text-slate-900">{l.name}</td>
                <td className="px-3 py-2 text-slate-600">{l.relation}</td>
                <td className="px-3 py-2 text-slate-900">{l.parentName || <span className="text-red-600">חסר</span>}</td>
                <td className="px-3 py-2 text-slate-700">
                  {l.request || <span className="text-slate-400">לא צוינה</span>}
                  {l.flag && <span className="mt-1 block text-xs text-amber-700">{l.flag}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {d.leftover.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-slate-600">שורות שלא פוענחו</h4>
          <ul className="space-y-1 rounded-lg bg-white p-3 text-slate-700">
            {d.leftover.map((t, i) => <li key={i} className="whitespace-pre-wrap break-words">{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
