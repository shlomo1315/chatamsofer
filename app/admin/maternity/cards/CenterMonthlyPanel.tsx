'use client'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Save, CheckCircle2, Clock, CircleDashed } from 'lucide-react'

// טעינה חודשית למוקדים בטלפון: טלפון מורשה לכל מוקד, כרטיס משויך, מצב החודש והיסטוריה.

interface Load { month: string; amount: number; status: string; loaded_at: string | null; created_at: string }
interface Row {
  id: string; name: string; phone: string; id_number: string; card_number: string | null
  thisMonth: 'none' | 'pending' | 'loaded'; history: Load[]
}
interface Data { month: string; amount: number; centers: Row[] }

const ils = (n: number) => `₪${n.toLocaleString('he-IL')}`
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')

function StatusBadge({ s }: { s: Row['thisMonth'] }) {
  if (s === 'loaded') return <span className="inline-flex items-center gap-1 text-emerald-700 text-sm"><CheckCircle2 size={15} /> נטען החודש</span>
  if (s === 'pending') return <span className="inline-flex items-center gap-1 text-amber-700 text-sm"><Clock size={15} /> בטיפול / תקוע</span>
  return <span className="inline-flex items-center gap-1 text-slate-500 text-sm"><CircleDashed size={15} /> עוד לא נטען</span>
}

export default function CenterMonthlyPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [edits, setEdits] = useState<Record<string, { phone: string; id_number: string }>>({})
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/center-monthly', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'שגיאה בטעינה')
      setData(d); setAmount(String(d.amount)); setErr('')
      setEdits(Object.fromEntries((d.centers as Row[]).map((c) => [c.id, { phone: c.phone, id_number: c.id_number }])))
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה') }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const patch = async (key: string, body: Record<string, unknown>, okMsg: string) => {
    setBusy(key); setMsg(''); setErr('')
    try {
      const r = await fetch('/api/admin/center-monthly', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'שגיאה בשמירה')
      setMsg(okMsg); await load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה') }
    setBusy('')
  }

  if (!data) return <div className="p-8 text-center text-slate-500">{err || <Loader2 className="animate-spin inline" />}</div>

  const input = 'border border-slate-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500'
  return (
    <div className="flex flex-col gap-5 font-[Heebo]" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm text-slate-600 mb-1">סכום הטעינה החודשית (₪)</label>
          <input className={input + ' w-36'} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button disabled={busy === 'amount'} onClick={() => patch('amount', { amount }, 'הסכום נשמר')}
          className="inline-flex items-center gap-1.5 bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
          <Save size={15} /> שמירה
        </button>
        <p className="text-sm text-slate-500 me-auto">החודש הנוכחי: {data.month}. טעינה אחת לכל מוקד בחודש, והיא יורדת מהמלאי.</p>
      </div>

      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex flex-col gap-3">
        {data.centers.map((c) => {
          const e = edits[c.id] ?? { phone: '', id_number: '' }
          const dirty = e.phone !== c.phone || e.id_number !== c.id_number
          return (
            <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-800">{c.name}</h3>
                <StatusBadge s={c.thisMonth} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">טלפון מורשה (ריק = הסרה)</label>
                  <input className={input} dir="ltr" inputMode="tel" value={e.phone} placeholder="05XXXXXXXX"
                    onChange={(ev) => setEdits({ ...edits, [c.id]: { ...e, phone: ev.target.value } })} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">ת.ז. איש המוקד (להקמה בנדרים)</label>
                  <input className={input} dir="ltr" inputMode="numeric" value={e.id_number}
                    onChange={(ev) => setEdits({ ...edits, [c.id]: { ...e, id_number: ev.target.value } })} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">כרטיס משויך</label>
                  <div className="flex items-center gap-2 h-[38px]">
                    <span dir="ltr" className="text-sm text-slate-700">{c.card_number ? `•••• ${c.card_number.slice(-4)}` : 'עוד לא שויך'}</span>
                    {c.card_number && (
                      <button className="text-xs text-red-600 underline" disabled={busy === c.id}
                        onClick={() => confirm('לנקות את הכרטיס? המוקד יקיש כרטיס חדש בשיחה הבאה.') && patch(c.id, { center_id: c.id, clear_card: true }, 'הכרטיס נוקה')}>ניקוי</button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button className="text-sm text-slate-600 underline" onClick={() => setOpen(open === c.id ? '' : c.id)}>
                  היסטוריית טעינות ({c.history.length})
                </button>
                <button disabled={!dirty || busy === c.id} onClick={() => patch(c.id, { center_id: c.id, phone: e.phone, id_number: e.id_number }, 'נשמר')}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40">
                  {busy === c.id ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} שמירה
                </button>
              </div>
              {open === c.id && (
                <table className="w-full text-sm">
                  <thead><tr className="text-slate-500 text-right"><th className="py-1 font-medium">חודש</th><th className="font-medium">סכום</th><th className="font-medium">תאריך</th><th className="font-medium">מצב</th></tr></thead>
                  <tbody>
                    {c.history.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-400">אין טעינות עדיין</td></tr>}
                    {c.history.map((h) => (
                      <tr key={h.month} className="border-t border-slate-100">
                        <td className="py-1.5">{h.month}</td><td>{ils(h.amount)}</td><td>{fmt(h.loaded_at ?? h.created_at)}</td>
                        <td>{h.status === 'loaded' ? 'נטען' : 'בטיפול'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
