'use client'
import { useCallback, useEffect, useState } from 'react'
import { monthRange } from '@/lib/centerMonthlyHistory'
import { Loader2, Save, CheckCircle2, Clock, CircleDashed } from 'lucide-react'

// טעינה חודשית למוקדים בטלפון: טלפון מורשה לכל מוקד, כרטיס משויך, מצב החודש והיסטוריה.

interface Load { month: string; amount: number; status: string; loaded_at: string | null; created_at: string; balance: number | null }
interface Row {
  id: string; name: string; phone: string; id_number: string; card_number: string | null
  nedarim: 'linked' | 'none' | 'multiple' | 'no_phone' | 'error'
  thisMonth: 'none' | 'pending' | 'loaded'; history: Load[]
}
interface Data { month: string; amount: number; centers: Row[] }

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const monthName = (k: string) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`
const fullDate = (d: string) => {
  const t = new Date(d)
  return `${t.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })} · ${t.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })}`
}
function HistoryModal({ c, month, onClose }: { c: Row; month: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const loaded = c.history.filter((h) => h.status === 'loaded')
  const total = loaded.reduce((a, h) => a + h.amount, 0)
  const last = [...loaded].sort((a, b) => b.month.localeCompare(a.month))[0]
  const months = monthRange(c.history.map((h) => h.month), month)
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#14213D]/35 backdrop-blur-[6px] sm:p-4" onClick={onClose} dir="rtl">
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[640px] max-h-[92vh] sm:max-h-[88vh] overflow-auto bg-[#FFFDF8] rounded-t-xl sm:rounded-xl border-t-4 border-[#C0912F] p-4 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-extrabold leading-tight text-[#1B2338] text-balance">{c.name}</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-[13px] text-[#6B6352]">
              <span>טלפון <b dir="ltr" className="font-medium text-[#1B2338]">{c.phone || '—'}</b></span>
              <span>צד ג' <b dir="ltr" className="font-medium text-[#1B2338]">{c.id_number || '—'}</b></span>
              <span>כרטיס <b dir="ltr" className="font-medium text-[#1B2338]">{c.card_number ? `•••• ${c.card_number.slice(-4)}` : '—'}</b></span>
            </div>
          </div>
          <button aria-label="סגירה" onClick={onClose} className="w-9 h-9 rounded-full grid place-items-center text-xl text-[#6B6352] hover:bg-black/5 shrink-0">×</button>
        </div>
        <div className="grid grid-cols-3 gap-4 py-4 my-4 border-y border-[#E6DFCF]">
          <div><span className="text-xs text-[#6B6352]">סה"כ נטען</span><strong className="block text-2xl font-extrabold text-[#8A6316] tabular-nums">{ils(total)}</strong></div>
          <div><span className="text-xs text-[#6B6352]">חודשים שנטענו</span><strong className="block text-2xl font-extrabold tabular-nums">{loaded.length}</strong></div>
          <div><span className="text-xs text-[#6B6352]">יתרה עכשיו</span><strong className="block text-2xl font-extrabold tabular-nums">{last?.balance == null ? '—' : ils(last.balance)}</strong></div>
        </div>
        {months.length === 0 ? (
          <p className="py-4 text-sm text-[#6B6352]">עוד לא הייתה טעינה למוקד הזה. כשיוגדר טלפון ותימצא המשפחה בנדרים, הטעינות יופיעו כאן.</p>
        ) : (
          <ul>
            {months.map((k) => {
              const h = c.history.find((x) => x.month === k)
              const ok = h?.status === 'loaded'
              return (
                <li key={k} className={`grid grid-cols-[104px_1fr_auto_auto] gap-x-4 gap-y-1 items-center py-3 border-b border-[#E6DFCF] last:border-0 ${h ? '' : 'text-[#958C78]'}`}>
                  <div className="font-bold">{monthName(k)}</div>
                  <div className="text-[13px] text-[#6B6352] tabular-nums">
                    {ok ? fullDate(h!.loaded_at ?? h!.created_at) : h ? `התחיל ${fullDate(h.created_at)}` : k === month ? 'ממתין לשיחה מהמוקד' : 'דולג'}
                  </div>
                  <div className="font-bold min-w-[70px] text-end tabular-nums">
                    {ok ? ils(h!.amount) : h
                      ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#F7E7C6] text-[#8A5A12]">בטיפול</span>
                      : k === month ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#EFEBE2] text-[#6B6352]">עוד לא נטען</span>
                      : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#F6E1DC] text-[#9A3B2E]">לא נטען</span>}
                  </div>
                  <div className="text-xs text-[#6B6352] min-w-[84px] text-end tabular-nums">{ok && h!.balance != null ? `יתרה ${ils(h!.balance)}` : ''}</div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex justify-between items-center mt-4 text-xs text-[#958C78]">
          <span>הטעינות נרשמות אוטומטית מהשיחה בטלפון</span>
          <button onClick={onClose} className="px-3.5 py-2 rounded-md text-[13px] font-medium border border-[#D9CFB9] bg-white text-[#1B2338]">סגירה</button>
        </div>
      </div>
    </div>
  )
}

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
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState('')
  const [selMonth, setSelMonth] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/center-monthly', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'שגיאה בטעינה')
      setData(d); setAmount(String(d.amount)); setErr('')
      setEdits(Object.fromEntries((d.centers as Row[]).map((c) => [c.id, c.phone])))
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

  const months = Array.from(new Set([data.month, ...data.centers.flatMap((c) => c.history.map((h) => h.month))])).sort().reverse().slice(0, 12)
  const mon = selMonth || data.month
  const dash = data.centers.map((c) => ({ c, l: c.history.find((h) => h.month === mon && h.status === 'loaded') }))
  const loadedRows = dash.filter((x) => x.l)
  const totalLoaded = loadedRows.reduce((a, x) => a + (x.l?.amount ?? 0), 0)
  const totalBalance = loadedRows.reduce((a, x) => a + (x.l?.balance ?? 0), 0)
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

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-800">לוח חודשי</h3>
          <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm" value={mon} onChange={(e) => setSelMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[['נטענו', String(loadedRows.length)], ['לא נטענו', String(dash.length - loadedRows.length)], ['סך שנטען', ils(totalLoaded)], ['סך יתרה', ils(totalBalance)]].map(([k, v]) => (
            <div key={k} className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-xl font-semibold text-slate-800">{v}</div></div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-right"><th className="py-1 font-medium">מוקד</th><th className="font-medium">מצב</th><th className="font-medium">נטען ב</th><th className="font-medium">סכום</th><th className="font-medium">יתרה</th></tr></thead>
            <tbody>
              {dash.map(({ c, l }) => (
                <tr key={c.id} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50" tabIndex={0} onClick={() => setOpen(c.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(c.id)}>
                  <td className="py-1.5">{c.name}</td>
                  <td>{l ? <span className="text-emerald-700">נטען</span> : <span className="text-slate-500">לא נטען</span>}</td>
                  <td>{l ? fmt(l.loaded_at ?? l.created_at) : '—'}</td>
                  <td>{l ? ils(l.amount) : '—'}</td>
                  <td>{l ? (l.balance == null ? 'אין נתון' : ils(l.balance)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex flex-col gap-3">
        {data.centers.map((c) => {
          const e = edits[c.id] ?? ''
          const dirty = e !== c.phone
          return (
            <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button className="font-semibold text-slate-800 text-right hover:underline" onClick={() => setOpen(c.id)}>{c.name}</button>
                <StatusBadge s={c.thisMonth} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">טלפון מורשה (ריק = הסרה)</label>
                  <input className={input} dir="ltr" inputMode="tel" value={e} placeholder="05XXXXXXXX"
                    onChange={(ev) => setEdits({ ...edits, [c.id]: ev.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מזהה צד ג' (נדרים)</label>
                  <div className="h-[38px] flex items-center text-sm">
                    {c.nedarim === 'linked' ? <span dir="ltr" className="text-slate-700">{c.id_number || 'אין מזהה צד ג\' בכרטסת'}</span>
                      : c.nedarim === 'multiple' ? <span className="text-amber-700">כמה משפחות באותו טלפון, נדרש טיפול ידני</span>
                      : c.nedarim === 'none' ? <span className="text-slate-500">לא נמצאה משפחה בנדרים</span>
                      : c.nedarim === 'error' ? <span className="text-red-600">שגיאה במשיכה מנדרים</span>
                      : <span className="text-slate-400">יש להזין טלפון</span>}
                  </div>
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
                <button className="text-sm text-slate-600 underline" onClick={() => setOpen(c.id)}>
                  היסטוריית טעינות ({c.history.length})
                </button>
                <button disabled={!dirty || busy === c.id} onClick={() => patch(c.id, { center_id: c.id, phone: e }, 'נשמר')}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40">
                  {busy === c.id ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} שמירה
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {open && data.centers.find((c) => c.id === open) && (
        <HistoryModal c={data.centers.find((c) => c.id === open)!} month={data.month} onClose={() => setOpen('')} />
      )}
    </div>
  )
}
