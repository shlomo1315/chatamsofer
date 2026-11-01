'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

type Purchase = { id: string; date: string; store: string; amount: number | null }
type Data = { available: boolean; balance: number | null; purchases: Purchase[] }

const money = (n: number) => `${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })} ₪`

// תנועות ויתרה עכשווית מנדרים (מנהל בלבד — ה-API מחזיר 403 לאחרים ואז לא מוצג דבר)
export default function CardActivity({ aidId }: { aidId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'hidden' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/maternity/${aidId}/card-activity`)
      .then(async r => {
        if (r.status === 401 || r.status === 403) { if (alive) setState('hidden'); return }
        if (!r.ok) throw new Error()
        const d = await r.json() as Data
        if (alive) { setData(d); setState('ok') }
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [aidId])

  if (state === 'hidden') return null
  if (state === 'loading') return <p className="mt-3 text-xs text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> טוען תנועות מנדרים…</p>
  if (state === 'error' || !data) return <p className="mt-3 text-xs text-amber-700">לא ניתן לטעון תנועות מנדרים כרגע</p>

  return (
    <div className="mt-3">
      <p className="text-sm"><span className="text-slate-500">יתרה עכשווית בנדרים: </span>
        <span className="font-semibold text-emerald-700 ltr-num">{data.balance != null ? money(data.balance) : '—'}</span></p>
      <p className="text-xs font-semibold text-slate-600 mt-2 mb-1">תנועות (קניות)</p>
      {data.purchases.length === 0 ? (
        <p className="text-xs text-slate-400">אין תנועות זמינות</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {data.purchases.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-100 rounded-lg px-3 py-1.5">
              <span className="text-slate-700 truncate">{p.store}</span>
              <span className="text-slate-400 ltr-num">{p.date}</span>
              <span className="font-medium text-slate-800 ltr-num">{p.amount != null ? money(p.amount) : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
