'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, RefreshCw, Search, X, CreditCard, Plus, Trash2, Wallet,
  Pencil, Check, AlertTriangle, Coins, Users, Receipt, TrendingDown, ArrowDownCircle,
} from 'lucide-react'

type Stats = {
  configured?: boolean
  familiesCount?: number
  totalLoaded?: number
  totalRemaining?: number
  usedTotal?: number
  usedToday?: number; usedWeek?: number; usedMonth?: number
  cntToday?: number; cntWeek?: number; cntMonth?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions?: any[]
  error?: string
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
  const n = Number(v)
  return Number.isFinite(n) ? `₪${n.toLocaleString('he-IL')}` : (v ? String(v) : '—')
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

  const q = search.trim()
  const filtered = q
    ? families.filter(f => [f.FamilyName, f.FirstName, f.Zeout, f.Phone, f.Groupe].filter(Boolean).join(' ').includes(q))
    : families

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
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg">
            <Plus size={16} /> משפחה חדשה
          </button>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead>
                <tr className="text-right text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 font-medium">שם משפחה</th>
                  <th className="px-4 py-2.5 font-medium">מזהה משפחה</th>
                  <th className="px-4 py-2.5 font-medium">ת.ז</th>
                  <th className="px-4 py-2.5 font-medium">טלפון</th>
                  <th className="px-4 py-2.5 font-medium">קטגוריה</th>
                  <th className="px-4 py-2.5 font-medium">יתרה בכרטיס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(f => (
                  <tr key={f.ClientId} onClick={() => setSelected(f)} className="hover:bg-emerald-50/40 cursor-pointer">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{[f.FamilyName, f.FirstName].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 ltr-num text-right font-mono">{f.ClientId}</td>
                    <td className="px-4 py-2.5 text-slate-500 ltr-num text-right">{f.Zeout || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 ltr-num text-right" dangerouslySetInnerHTML={{ __html: f.Phone || '—' }} />
                    <td className="px-4 py-2.5 text-slate-500">{f.Groupe || '—'}</td>
                    <td className="px-4 py-2.5 font-semibold text-emerald-700">{ils(f.Ytra)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {selected && <FamilyModal family={selected} onClose={() => setSelected(null)} onChanged={() => { load(); loadStats() }} />}
      {adding && <EditFamilyModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
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

  const refresh = useCallback(async () => {
    setLoading(true)
    const d = await api('GetClientCard', { ClientId: family.ClientId })
    setCard(String(d.Result).toUpperCase() === 'OK' ? d : null)
    setLoading(false)
  }, [family.ClientId])
  useEffect(() => { refresh() }, [refresh])

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
    setBusy('mag')
    const d = await api('SetClientMagneticCard', { ClientId: family.ClientId, MagneticCard: newCard.trim() })
    setBusy('')
    if (String(d.Result).toUpperCase() === 'OK') { setNewCard(''); flash('הכרטיס שויך'); refresh() }
    else flash(d.Message || 'שגיאה בשיוך כרטיס')
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
  const history: Json[] = Array.isArray(card?.History) ? card!.History : []

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
                  {tlushim.map((t, i) => (
                    <div key={t.TlushId ?? i} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-700">{ils(t.Amount)}</span>
                        <span className="text-slate-400 mx-2">·</span>
                        <span className="text-slate-500">נותר {ils(t.FreeAmount)}</span>
                        {t.Expiration && <span className="text-xs text-slate-400 mr-2">תפוגה {t.Expiration}</span>}
                      </div>
                      {t.TlushId && (
                        <button onClick={() => unload(String(t.TlushId))} disabled={busy === 'unload' + t.TlushId}
                          className="text-xs text-red-500 hover:text-red-700 inline-flex items-center gap-1">
                          {busy === 'unload' + t.TlushId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} פריקה
                        </button>
                      )}
                    </div>
                  ))}
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
            <table className="w-full text-sm" dir="rtl">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-right text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2.5 font-medium">משפחה</th>
                  <th className="px-4 py-2.5 font-medium">חנות</th>
                  <th className="px-4 py-2.5 font-medium">תאריך</th>
                  <th className="px-4 py-2.5 font-medium">סכום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{t.familyName || '—'}</td>
                    <td className="px-4 py-2 text-slate-500">{t.store || '—'}</td>
                    <td className="px-4 py-2 text-slate-500 ltr-num text-right">{t.date || '—'}</td>
                    <td className="px-4 py-2 font-semibold text-slate-700">{Number.isFinite(Number(t.amount)) ? `₪${Number(t.amount).toLocaleString('he-IL')}` : '—'}</td>
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
