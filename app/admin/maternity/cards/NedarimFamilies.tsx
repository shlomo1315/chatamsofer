'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Loader2, RefreshCw, Search, X, CreditCard, Plus, Trash2, Wallet,
  Pencil, Check, AlertTriangle, Coins, Users, Receipt, TrendingDown, ArrowDownCircle,
} from 'lucide-react'
import ExtendEligibility from '../ExtendEligibility'
import { AdminOnly } from '@/components/StaffPermissions'

type Stats = {
  configured?: boolean
  familiesCount?: number
  totalLoaded?: number
  totalRemaining?: number
  usedTotal?: number
  tableTotal?: number
  sumYtra?: number
  generalWallet?: number | null
  generalWalletKey?: string | null
  tableMeta?: Record<string, unknown>
  usedToday?: number; usedWeek?: number; usedMonth?: number
  cntToday?: number; cntWeek?: number; cntMonth?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions?: any[]
  unloadByZeout?: Record<string, UnloadInfo>
  cardByClientId?: Record<string, string>
  error?: string
}

// תאריך ISO → dd/mm/yyyy
function fmtBirth(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// פרטי פריקה/זכאות לכל ת.ז — כולל מזהה התיק לצורך הארכת זכאות ידנית
type UnloadInfo = {
  unloadDate: string
  daysRemaining: number
  aidId?: string
  birthDate?: string
  sixWeeksEnd?: string
  extended?: boolean
  reason?: string
  centerName?: string
}

type Family = {
  ClientId: string
  Zeout?: string
  FamilyName?: string
  FirstName?: string
  Address?: string
  Phone?: string
  Groupe?: string
  Ytra?: string | number
  Tsad3Id?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

const ils = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.\-]/g, ''))
  return Number.isFinite(n) ? `₪${n.toLocaleString('he-IL')}` : '—'
}

// ניקוי מספר טלפון מתגיות HTML (נדרים מחזיר לעיתים "<br />" בין מספרים)
const cleanPhone = (p?: string) => {
  const s = String(p ?? '').replace(/<br\s*\/?>/gi, ' · ').replace(/\s+/g, ' ').trim().replace(/^[·\s]+|[·\s]+$/g, '')
  return s || '—'
}

async function api(action: string, params: Record<string, string> = {}): Promise<Json> {
  const res = await fetch('/api/admin/nedarim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params }),
  })
  return res.json()
}

export default function NedarimFamilies() {
  const [families, setFamilies] = useState<Family[]>([])
  const [total, setTotal] = useState<string | number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Family | null>(null)
  const [adding, setAdding] = useState(false)
  const [view, setView] = useState<'families' | 'history'>('families')
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  // בחירה מרובה למחיקה: קבוצת ClientId מסומנים + מודאל אישור + התקדמות מחיקה
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [confirmingBulk, setConfirmingBulk] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState<{ done: number; total: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const d = await api('GetClient_Table')
    if (String(d.Result).toUpperCase() === 'OK') {
      setFamilies(Array.isArray(d.data) ? d.data : [])
      setTotal(d.Total ?? null)
    } else {
      setError(d.Message || 'שגיאה במשיכת הנתונים מנדרים קארד')
    }
    setLoading(false)
  }, [])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await fetch('/api/admin/nedarim/stats')
      setStats(await res.json())
    } catch { setStats(null) }
    setStatsLoading(false)
  }, [])

  useEffect(() => { load(); loadStats() }, [load, loadStats])

  // פתיחת מודאל המשפחה אוטומטית בהגעה מקישור "ניהול הכרטיס" (?zeout=...)
  const openedFromUrl = useRef(false)
  useEffect(() => {
    if (openedFromUrl.current || loading || families.length === 0) return
    const z = new URLSearchParams(window.location.search).get('zeout')
    if (!z) return
    const fam = families.find(f => String(f.Zeout ?? '').trim() === z.trim())
    if (fam) { setSelected(fam); openedFromUrl.current = true }
  }, [loading, families])

  const q = search.trim()
  const filtered = q
    ? families.filter(f => [f.FamilyName, f.FirstName, f.Zeout, f.Phone, f.Groupe].filter(Boolean).join(' ').includes(q))
    : families

  // ─── בחירה מרובה למחיקה ───
  const toggleOne = (clientId: string) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(clientId)) next.delete(clientId); else next.add(clientId)
    return next
  })
  // "בחר הכל" פועל על השורות המסוננות בלבד (מה שהמשתמש רואה)
  const filteredIds = filtered.map(f => String(f.ClientId))
  const allFilteredChecked = filteredIds.length > 0 && filteredIds.every(id => checked.has(id))
  const toggleAll = () => setChecked(prev => {
    const next = new Set(prev)
    if (allFilteredChecked) filteredIds.forEach(id => next.delete(id))
    else filteredIds.forEach(id => next.add(id))
    return next
  })
  const clearChecked = () => setChecked(new Set())

  // המשפחות שסומנו למחיקה (לפי כל הרשימה, לא רק המסוננת)
  const checkedFamilies = families.filter(f => checked.has(String(f.ClientId)))

  const runBulkDelete = async () => {
    setConfirmingBulk(false)
    const targets = checkedFamilies
    setBulkDeleting({ done: 0, total: targets.length })
    let failed = 0
    for (let i = 0; i < targets.length; i++) {
      const d = await api('SaveClientCard', { ClientId: String(targets[i].ClientId), Deleted: '1' })
      if (String(d.Result).toUpperCase() !== 'OK') failed++
      setBulkDeleting({ done: i + 1, total: targets.length })
    }
    setBulkDeleting(null)
    setChecked(new Set())
    await load(); await loadStats()
    if (failed > 0) setError(`${failed} מתוך ${targets.length} משפחות לא נמחקו. נסה שוב.`)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Wallet} color="emerald" label="סה״כ מוטען בארנקים"
          value={ils(stats?.totalLoaded ?? total ?? 0)} loading={statsLoading} />
        <StatCard icon={TrendingDown} color="rose" label="סה״כ נוצל"
          value={ils(stats?.usedTotal ?? 0)} loading={statsLoading} />
        <StatCard icon={ArrowDownCircle} color="indigo" label="יתרה נוכחית (סטטוס)"
          value={ils(stats?.totalRemaining ?? 0)} loading={statsLoading} />
        <StatCard icon={Users} color="slate" label="משפחות"
          value={String(stats?.familiesCount ?? families.length)} loading={statsLoading && families.length === 0} />
      </div>

      {/* Usage by period */}
      <div className="grid grid-cols-3 gap-3">
        <PeriodCard label="נוצל היום" amount={ils(stats?.usedToday ?? 0)} count={stats?.cntToday ?? 0} loading={statsLoading} />
        <PeriodCard label="נוצל השבוע" amount={ils(stats?.usedWeek ?? 0)} count={stats?.cntWeek ?? 0} loading={statsLoading} />
        <PeriodCard label="נוצל החודש" amount={ils(stats?.usedMonth ?? 0)} count={stats?.cntMonth ?? 0} loading={statsLoading} />
      </div>

      {/* View toggle + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex items-center gap-1">
          {([
            { id: 'families', label: 'משפחות', icon: Users },
            { id: 'history', label: 'היסטוריית עסקאות', icon: Receipt },
          ] as const).map(t => {
            const Icon = t.icon; const active = view === t.id
            return (
              <button key={t.id} onClick={() => setView(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                  ${active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                <Icon size={15} /> {t.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <AdminOnly>
            <button onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg">
              <Plus size={16} /> משפחה חדשה
            </button>
          </AdminOnly>
          <button onClick={() => { load(); loadStats() }} disabled={loading} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg border border-slate-200">
            <RefreshCw size={16} className={loading || statsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {view === 'history' ? (
        <TransactionsHistory transactions={stats?.transactions ?? []} loading={statsLoading} />
      ) : (
      <>
      {/* Search */}
      <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
        <Search size={15} className="text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם / ת.ז / טלפון / קטגוריה…"
          className="flex-1 text-sm bg-transparent outline-none" />
      </div>

      {/* סרגל פעולות בחירה מרובה — מופיע כשסומנה לפחות משפחה אחת */}
      <AdminOnly>
        {checked.size > 0 && (
          <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">
            <span className="text-sm font-medium text-rose-800">{checked.size} משפחות נבחרו</span>
            <div className="flex items-center gap-2">
              <button onClick={clearChecked} className="text-sm text-slate-500 hover:text-slate-700 px-2">בטל בחירה</button>
              <button onClick={() => setConfirmingBulk(true)}
                className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg">
                <Trash2 size={15} /> מחק נבחרות
              </button>
            </div>
          </div>
        )}
      </AdminOnly>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm"><Loader2 size={18} className="animate-spin" /> טוען משפחות מנדרים קארד…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <CreditCard size={28} /><span className="text-sm">{error ? 'לא ניתן לטעון נתונים' : q ? 'לא נמצאו תוצאות' : 'אין משפחות'}</span>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-[16px] border-collapse" dir="rtl">
              <thead className="sticky top-0 z-10">
                <tr className="text-right text-[15px] font-bold text-slate-600 border-b-2 border-slate-200 [&>th]:bg-slate-50">
                  <AdminOnly><th className="px-4 py-4 border-l border-slate-200 w-px">
                    <input type="checkbox" checked={allFilteredChecked} onChange={toggleAll}
                      title="בחר הכל" className="w-4 h-4 accent-rose-600 cursor-pointer align-middle" />
                  </th></AdminOnly>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">שם משפחה</th>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">מזהה משפחה</th>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">ת.ז</th>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">מספר כרטיס</th>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">תאריך לידה</th>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">מוקד לאיסוף</th>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">טלפון</th>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">קטגוריה</th>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">יתרה בכרטיס</th>
                  <th className="px-5 py-4 font-bold">ימים לפריקה</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => {
                  const info = f.Zeout ? stats?.unloadByZeout?.[String(f.Zeout).trim()] : undefined
                  const isChecked = checked.has(String(f.ClientId))
                  return (
                  <tr key={f.ClientId} onClick={() => setSelected(f)} className={`border-b border-slate-100 cursor-pointer transition-colors ${isChecked ? 'bg-rose-50/70 hover:bg-rose-50' : 'hover:bg-emerald-50/40'}`}>
                    <AdminOnly><td className="px-4 py-4 border-l border-slate-100 w-px" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleOne(String(f.ClientId))}
                        className="w-4 h-4 accent-rose-600 cursor-pointer align-middle" />
                    </td></AdminOnly>
                    <td className="px-5 py-4 font-semibold text-slate-800 border-l border-slate-100">{[f.FamilyName, f.FirstName].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-5 py-4 text-slate-600 text-right border-l border-slate-100"><span className="ltr-num font-mono">{f.ClientId}</span></td>
                    <td className="px-5 py-4 text-slate-600 text-right border-l border-slate-100"><span className="ltr-num">{f.Zeout || '—'}</span></td>
                    <td className="px-5 py-4 text-right border-l border-slate-100">
                      {stats?.cardByClientId?.[String(f.ClientId)]
                        ? <span className="ltr-num font-mono text-slate-700">{stats.cardByClientId[String(f.ClientId)]}</span>
                        : <span className="text-amber-600 text-sm">לא בוצע שיוך</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-600 text-right border-l border-slate-100"><span className="ltr-num">{fmtBirth(info?.birthDate)}</span></td>
                    <td className="px-5 py-4 text-slate-600 border-l border-slate-100">{info?.centerName || '—'}</td>
                    <td className="px-5 py-4 text-slate-600 text-right border-l border-slate-100"><span className="ltr-num">{cleanPhone(f.Phone)}</span></td>
                    <td className="px-5 py-4 text-slate-600 border-l border-slate-100">{f.Groupe || '—'}</td>
                    <td className="px-5 py-4 font-bold text-emerald-700 border-l border-slate-100">{ils(f.Ytra)}</td>
                    <td className="px-5 py-4" onClick={info?.aidId ? (e => e.stopPropagation()) : undefined}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <UnloadCell info={info} />
                        {info?.aidId && (
                          <ExtendEligibility
                            aid={{ id: info.aidId, birth_date: info.birthDate ?? '', six_weeks_end: info.sixWeeksEnd, eligibility_extended: info.extended, eligibility_extension_reason: info.reason }}
                            variant="icon"
                            onDone={() => { load(); loadStats() }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {selected && <FamilyModal family={selected} onClose={() => setSelected(null)} onChanged={() => { load(); loadStats() }} />}
      {adding && <EditFamilyModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}

      {/* מודאל אישור מחיקה מרובה — מציג את רשימת המשפחות שיימחקו */}
      {confirmingBulk && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl" onClick={() => setConfirmingBulk(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
              <AlertTriangle size={18} className="text-rose-600" />
              <h2 className="font-bold text-slate-900">מחיקת {checkedFamilies.length} משפחות</h2>
            </div>
            <div className="p-5 flex flex-col gap-3 overflow-y-auto">
              <p className="text-sm text-slate-600">המשפחות הבאות יימחקו לצמיתות מנדרים קארד. פעולה זו <strong>אינה הפיכה</strong>.</p>
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2">
                {checkedFamilies.map(f => (
                  <div key={f.ClientId} className="flex items-center justify-between text-sm px-2 py-1">
                    <span className="font-medium text-slate-700 truncate">{[f.FamilyName, f.FirstName].filter(Boolean).join(' ') || '—'}</span>
                    <span className="ltr-num text-xs text-slate-400">{f.Zeout || `#${f.ClientId}`}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
              <button onClick={() => setConfirmingBulk(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">ביטול</button>
              <button onClick={runBulkDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold">
                <Trash2 size={15} /> מחק {checkedFamilies.length} משפחות
              </button>
            </div>
          </div>
        </div>
      )}

      {/* חיווי התקדמות מחיקה מרובה */}
      {bulkDeleting && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-rose-600" />
            <p className="text-sm font-medium text-slate-700">מוחק משפחות… {bulkDeleting.done} מתוך {bulkDeleting.total}</p>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-rose-500 transition-all" style={{ width: `${bulkDeleting.total ? (bulkDeleting.done / bulkDeleting.total) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── מודאל פרטי משפחה: יתרה, טעינות (פריקה), הוספת טעינה, כרטיסים מגנטיים, עריכה, מחיקה ───
function FamilyModal({ family, onClose, onChanged }: { family: Family; onClose: () => void; onChanged: () => void }) {
  const [card, setCard] = useState<Json | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(false)
  // add tlush
  const [tlushAmount, setTlushAmount] = useState('')
  const [tlushExp, setTlushExp] = useState('')
  // magnetic
  const [newCard, setNewCard] = useState('')
  // תגובת נדרים המלאה לשיוך כרטיס (נשארת על המסך עד לפעולה הבאה)
  const [cardResult, setCardResult] = useState<{ ok: boolean; message: string } | null>(null)
  // לידות המשפחה — "סיבת הטעינות" (כל טעינה = לידה)
  type Birth = { id: string; birthDate: string | null; babyName: string | null; babyGender: string | null; recoveryHome: string | null; status: string | null }
  const [births, setBirths] = useState<Birth[]>([])

  const refresh = useCallback(async () => {
    setLoading(true)
    const d = await api('GetClientCard', { ClientId: family.ClientId })
    setCard(String(d.Result).toUpperCase() === 'OK' ? d : null)
    setLoading(false)
  }, [family.ClientId])
  useEffect(() => { refresh() }, [refresh])

  // שליפת לידות המשפחה לפי ת"ז (סיבת הטעינות)
  useEffect(() => {
    const z = String(family.Zeout ?? '').trim()
    if (!z) return
    fetch(`/api/admin/nedarim/family-births?zeout=${encodeURIComponent(z)}`)
      .then(r => r.json()).then(d => setBirths(d.births ?? [])).catch(() => {})
  }, [family.Zeout])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const addTlush = async () => {
    const amt = Number(tlushAmount)
    if (!amt || amt <= 0) { flash('יש להזין סכום'); return }
    setBusy('tlush')
    const d = await api('AddTlush', { ClientId: family.ClientId, Amount: String(amt), ...(tlushExp ? { Expiration: tlushExp } : {}) })
    setBusy('')
    if (String(d.Result).toUpperCase() === 'OK') { setTlushAmount(''); setTlushExp(''); flash('הטעינה נוספה'); refresh(); onChanged() }
    else flash(d.Message || 'שגיאה בהוספת טעינה')
  }

  const unload = async (tlushId: string) => {
    if (!confirm('לפרוק טעינה זו?')) return
    setBusy('unload' + tlushId)
    const d = await api('PrikatTlush', { TlushId: tlushId })
    setBusy('')
    if (String(d.Result).toUpperCase() === 'OK') { flash('הטעינה נפרקה'); refresh(); onChanged() }
    else flash(d.Message || 'שגיאה בפריקה')
  }

  const addMagnetic = async () => {
    if (!newCard.trim()) { flash('יש להזין מספר כרטיס'); return }
    setBusy('mag'); setCardResult(null)
    const d = await api('SetClientMagneticCard', { ClientId: family.ClientId, MagneticCard: newCard.trim(), Remove: '0' })
    setBusy('')
    const msg = String(d.Message ?? '')
    // הכרטיס כבר משויך למשפחה זו = המטרה — אז זו הצלחה (זיהוי רחב לניסוחי נדרים)
    const alreadyOnFamily = /משפחה\s*זו|כבר\s*(מוגדר|מוגד|משוי|משויך)|(מוגדר|משויך|משוי)\S*\s*למשפחה/.test(msg)
    const ok = String(d.Result).toUpperCase() === 'OK' || alreadyOnFamily
    setCardResult({ ok, message: alreadyOnFamily ? 'הכרטיס כבר משויך למשפחה זו' : msg })
    if (ok) { setNewCard(''); refresh() }
  }

  const removeMagnetic = async (cardId: string, mag: string) => {
    if (!confirm('לנתק כרטיס מגנטי זה?')) return
    setBusy('rmmag' + cardId)
    const d = await api('SetClientMagneticCard', { ClientId: family.ClientId, MagneticCard: mag, CardId: cardId, Remove: '1' })
    setBusy('')
    if (String(d.Result).toUpperCase() === 'OK') { flash('הכרטיס נותק'); refresh() }
    else flash(d.Message || 'שגיאה בניתוק')
  }

  const del = async () => {
    if (!confirm('למחוק את המשפחה מנדרים קארד? פעולה זו אינה הפיכה.')) return
    setBusy('del')
    const d = await api('SaveClientCard', { ClientId: family.ClientId, Deleted: '1' })
    setBusy('')
    if (String(d.Result).toUpperCase() === 'OK') { onChanged(); onClose() }
    else flash(d.Message || 'שגיאה במחיקה')
  }

  const name = [card?.FamilyName ?? family.FamilyName, card?.FirstName ?? family.FirstName].filter(Boolean).join(' ')
  const tlushim: Json[] = Array.isArray(card?.Tlushim) ? card!.Tlushim : []
  const cards: Json[] = Array.isArray(card?.Cards) ? card!.Cards : []
  // היסטוריית עסקאות = רק קניות בבית עסק (יש שם חנות), לא טעינות/פריקות
  const history: Json[] = (Array.isArray(card?.History) ? card!.History : [])
    .filter((h: Json) => String(h.StoreName ?? h.Store ?? '').trim() !== '')

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <CreditCard size={18} className="text-emerald-600 flex-shrink-0" />
            <h2 className="font-bold text-slate-900 truncate">{name || 'משפחה'}</h2>
            <span className="text-xs text-slate-400">#{family.ClientId}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-indigo-600" title="עריכת פרטים"><Pencil size={17} /></button>
            <button onClick={del} disabled={busy === 'del'} className="text-slate-400 hover:text-red-600" title="מחיקת משפחה">{busy === 'del' ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}</button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm"><Loader2 size={18} className="animate-spin" /> טוען…</div>
        ) : !card ? (
          <div className="py-16 text-center text-slate-400 text-sm">לא ניתן לטעון את פרטי המשפחה</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            {msg && <div className="text-sm text-center text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</div>}

            {/* balance + details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center gap-2">
                <Wallet size={18} className="text-emerald-600" />
                <span className="text-slate-600">יתרה זמינה:</span>
                <span className="font-bold text-emerald-700 text-lg">{ils(card.TotalFreeAmount)}</span>
              </div>
              <Detail label="ת.ז" value={card.Zeout} ltr />
              <Detail label="טלפון" value={[card.Phone1, card.Phone2].filter(Boolean).join(' · ')} ltr />
              <Detail label="כתובת" value={card.Address} />
              <Detail label="מייל" value={card.Email} ltr />
              <Detail label="קטגוריה" value={card.Groupe} />
              <Detail label="הערה" value={card.Comments} />
            </div>

            {/* add tlush */}
            <section className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5"><Coins size={15} className="text-emerald-600" /> הוספת טעינה</h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">סכום (₪)</label>
                  <input value={tlushAmount} onChange={e => setTlushAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" dir="ltr"
                    className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-left" placeholder="0" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">תפוגה (לא חובה)</label>
                  <input type="date" value={tlushExp} onChange={e => setTlushExp(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <button onClick={addTlush} disabled={busy === 'tlush'}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                  {busy === 'tlush' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} טען
                </button>
              </div>
            </section>

            {/* tlushim list */}
            {tlushim.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">טעינות ({tlushim.length})</h3>
                <div className="flex flex-col gap-1.5">
                  {tlushim.map((t, i) => {
                    // פרטי הלידה שעבורה בוצעה הטעינה (לפי סדר), מוצגים באמצע השורה ללא אייקון
                    const b = births[i]
                    const bGender = b?.babyGender === 'male' ? 'בן' : b?.babyGender === 'female' ? 'בת' : ''
                    const bDate = b?.birthDate ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(b.birthDate)) : ''
                    const bLabel = b ? [b.babyName || (bGender ? `${bGender} שנולד/ה` : 'לידה'), bDate, b.recoveryHome].filter(Boolean).join(' · ') : ''
                    return (
                    <div key={t.TlushId ?? i} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm">
                      <div className="min-w-0 flex-shrink-0">
                        <span className="font-medium text-slate-700">{ils(t.Amount)}</span>
                        <span className="text-slate-400 mx-2">·</span>
                        <span className="text-slate-500">נותר {ils(t.FreeAmount)}</span>
                        {t.Expiration && <span className="text-xs text-slate-400 mr-2">תפוגה {t.Expiration}</span>}
                      </div>
                      {/* פרטי הלידה (סיבת הטעינה) — באמצע */}
                      <div className="flex-1 min-w-0 text-center text-xs text-slate-500 truncate">{bLabel}</div>
                      {/* כפתור פריקה רק לטעינה שנותר בה סכום כלשהו */}
                      {t.TlushId && Number(String(t.FreeAmount ?? '').replace(/[^\d.-]/g, '')) > 0 && (
                        <button onClick={() => unload(String(t.TlushId))} disabled={busy === 'unload' + t.TlushId}
                          className="text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg flex-shrink-0">
                          {busy === 'unload' + t.TlushId ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} פריקה
                        </button>
                      )}
                    </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* magnetic cards */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">כרטיסים מגנטיים (עד 3)</h3>
              <div className="flex flex-col gap-1.5 mb-2">
                {cards.filter(c => !c.RemovedDate).map((c, i) => (
                  <div key={c.CardId ?? i} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm">
                    <span className="ltr-num text-slate-700">{c.CardNumber || c.MagneticCard}</span>
                    <button onClick={() => removeMagnetic(String(c.CardId), String(c.MagneticCard))} disabled={busy === 'rmmag' + c.CardId}
                      className="text-xs text-red-500 hover:text-red-700 inline-flex items-center gap-1">
                      {busy === 'rmmag' + c.CardId ? <Loader2 size={12} className="animate-spin" /> : <X size={13} />} נתק
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input value={newCard} onChange={e => setNewCard(e.target.value)} dir="ltr" placeholder="מספר כרטיס / פס מגנטי"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-left" />
                <button onClick={addMagnetic} disabled={busy === 'mag'}
                  className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-semibold px-3.5 py-2 rounded-lg">
                  {busy === 'mag' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} שייך
                </button>
              </div>
              {cardResult && (
                <div className={`mt-2 rounded-lg border px-3 py-2 text-sm ${cardResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                  <div className="font-semibold">{cardResult.ok ? '✓ נדרים אישר — הכרטיס שויך' : '✗ נדרים החזיר שגיאה'}</div>
                  {cardResult.message && <div className="mt-0.5 text-xs opacity-90">תגובת נדרים: {cardResult.message}</div>}
                </div>
              )}
            </section>

            {/* history */}
            {history.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">היסטוריית עסקאות ({history.length})</h3>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {history.map((h, i) => (
                    <div key={h.HistoryId ?? i} className="flex items-center justify-between text-xs bg-white border border-slate-100 rounded-lg px-3 py-1.5">
                      <span className="text-slate-600 truncate">{h.StoreName || '—'}</span>
                      <span className="text-slate-400">{h.Date}</span>
                      <span className="font-medium text-slate-700">{ils(h.Amount)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {editing && (
        <EditFamilyModal family={{ ...family, ...(card ?? {}) }} onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); refresh(); onChanged() }} />
      )}
    </div>
  )
}

function Detail({ label, value, ltr }: { label: string; value: unknown; ltr?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-slate-700 ${ltr ? 'ltr-num text-right' : ''}`} dir={ltr ? 'ltr' : undefined}>{value ? String(value) : '—'}</p>
    </div>
  )
}

// ─── מודאל הוספה/עריכה של משפחה ───
function EditFamilyModal({ family, onClose, onSaved }: { family?: Json; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    FamilyName: family?.FamilyName ?? '',
    FirstName: family?.FirstName ?? '',
    Zeout: family?.Zeout ?? '',
    Address: family?.Address ?? '',
    Phone1: family?.Phone1 ?? '',
    Phone2: family?.Phone2 ?? '',
    Email: family?.Email ?? '',
    Groupe: family?.Groupe ?? '',
    Comments: family?.Comments ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const clientId = family?.ClientId as string | undefined

  const save = async () => {
    if (!form.FamilyName.trim()) { setError('יש להזין שם משפחה'); return }
    setSaving(true); setError('')
    const d = await api('SaveClientCard', { ...(clientId ? { ClientId: clientId } : {}), ...form } as Record<string, string>)
    setSaving(false)
    if (String(d.Result).toUpperCase() === 'OK') onSaved()
    else setError(d.Message || 'שגיאה בשמירה')
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">{clientId ? 'עריכת משפחה' : 'משפחה חדשה'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          <FieldI label="שם משפחה *" v={form.FamilyName} on={set('FamilyName')} />
          <FieldI label="שם פרטי" v={form.FirstName} on={set('FirstName')} />
          <FieldI label="ת.ז" v={form.Zeout} on={set('Zeout')} ltr />
          <FieldI label="טלפון" v={form.Phone1} on={set('Phone1')} ltr />
          <FieldI label="טלפון נוסף" v={form.Phone2} on={set('Phone2')} ltr />
          <FieldI label="מייל" v={form.Email} on={set('Email')} ltr />
          <div className="col-span-2"><FieldI label="כתובת" v={form.Address} on={set('Address')} /></div>
          <FieldI label="קטגוריה" v={form.Groupe} on={set('Groupe')} />
          <FieldI label="הערה" v={form.Comments} on={set('Comments')} />
          {error && <div className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div className="col-span-2 flex justify-end gap-2 mt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">ביטול</button>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} שמירה
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldI({ label, v, on, ltr }: { label: string; v: string; on: (e: React.ChangeEvent<HTMLInputElement>) => void; ltr?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input value={v} onChange={on} dir={ltr ? 'ltr' : undefined}
        className={`rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${ltr ? 'text-left' : ''}`} />
    </div>
  )
}

// חיווי ימים שנותרו עד פריקה אוטומטית (ברירת מחדל: 6 שבועות מהלידה; ניתן להארכה ידנית)
function UnloadCell({ info }: { info?: UnloadInfo }) {
  if (!info) return <span className="text-slate-300">—</span>
  // פריקה בחצות; כשהפריקה היום/באיחור — מציג שעות ודקות עד החצות הקרובה
  const now = new Date()
  const end = new Date(info.unloadDate); end.setHours(0, 0, 0, 0)
  const ms = end.getTime() - now.getTime()
  let label: string, cls: string
  if (ms <= 0) {
    const nextMidnight = new Date(now); nextMidnight.setHours(24, 0, 0, 0)
    const rem = nextMidnight.getTime() - now.getTime()
    const h = Math.floor(rem / 3600000); const m = Math.floor((rem % 3600000) / 60000)
    label = h > 0 ? `פריקה בעוד ${h} שע׳ ${m} דק׳` : `פריקה בעוד ${m} דק׳`
    cls = 'bg-red-100 text-red-700'
  } else {
    const days = Math.ceil(ms / 86400000)
    if (days <= 1) {
      const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000)
      label = h > 0 ? `עוד ${h} שע׳ ${m} דק׳` : `עוד ${m} דק׳`
      cls = 'bg-amber-100 text-amber-700'
    } else { label = `${days} ימים`; cls = days <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700' }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[15px] font-medium ${cls}`} title={`פריקה ב-${info.unloadDate}`}>
        {label}
      </span>
      {info.extended && (
        <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700" title={info.reason || 'הזכאות הוארכה ידנית'}>הוארך</span>
      )}
    </span>
  )
}

const STAT_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  rose: 'bg-rose-50 border-rose-100 text-rose-700',
  indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700',
  slate: 'bg-slate-50 border-slate-100 text-slate-700',
}
function StatCard({ icon: Icon, color, label, value, loading }: { icon: typeof Wallet; color: string; label: string; value: string; loading?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${STAT_COLORS[color] ?? STAT_COLORS.slate}`}>
      <div className="flex items-center gap-1.5 mb-1"><Icon size={14} /><p className="text-xs text-slate-500">{label}</p></div>
      <p className="text-lg font-bold">{loading ? <Loader2 size={16} className="animate-spin" /> : value}</p>
    </div>
  )
}
function PeriodCard({ label, amount, count, loading }: { label: string; amount: string; count: number; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      {loading ? <Loader2 size={16} className="animate-spin text-slate-400" /> : (
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-slate-800">{amount}</span>
          <span className="text-xs text-slate-400">{count} כרטיסים</span>
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TransactionsHistory({ transactions, loading }: { transactions: any[]; loading?: boolean }) {
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? transactions.filter(t => [t.familyName, t.store, t.date].filter(Boolean).join(' ').includes(q.trim()))
    : transactions
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
        <Search size={15} className="text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש בעסקאות לפי משפחה / חנות / תאריך…" className="flex-1 text-sm bg-transparent outline-none" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm"><Loader2 size={18} className="animate-spin" /> טוען היסטוריית עסקאות…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2"><Receipt size={28} /><span className="text-sm">אין עסקאות</span></div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[16px] border-collapse" dir="rtl">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-right text-[15px] font-bold text-slate-600 border-b-2 border-slate-200">
                  <th className="px-5 py-4 font-bold border-l border-slate-200">משפחה</th>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">חנות</th>
                  <th className="px-5 py-4 font-bold border-l border-slate-200">תאריך</th>
                  <th className="px-5 py-4 font-bold">סכום</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-4 font-semibold text-slate-800 border-l border-slate-100">{t.familyName || '—'}</td>
                    <td className="px-5 py-4 text-slate-600 border-l border-slate-100">{t.store || '—'}</td>
                    <td className="px-5 py-4 text-slate-600 text-right border-l border-slate-100"><span className="ltr-num">{t.date || '—'}</span></td>
                    <td className="px-5 py-4 font-bold text-slate-800">{Number.isFinite(Number(t.amount)) ? `₪${Number(t.amount).toLocaleString('he-IL')}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
