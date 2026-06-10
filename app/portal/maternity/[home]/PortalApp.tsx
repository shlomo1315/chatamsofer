'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  Building2, Baby, CalendarDays, Search, Eye, EyeOff,
  AlertCircle, Lock, X, User, Phone, MapPin, ChevronLeft
} from 'lucide-react'
import { format, differenceInDays, addDays } from 'date-fns'
import { he } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Mother {
  id: string
  full_name?: string
  family_name?: string
  spouse_name?: string
  spouse_id_number?: string
  phone?: string
  address?: string
  city?: string
}

interface Aid {
  id: string
  birth_date: string
  baby_name?: string
  baby_gender?: 'male' | 'female'
  six_weeks_end?: string
  recovery_from?: string
  recovery_to?: string
  card_number?: string
  notes?: string
  recovery_arrived?: boolean | null
  beneficiary?: Mother
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const motherName = (m?: Mother) => {
  if (!m) return '—'
  if (m.spouse_name) return [m.family_name, m.spouse_name].filter(Boolean).join(' ')
  return [m.family_name, m.full_name].filter(Boolean).join(' ') || '—'
}

const endDate = (a: Aid) =>
  a.six_weeks_end ? new Date(a.six_weeks_end) : addDays(new Date(a.birth_date), 42)

const daysLeft = (a: Aid) => differenceInDays(endDate(a), new Date())

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy') : '—'

// ─── Login Form ───────────────────────────────────────────────────────────────
function LoginForm({ home, onSuccess }: { home: string; onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoErr, setLogoErr] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה'); setLoading(false); return }
      onSuccess()
    } catch {
      setError('שגיאת רשת — נסה שוב')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3 text-center">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-lg border border-sky-100 flex items-center justify-center overflow-hidden p-2">
            {logoErr
              ? <Building2 size={36} className="text-indigo-400" />
              : <img src="/logo.jpg" alt="לוגו" className="w-full h-full object-contain" onError={() => setLogoErr(true)} />}
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">היכל החתם סופר</p>
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-center mt-1">
              <Building2 size={17} className="text-indigo-500" />{home}
            </h1>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6">
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Lock size={16} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">כניסה מאובטחת</p>
              <p className="text-xs text-slate-400">הכנס סיסמה לצפייה ברשימת היולדות</p>
            </div>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••"
                required
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pl-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertCircle size={14} className="flex-shrink-0" /> {error}
              </div>
            )}

            <button type="submit" disabled={loading || !password}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-3 rounded-xl text-sm transition-colors shadow-sm">
              {loading ? 'מאמת...' : 'כניסה'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-slate-400 mt-5">מערכת מאובטחת · לשימוש פנימי בלבד</p>
      </div>
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ aid, onClose }: { aid: Aid; onClose: () => void }) {
  const m = aid.beneficiary

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
        style={{ animation: 'pop-in 0.2s ease-out' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-l from-indigo-600 to-violet-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Baby size={20} />
            </div>
            <div>
              <p className="font-bold text-base">{motherName(m)}</p>
              <p className="text-indigo-200 text-xs">{m?.spouse_id_number ?? ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
            {/* Baby info */}
          <div className="bg-indigo-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-2">פרטי התינוק</p>
            <Row icon={<Baby size={14} />} label="שם התינוק" value={aid.baby_name ?? '—'} />
            <Row icon={<CalendarDays size={14} />} label="תאריך לידה" value={fmtDate(aid.birth_date)} />
            {aid.baby_gender && (
              <Row icon={<User size={14} />} label="מין" value={aid.baby_gender === 'male' ? 'זכר' : 'נקבה'} />
            )}
          </div>

          {/* Mother info */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">פרטי האם</p>
            <Row icon={<User size={14} />} label="שם" value={motherName(m)} />
            {m?.phone && <Row icon={<Phone size={14} />} label="טלפון" value={m.phone} ltr />}
            {(m?.address || m?.city) && (
              <Row icon={<MapPin size={14} />} label="כתובת"
                value={[m.address, m.city].filter(Boolean).join(', ')} />
            )}
          </div>

          {/* Recovery dates */}
          {(aid.recovery_from || aid.recovery_to) && (
            <div className="bg-sky-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-sky-500 uppercase tracking-wide mb-2">תקופת שהייה</p>
              {aid.recovery_from && <Row icon={<CalendarDays size={14} />} label="מתאריך" value={fmtDate(aid.recovery_from)} />}
              {aid.recovery_to && <Row icon={<CalendarDays size={14} />} label="עד תאריך" value={fmtDate(aid.recovery_to)} />}
            </div>
          )}

          {aid.notes && (
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">הערות</p>
              <p className="text-sm text-slate-700">{aid.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ icon, label, value, ltr }: { icon: React.ReactNode; label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-400 flex-shrink-0">{icon}</span>
      <span className="text-slate-500 flex-shrink-0">{label}:</span>
      <span className={`text-slate-800 font-medium ${ltr ? 'ltr-num' : ''}`}>{value}</span>
    </div>
  )
}

// ─── Data Table ───────────────────────────────────────────────────────────────
function DataView({ home, aids }: { home: string; aids: Aid[] }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Aid | null>(null)
  const [logoErr, setLogoErr] = useState(false)
  const [hebrewInfo, setHebrewInfo] = useState<{ hebrewDate: string; parasha: string; hebrewYear: string } | null>(null)
  const today = new Date()

  // סימון הגעת היולדת — נשמר במערכת המרכזית
  const [arrived, setArrived] = useState<Record<string, boolean | null>>(
    () => Object.fromEntries(aids.map(a => [a.id, a.recovery_arrived ?? null])),
  )
  const [savingId, setSavingId] = useState<string | null>(null)
  const markArrived = async (aidId: string, value: boolean | null) => {
    const prev = arrived[aidId] ?? null
    setArrived(m => ({ ...m, [aidId]: value })); setSavingId(aidId)
    try {
      const r = await fetch('/api/portal/arrived', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home, aidId, arrived: value }),
      })
      if (!r.ok) setArrived(m => ({ ...m, [aidId]: prev }))
    } catch { setArrived(m => ({ ...m, [aidId]: prev })) }
    setSavingId(null)
  }

  useEffect(() => {
    fetch('/api/portal/hebrewdate')
      .then(r => r.json())
      .then(d => setHebrewInfo(d))
      .catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return aids
    return aids.filter(a => {
      const m = a.beneficiary
      return [
        motherName(m), m?.spouse_id_number, a.baby_name,
        fmtDate(a.birth_date), a.card_number,
      ].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [aids, query])

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50" dir="rtl">
      {selected && <DetailModal aid={selected} onClose={() => setSelected(null)} />}

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl border border-slate-100 shadow-sm overflow-hidden flex-shrink-0 bg-white flex items-center justify-center p-1">
            {logoErr
              ? <Building2 size={22} className="text-indigo-400" />
              : <img src="/logo.jpg" alt="לוגו" className="w-full h-full object-contain" onError={() => setLogoErr(true)} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 leading-none">היכל החתם סופר · עזר יולדות</p>
            <h1 className="text-base font-bold text-slate-800 truncate">{home}</h1>
          </div>
          <div className="text-left text-xs text-slate-400 flex-shrink-0">
            <p>{format(today, 'EEEE', { locale: he })} · {format(today, 'd/M/yyyy')}</p>
            {hebrewInfo?.hebrewDate && (
              <p className="font-medium text-slate-700 mt-0.5">{hebrewInfo.hebrewDate}</p>
            )}
            {hebrewInfo?.parasha && (
              <p className="text-indigo-500 font-semibold mt-0.5">{hebrewInfo.parasha}</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם, ת.ז., שם תינוק..."
            className="w-full pr-10 pl-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
          />
        </div>

        {/* Info banner */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Baby size={14} className="text-indigo-500 flex-shrink-0" />
          <p className="text-xs text-indigo-700">
            מוצגות <strong>{filtered.length}</strong> יולדות מאושרות.
            רשימה זו לקריאה בלבד · מתעדכנת אוטומטית.
          </p>
        </div>

        {/* Table / empty */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
            <Baby size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">{query ? 'לא נמצאו תוצאות לחיפוש' : 'אין יולדות פעילות כרגע'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['שם היולדת', 'ת.ז.', 'שם התינוק', 'תאריך לידה', 'הגעה לבית החלמה', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(aid => {
                    const m = aid.beneficiary
                    return (
                      <tr key={aid.id} className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                        onClick={() => setSelected(aid)}>
                        <td className="px-4 py-3.5 font-medium text-slate-800 whitespace-nowrap">{motherName(m)}</td>
                        <td className="px-4 py-3.5 text-xs font-mono text-slate-500 ltr-num">{m?.spouse_id_number ?? '—'}</td>
                        <td className="px-4 py-3.5 text-slate-700">{aid.baby_name ?? '—'}</td>
                        <td className="px-4 py-3.5 text-slate-600 ltr-num whitespace-nowrap">{fmtDate(aid.birth_date)}</td>
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          {(() => {
                            const a = arrived[aid.id] ?? null
                            const saving = savingId === aid.id
                            return (
                              <div className={`flex items-center gap-1.5 ${saving ? 'opacity-50 pointer-events-none' : ''}`}>
                                <button type="button" onClick={() => markArrived(aid.id, a === true ? null : true)}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${a === true ? 'bg-green-100 text-green-800 border-green-400' : 'bg-white text-slate-500 border-slate-200 hover:border-green-300'}`}>הגיעה</button>
                                <button type="button" onClick={() => markArrived(aid.id, a === false ? null : false)}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${a === false ? 'bg-red-100 text-red-800 border-red-400' : 'bg-white text-slate-500 border-slate-200 hover:border-red-300'}`}>לא הגיעה</button>
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium">
                            <ChevronLeft size={13} /> פרטים
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 pb-4">
          מערכת ניהול היכל החתם סופר · לשימוש פנימי בלבד
        </p>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PortalApp({ home }: { home: string }) {
  const [state, setState] = useState<'loading' | 'login' | 'data'>('loading')
  const [aids, setAids] = useState<Aid[]>([])

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/portal/data?home=${encodeURIComponent(home)}`)
      if (res.status === 401) { setState('login'); return }
      if (!res.ok) { setState('login'); return }
      const json = await res.json()
      setAids(json.aids ?? [])
      setState('data')
    } catch {
      setState('login')
    }
  }

  useEffect(() => { fetchData() }, [])

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-indigo-50">
        <div className="text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">טוען...</p>
        </div>
      </div>
    )
  }

  if (state === 'login') {
    return <LoginForm home={home} onSuccess={fetchData} />
  }

  return <DataView home={home} aids={aids} />
}
