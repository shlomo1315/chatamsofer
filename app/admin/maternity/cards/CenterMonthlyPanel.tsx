'use client'
import { useCallback, useEffect, useState } from 'react'
import { monthRange } from '@/lib/centerMonthlyHistory'
import { Loader2, Save, Search } from 'lucide-react'

// טעינה חודשית למוקדים בטלפון: טלפון מורשה לכל מוקד, כרטיס משויך, מצב החודש והיסטוריה.

interface Load { month: string; expires_at?: string | null; amount: number; status: string; loaded_at: string | null; created_at: string; balance: number | null }
interface Row {
  id: string; name: string; phone: string; id_number: string; card_number: string | null
  nedarim: 'linked' | 'none' | 'multiple' | 'no_phone' | 'error'
  thisMonth: 'none' | 'pending' | 'loaded'; history: Load[]
}
interface Data { month: string; amount: number; limitedId: string; centers: Row[] }

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
              <span>צד ג&apos; <b dir="ltr" className="font-medium text-[#1B2338]">{c.id_number || '—'}</b></span>
              <span>כרטיס <b dir="ltr" className="font-medium text-[#1B2338]">{c.card_number ? `•••• ${c.card_number.slice(-4)}` : '—'}</b></span>
            </div>
          </div>
          <button aria-label="סגירה" onClick={onClose} className="w-9 h-9 rounded-full grid place-items-center text-xl text-[#6B6352] hover:bg-black/5 shrink-0">×</button>
        </div>
        <div className="grid grid-cols-3 gap-4 py-4 my-4 border-y border-[#E6DFCF]">
          <div><span className="text-xs text-[#6B6352]">סה&quot;כ נטען</span><strong className="block text-2xl font-extrabold text-[#8A6316] tabular-nums">{ils(total)}</strong></div>
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
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—')

const PILL = {
  loaded: ['נטען', 'bg-emerald-50 text-emerald-800'],
  pending: ['בטיפול', 'bg-[#F7E7C6] text-[#8A5A12]'],
  none: ['עוד לא נטען', 'bg-[#EFEBE2] text-[#6B6352]'],
} as const

const HEADS: [string, boolean][] = [['מוקד', false], ['טלפון מורשה', false], ["צד ג' (נדרים)", true], ['כרטיס', false], ['סכום', true], ['חודש טעינה', true], ['סטטוס', false], ['יתרה', false], ['תוקף', true], ['', false]]
type Filter = 'all' | 'loaded' | 'none' | 'nocard'
type View = 'month' | 'grid'
const GRID_MONTHS = 6
// חודש לפי מיקום (0 = החדש): בנייד 2, בטאבלט 4, במסך רחב 6
const COL = (i: number) => (i < 2 ? '' : i < 4 ? 'hidden sm:table-cell' : 'hidden lg:table-cell')

// טבלת כל החודשים: מוקד בכל שורה, חודש בכל עמודה (החדש מימין), ובכל תא סטטוס, סכום ויתרה.
function MonthGrid({ rows, month, onOpen }: { rows: Row[]; month: string; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(0)
  const all = monthRange([month, ...rows.flatMap((c) => c.history.map((h) => h.month))], month)
  const months = all.slice(page * GRID_MONTHS, (page + 1) * GRID_MONTHS)
  const pages = Math.ceil(all.length / GRID_MONTHS)
  const sum = (k: string) => {
    const l = rows.map((c) => c.history.find((h) => h.month === k)).filter((h) => h?.status === 'loaded')
    return { n: l.length, total: l.reduce((a, h) => a + (h?.amount ?? 0), 0) }
  }
  const nav = 'px-2.5 py-1 rounded-md border border-[#D9CFB9] bg-white text-[13px] disabled:opacity-40'
  return (
    <div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-[#EFEBE2] text-[13px] text-[#6B6352]">
          <button className={nav} disabled={page === 0} onClick={() => setPage(page - 1)}>חודשים חדשים יותר</button>
          <button className={nav} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>חודשים קודמים</button>
        </div>
      )}
      <table className="w-full table-fixed text-sm">
        <thead className="text-right">
          <tr className="bg-[#14213D] text-white">
            <th className="w-[38%] sm:w-[24%] lg:w-[18%] px-3 py-2 font-medium">מוקד</th>
            {months.map((k, i) => <th key={k} className={`${COL(i)} px-2 py-2 font-medium`}>{monthName(k)}{k === month && <span className="block text-[11px] font-normal text-[#E5C77F]">החודש</span>}</th>)}
          </tr>
          <tr className="bg-[#F6F1E6] text-[12px] text-[#6B6352]">
            <th className="px-3 py-1.5 font-medium">נטענו</th>
            {months.map((k, i) => { const s = sum(k); return (
              <th key={k} className={`${COL(i)} px-2 py-1.5 font-medium tabular-nums`}><b className="text-[#1B2338]">{s.n}/{rows.length}</b><span className="block">{ils(s.total)}</span></th>
            ) })}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="cursor-pointer hover:bg-[#FFFDF8]" onClick={() => onOpen(c.id)}>
              <td className="border-t border-[#EFEBE2] px-3 py-2 font-bold break-words">{c.name}</td>
              {months.map((k, i) => {
                const h = c.history.find((x) => x.month === k)
                const ok = h?.status === 'loaded'
                return (
                  <td key={k} className={`${COL(i)} border-t border-[#EFEBE2] px-2 py-2 ${ok ? 'bg-emerald-50/60' : ''}`}>
                    {ok ? (
                      <><div className="font-bold text-emerald-800 tabular-nums">{ils(h!.amount)}</div>
                        <div className="text-[11px] text-[#6B6352] tabular-nums">{h!.balance == null ? fmt(h!.loaded_at ?? h!.created_at) : `יתרה ${ils(h!.balance)}`}</div></>
                    ) : h ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#F7E7C6] text-[#8A5A12]">בטיפול</span>
                      : k === month ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#EFEBE2] text-[#6B6352]">ממתין</span>
                      : <span className="text-xs text-[#9A3B2E]">לא נטען</span>}
                  </td>
                )
              })}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={months.length + 1} className="px-3 py-8 text-center text-[#6B6352]">אין מוקדים מתאימים</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export default function CenterMonthlyPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [amount, setAmount] = useState('')
  const [limitedId, setLimitedId] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<View>('month')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/center-monthly', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'שגיאה בטעינה')
      setData(d); setAmount(String(d.amount)); setLimitedId(d.limitedId ?? ''); setErr('')
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

  const rows = data.centers.map((c) => ({ c, cur: c.history.find((h) => h.month === data.month) }))
  const loadedRows = rows.filter((x) => x.cur?.status === 'loaded')
  const totalLoaded = loadedRows.reduce((a, x) => a + (x.cur?.amount ?? 0), 0)
  const totalBalance = loadedRows.reduce((a, x) => a + (x.cur?.balance ?? 0), 0)
  const shown = rows.filter(({ c, cur }) => {
    if (q && !`${c.name} ${c.phone} ${c.id_number}`.includes(q.trim())) return false
    if (filter === 'loaded') return cur?.status === 'loaded'
    if (filter === 'none') return cur?.status !== 'loaded'
    if (filter === 'nocard') return !c.card_number
    return true
  })
  const input = 'border border-[#D9CFB9] bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#14213D]/30'
  const kpis: [string, string][] = [
    ['נטענו החודש', `${loadedRows.length} מתוך ${rows.length}`], ['עוד לא נטענו', String(rows.length - loadedRows.length)],
    ['סך שנטען', ils(totalLoaded)], ['סך יתרה', ils(totalBalance)],
  ]
  return (
    <div className="flex flex-col gap-4 font-[Heebo] text-[#1B2338]" dir="rtl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(([k, v]) => (
          <div key={k} className="bg-white border border-[#E6DFCF] border-t-[3px] border-t-[#14213D] rounded-lg p-3">
            <div className="text-xs text-[#6B6352]">{k}</div><div className="text-2xl font-extrabold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#E6DFCF] rounded-lg p-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <label className="block text-xs text-[#6B6352] mb-1">סכום טעינה חודשית (₪)</label>
          <div className="flex gap-2">
            <input className={input + ' w-28'} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button disabled={busy === 'amount' || amount === String(data.amount)} onClick={() => patch('amount', { amount }, 'הסכום נשמר')}
              className="inline-flex items-center gap-1 bg-[#14213D] text-white rounded-md px-3 text-sm disabled:opacity-40"><Save size={14} /> שמירה</button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-[#6B6352] mb-1">קבוצת הגבלת חנויות בנדרים (ריק = בלי הגבלה)</label>
          <div className="flex gap-2">
            <input className={input + ' w-28'} dir="ltr" inputMode="numeric" value={limitedId} placeholder="ללא" onChange={(e) => setLimitedId(e.target.value)} />
            <button disabled={busy === 'limited' || limitedId === data.limitedId} onClick={() => patch('limited', { limitedId }, 'הקבוצה נשמרה')}
              className="inline-flex items-center gap-1 bg-[#14213D] text-white rounded-md px-3 text-sm disabled:opacity-40"><Save size={14} /> שמירה</button>
          </div>
        </div>
        <p className="text-xs text-[#6B6352] me-auto max-w-sm">טעינה אחת לכל מוקד בחודש, בתוקף חודשיים מיום הטעינה, ויורדת מהמלאי. חודש נוכחי: {monthName(data.month)}.</p>
      </div>

      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="bg-white border border-[#E6DFCF] rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[#E6DFCF]">
          <div className="flex rounded-md border border-[#D9CFB9] overflow-hidden" role="tablist">
            {([['month', 'החודש הנוכחי'], ['grid', 'כל החודשים']] as [View, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
                className={`px-3 py-1.5 text-sm font-medium ${view === k ? 'bg-[#14213D] text-white' : 'bg-white text-[#1B2338]'}`}>{l}</button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute top-2.5 start-2.5 text-[#958C78]" />
            <input className={input + ' ps-8 w-56'} placeholder="חיפוש מוקד, טלפון או צד ג'" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {([['all', 'הכול'], ['loaded', 'נטענו'], ['none', 'לא נטענו'], ['nocard', 'בלי כרטיס']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-full text-sm border ${filter === k ? 'bg-[#14213D] text-white border-[#14213D]' : 'border-[#D9CFB9] text-[#1B2338] bg-white'}`}>{l}</button>
          ))}
          <span className="text-xs text-[#6B6352] me-auto">{shown.length} מוקדים</span>
        </div>
        {view === 'grid' ? <MonthGrid rows={shown.map((x) => x.c)} month={data.month} onOpen={setOpen} /> : <div>
          <table className="w-full text-sm">
            <thead className="bg-[#14213D] text-white text-right">
              <tr>{HEADS.map(([h, hide]) => <th key={h} className={`px-3 py-2 font-medium whitespace-nowrap ${hide ? 'hidden xl:table-cell' : ''}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map(({ c, cur }) => {
                const e = edits[c.id] ?? ''
                const dirty = e !== c.phone
                const [label, cls] = PILL[cur?.status === 'loaded' ? 'loaded' : cur?.status === 'pending' ? 'pending' : 'none']
                return (
                  <tr key={c.id} className="border-t border-[#EFEBE2] hover:bg-[#FFFDF8]">
                    <td className="px-3 py-2"><button className="font-bold text-right hover:underline" onClick={() => setOpen(c.id)}>{c.name}</button></td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <input className={input + ' w-32'} dir="ltr" inputMode="tel" value={e} placeholder="05XXXXXXXX" aria-label={`טלפון ${c.name}`}
                          onChange={(ev) => setEdits({ ...edits, [c.id]: ev.target.value })}
                          onKeyDown={(ev) => ev.key === 'Enter' && dirty && patch(c.id, { center_id: c.id, phone: e }, 'נשמר')} />
                        {dirty && (
                          <button aria-label="שמירה" disabled={busy === c.id} onClick={() => patch(c.id, { center_id: c.id, phone: e }, 'נשמר')}
                            className="w-8 h-8 grid place-items-center rounded-md bg-[#14213D] text-white disabled:opacity-40">
                            {busy === c.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="hidden xl:table-cell px-3 py-2 text-[13px]" dir="ltr">
                      {c.nedarim === 'linked' ? (c.id_number || '—')
                        : c.nedarim === 'multiple' ? <span className="text-amber-700" dir="rtl">כמה משפחות</span>
                        : c.nedarim === 'error' ? <span className="text-red-600" dir="rtl">שגיאה</span>
                        : <span className="text-[#958C78]" dir="rtl">{c.nedarim === 'none' ? 'לא נמצא' : 'אין טלפון'}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span dir="ltr" className="tabular-nums">{c.card_number ? `•••• ${c.card_number.slice(-4)}` : <span className="text-[#958C78]" dir="rtl">לא שויך</span>}</span>
                      {c.card_number && (
                        <button className="ms-2 text-xs text-red-700 underline" disabled={busy === c.id}
                          onClick={() => confirm('לנקות את הכרטיס? המוקד יקיש כרטיס חדש בשיחה הבאה.') && patch(c.id, { center_id: c.id, clear_card: true }, 'הכרטיס נוקה')}>ניקוי</button>
                      )}
                    </td>
                    <td className="hidden xl:table-cell px-3 py-2 tabular-nums">{cur ? ils(cur.amount) : ils(data.amount)}</td>
                    <td className="hidden xl:table-cell px-3 py-2 whitespace-nowrap">{cur?.status === 'loaded' ? fmt(cur.loaded_at ?? cur.created_at) : monthName(data.month)}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span></td>
                    <td className="px-3 py-2 tabular-nums">{cur?.status === 'loaded' ? (cur.balance == null ? 'אין נתון' : ils(cur.balance)) : '—'}</td>
                    <td className="hidden xl:table-cell px-3 py-2 whitespace-nowrap tabular-nums">{cur?.status === 'loaded' && cur.expires_at ? fmt(cur.expires_at) : '—'}</td>
                    <td className="px-3 py-2"><button className="text-xs text-[#14213D] underline whitespace-nowrap" onClick={() => setOpen(c.id)}>כרטסת ({c.history.length})</button></td>
                  </tr>
                )
              })}
              {shown.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-[#6B6352]">אין מוקדים מתאימים</td></tr>}
            </tbody>
          </table>
        </div>}
      </div>
      {open && data.centers.find((c) => c.id === open) && (
        <HistoryModal c={data.centers.find((c) => c.id === open)!} month={data.month} onClose={() => setOpen('')} />
      )}
    </div>
  )
}
