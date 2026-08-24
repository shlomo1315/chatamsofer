'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { babyNameLabel, type AidNameFields } from '@/lib/babyNames'
import { useRouter } from 'next/navigation'
import { Check, X, CreditCard, Loader2, Search, RotateCcw } from 'lucide-react'
import type { MaternityAid, CardCenter, CardStatus } from '@/types'
import ExtendEligibility from '../ExtendEligibility'
import { useCan } from '@/components/StaffPermissions'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

const STATUS_META: Record<CardStatus, { label: string; cls: string }> = {
  pending:        { label: 'ממתין לאישור',     cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved:       { label: 'אושר',              cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  awaiting_stock: { label: 'אושר — ממתין למלאי', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  loaded:         { label: 'נטען',              cls: 'bg-green-100 text-green-800 border-green-200' },
  rejected:       { label: 'נדחה',              cls: 'bg-red-100 text-red-800 border-red-200' },
}

type Ben = { full_name?: string; family_name?: string; spouse_name?: string; spouse_id_number?: string }
const motherName = (b?: Ben) => b ? ([b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || b.full_name || '—') : '—'
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—'
const ils = (n?: number | null) => (n == null ? '—' : `₪${Number(n).toLocaleString('he-IL')}`)

// ספירה לאחור לפריקה אוטומטית (רצה בחצות שעון ישראל). כשהפריקה היום/באיחור — מציג שעות ודקות עד החצות הקרובה.
function unloadCountdown(sixWeeksEnd?: string): { text: string; cls: string } | null {
  if (!sixWeeksEnd) return null
  const now = new Date()
  const end = new Date(sixWeeksEnd); end.setHours(0, 0, 0, 0)
  const ms = end.getTime() - now.getTime()
  if (ms <= 0) {
    // יום הסיום הגיע/עבר → הפריקה תתבצע בחצות הקרובה. מציג שעות ודקות עד אז.
    const nextMidnight = new Date(now); nextMidnight.setHours(24, 0, 0, 0)
    const rem = nextMidnight.getTime() - now.getTime()
    const h = Math.floor(rem / 3600000)
    const m = Math.floor((rem % 3600000) / 60000)
    return { text: h > 0 ? `פריקה בעוד ${h} שע׳ ${m} דק׳` : `פריקה בעוד ${m} דק׳`, cls: 'bg-red-100 text-red-700' }
  }
  const days = Math.ceil(ms / 86400000)
  if (days <= 1) {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    return { text: h > 0 ? `עוד ${h} שע׳ ${m} דק׳` : `עוד ${m} דק׳`, cls: 'bg-amber-100 text-amber-700' }
  }
  return { text: `${days} ימים`, cls: days <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600' }
}

const FILTERS: { key: CardStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'ממתין לאישור' },
  { key: 'approved', label: 'אושר' },
  { key: 'awaiting_stock', label: 'ממתין למלאי' },
  { key: 'loaded', label: 'נטען' },
  { key: 'rejected', label: 'נדחה' },
]

// ── הגדרת העמודות ──
// עמודת "פעולות" אינה בבורר (קבועה) — ראו extraCols למטה.
type ColKey = 'mother' | 'wifeId' | 'baby' | 'birth' | 'center' | 'status' | 'loaded' | 'balance' | 'countdown'

const COLUMNS: ColDef<ColKey>[] = [
  { key: 'mother', label: 'שם היולדת', def: true },
  { key: 'wifeId', label: 'ת.ז. האישה', def: true },
  { key: 'baby', label: 'תינוק', def: true },
  { key: 'birth', label: 'תאריך לידה', def: true },
  { key: 'center', label: 'מוקד', def: true },
  { key: 'status', label: 'סטטוס כרטיס', def: true },
  { key: 'loaded', label: 'סכום שהוטען', def: false },
  { key: 'balance', label: 'יתרה בכרטיס', def: true },
  { key: 'countdown', label: 'ימים לפריקה', def: true },
]

export default function CardsTable({ aids }: { aids: MaternityAid[] }) {
  const router = useRouter()
  const canEdit = useCan('maternity_cards', 'edit')
  const [centers, setCenters] = useState<CardCenter[]>([])
  const [filter, setFilter] = useState<CardStatus | 'all'>('pending')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [approveFor, setApproveFor] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const loadCenters = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/card-centers', { cache: 'no-store' })
      setCenters((await r.json()).centers ?? [])
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    loadCenters()
    const h = () => loadCenters()
    window.addEventListener('card-centers-refresh', h)
    return () => window.removeEventListener('card-centers-refresh', h)
  }, [loadCenters])

  const availableCenters = centers.filter(c => c.is_active && (c.available ?? 0) > 0)
  const noStock = availableCenters.length === 0

  const act = async (aidId: string, action: 'approve' | 'reject' | 'pending' | 'load', centerId?: string) => {
    setBusyId(aidId); setErr('')
    try {
      const r = await fetch('/api/admin/maternity/card-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId, action, centerId }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'שגיאה'); setBusyId(null); return }
      setApproveFor(null)
      window.dispatchEvent(new Event('card-centers-refresh'))
      router.refresh()
    } catch { setErr('שגיאת רשת') }
    setBusyId(null)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: aids.length }
    for (const a of aids) { const s = a.card_status ?? 'pending'; c[s] = (c[s] ?? 0) + 1 }
    return c
  }, [aids])

  const filtered = aids.filter(a => {
    const s = a.card_status ?? 'pending'
    if (filter !== 'all' && s !== filter) return false
    if (!query.trim()) return true
    const b = a.beneficiary as Ben | undefined
    const hay = [motherName(b), b?.spouse_id_number, babyNameLabel(a as AidNameFields).text].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(query.trim().toLowerCase())
  })

  // extraCols: 1 — עמודת הפעולות קבועה ואינה בבורר, אך נספרת לגרירה.
  const tc = useTableColumns<ColKey>('maternity-cards', COLUMNS, { extraCols: 1 })

  // תוכן התא לפי מפתח העמודה
  const cell = (key: ColKey, aid: MaternityAid) => {
    const b = aid.beneficiary as Ben | undefined
    const s = (aid.card_status ?? 'pending') as CardStatus
    switch (key) {
      case 'mother': return <span className="font-semibold text-slate-800">{motherName(b)}</span>
      case 'wifeId': return <span className="ltr-num font-mono text-slate-600">{b?.spouse_id_number ?? '—'}</span>
      case 'baby': {
        const nm = babyNameLabel(aid as AidNameFields)
        return nm.missing
          ? <span className="text-slate-300">—</span>
          : <span className={nm.pending ? 'text-amber-700 font-semibold' : 'text-slate-700'}>{nm.pending ? `⏳ ${nm.text}` : nm.text}</span>
      }
      case 'birth': return <span className="ltr-num text-slate-600">{fmtDate(aid.birth_date)}</span>
      case 'center': return (aid as { card_center?: { name?: string } }).card_center?.name ?? <span className="text-slate-300">—</span>
      case 'status': return <span className={`inline-block text-[13px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_META[s].cls}`}>{STATUS_META[s].label}</span>
      case 'loaded': return aid.card_load_amount != null ? <span className="text-slate-700">{ils(aid.card_load_amount)}</span> : <span className="text-slate-300">—</span>
      case 'balance': return aid.card_status === 'loaded' && aid.card_balance != null
        ? <span className="font-bold text-emerald-700">{ils(aid.card_balance)}</span>
        : <span className="text-slate-300">—</span>
      case 'countdown': {
        // 🔴 כרטיס שנפרק הציג מקף — המזכירות לא ידעה אם הפריקה בוצעה
        // או שהמערכת פשוט שכחה אותו. מדובר בכסף, וחוסר ידיעה כאן הוא
        // בדיוק מה שהסתיר 12 יום שבהם הפריקה לא רצה כלל.
        const unloadedAt = (aid as { card_unloaded_at?: string | null }).card_unloaded_at
        if (unloadedAt) {
          return (
            <div className="flex flex-col items-start gap-1">
              <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-1 text-[13px] font-semibold text-emerald-800">
                נפרק · {fmtDate(unloadedAt)}
              </span>
              {/* ⚠️ "נוצל במלואו" אינו כשל אלא סיום תקין: נדרים החזירה
                  "אין יתרה", כלומר המשפחה השתמשה בכסף. */}
              {/נוצל במלואו/.test((aid as { card_load_error?: string | null }).card_load_error ?? '') && (
                <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  נוצל במלואו
                </span>
              )}
            </div>
          )
        }

        // ⚠️ נופלים לתאריך הלידה + 42 כש-six_weeks_end ריק: הוא NULL
        // ב-194 מתוך 208 התיקים הטעונים, והעמודה הציגה מקף למרות
        // שהמועד ידוע היטב.
        const due = aid.six_weeks_end
          || (aid.birth_date ? new Date(new Date(aid.birth_date).getTime() + 42 * 86400000).toISOString().slice(0, 10) : undefined)
        const countdown = s === 'loaded' ? unloadCountdown(due) : null
        return (
          <div className="flex flex-col items-start gap-1">
            {countdown ? <span className={`inline-block text-[13px] font-semibold px-2.5 py-1 rounded-full ${countdown.cls}`}>{countdown.text}</span> : <span className="text-slate-300">—</span>}
            {aid.eligibility_extended && <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">הוארך ידנית</span>}
          </div>
        )
      }
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CreditCard size={18} className="text-emerald-600" />
          <h2 className="font-semibold text-slate-900">בקשות כרטיס מזון</h2>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש…"
            className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
        </div>
      </div>

      {/* filters */}
      <div className="flex gap-2 flex-wrap px-5 py-3 border-b border-slate-100">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${filter === f.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>
            {f.label} <span className="opacity-70">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {noStock && (
        <div className="mx-5 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          ⚠️ אין מלאי כרטיסים פנוי כעת. ניתן לאשר את היולדת ל<strong>רשימת המתנה</strong> — ברגע שיתחדש המלאי היא תשויך אוטומטית ותקבל שובר במייל, ללא צורך בפעולה נוספת.
        </div>
      )}
      {err && <p className="px-5 mt-3 text-sm text-red-600">{err}</p>}

      {/* בורר העמודות — מעל הטבלה */}
      <div className="px-5 py-3">{tc.picker}</div>

      {/* ⚠️ בלי overflow-x — הכלל: אין גלילה לרוחב בשום טבלה. */}
      <div className="w-full">
        <table className="w-full text-[16px] text-right border-collapse" style={tc.rt.tableStyle}>
          <colgroup>{tc.rt.cols}</colgroup>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-[15px] font-bold text-slate-600 [&>th]:px-5 [&>th]:py-4 [&>th]:font-bold [&>th]:text-right [&>th]:border-l [&>th]:border-slate-200 [&>th:last-child]:border-l-0">
              {tc.shown.map((c, i) => (
                <th key={c.key} className={tc.headClass(c)}>{c.label}{tc.rt.handle(i)}</th>
              ))}
              <th className="relative">פעולות{tc.rt.handle(tc.shown.length)}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={tc.shown.length + 1} className="px-5 py-12 text-center text-slate-400">אין בקשות בסינון זה</td></tr>
            ) : filtered.map(aid => {
              const s = (aid.card_status ?? 'pending') as CardStatus
              const busy = busyId === aid.id
              return (
                <tr key={aid.id} onClick={() => router.push(`/admin/maternity/${aid.id}`)}
                  className="border-b border-slate-100 hover:bg-emerald-50/40 transition-colors cursor-pointer [&>td]:px-5 [&>td]:py-4 [&>td]:border-l [&>td]:border-slate-100 [&>td:last-child]:border-l-0">
                  {tc.shown.map(c => (
                    <td key={c.key} className={tc.cellClass(c)}>{cell(c.key, aid)}</td>
                  ))}
                  <td className="align-top" onClick={e => e.stopPropagation()}>
                    {busy ? (
                      <Loader2 size={15} className="animate-spin text-slate-400" />
                    ) : !canEdit ? (
                      <span className="text-slate-300">—</span>
                    ) : approveFor === aid.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <select id={`c-${aid.id}`} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white" defaultValue="">
                          <option value="" disabled>בחר מוקד…</option>
                          {availableCenters.map(c => <option key={c.id} value={c.id}>{c.name} (פנוי {c.available})</option>)}
                        </select>
                        <button onClick={() => { const v = (document.getElementById(`c-${aid.id}`) as HTMLSelectElement)?.value; if (!v) { setErr('יש לבחור מוקד'); return } act(aid.id, 'approve', v) }}
                          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5">אשר</button>
                        <button onClick={() => setApproveFor(null)} className="text-xs text-slate-500 hover:text-slate-700">ביטול</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {s === 'pending' && !noStock && (
                          <button onClick={() => { setErr(''); setApproveFor(aid.id) }}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 shadow-sm"><Check size={14} /> אשר כרטיס</button>
                        )}
                        {s === 'pending' && noStock && (
                          <button onClick={() => act(aid.id, 'approve')}
                            title="אין מלאי כעת — היולדת תיכנס לרשימת המתנה ותקבל שובר אוטומטית כשיתחדש המלאי"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg px-3 py-1.5 shadow-sm"><Check size={14} /> אשר (ממתין למלאי)</button>
                        )}
                        {s === 'awaiting_stock' && !noStock && (
                          <button onClick={() => { setErr(''); setApproveFor(aid.id) }}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 shadow-sm"><Check size={14} /> שייך מוקד ואשר</button>
                        )}
                        {s === 'approved' && (
                          <button onClick={() => act(aid.id, 'load')}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5 shadow-sm"><CreditCard size={14} /> סמן כנטען</button>
                        )}
                        {(s === 'approved' || s === 'loaded' || s === 'rejected' || s === 'awaiting_stock') && (
                          <button onClick={() => act(aid.id, 'pending')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 border border-amber-200 hover:bg-amber-50 rounded-lg px-2.5 py-1.5"><RotateCcw size={13} /> החזר לממתין</button>
                        )}
                        {s !== 'rejected' && s !== 'loaded' && (
                          <button onClick={() => act(aid.id, 'reject')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1.5"><X size={13} /> דחה</button>
                        )}
                        <ExtendEligibility aid={aid} variant="icon" onDone={() => router.refresh()} />
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
