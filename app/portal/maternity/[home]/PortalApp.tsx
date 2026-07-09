'use client'
import { useState, useEffect, useMemo, Fragment } from 'react'
import {
  Building2, Baby, CalendarDays, Search, Eye, EyeOff, Check,
  AlertCircle, Lock, X, User, Phone, MapPin, ChevronLeft, LogOut
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
  is_twins?: boolean
  babies?: { name?: string | null; gender?: 'male' | 'female' | null; id_type?: 'id' | 'passport'; id_number?: string | null }[]
  recovery_eligibility_days?: number | null
  six_weeks_end?: string
  recovery_from?: string
  recovery_to?: string
  card_number?: string
  notes?: string
  recovery_arrived?: boolean | null
  recovery_amount?: number | null
  recovery_amount_status?: string | null
  recovery_nights?: number | null
  recovery_receipt_number?: string | null
  recovery_receipt_url?: string | null
  recovery_locked?: boolean | null
  recovery_edit_requested_at?: string | null
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

// ימי הזכאות של היולדת בבית ההחלמה — הערך שאושר, ובהיעדרו ברירת המחדל לפי סוג הלידה
// (לידה רגילה = 2 · לידת תאומים = 4).
const recoveryDays = (a: Aid) => a.recovery_eligibility_days ?? (a.is_twins ? 4 : 2)

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
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden">
            {logoErr
              ? <Building2 size={36} className="text-indigo-400" />
              : <img src="/logo.png" alt="לוגו" className="w-full h-full object-contain" onError={() => setLogoErr(true)} />}
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
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-2 flex items-center gap-2">
              {aid.is_twins ? 'פרטי התאומים' : 'פרטי התינוק'}
              {aid.is_twins && <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-800"><Baby size={11} /> לידת תאומים</span>}
            </p>
            {(() => {
              const babies = Array.isArray(aid.babies) && aid.babies.length
                ? aid.babies
                : [{ name: aid.baby_name, gender: aid.baby_gender }]
              return babies.map((b, i) => (
                <div key={i} className={i > 0 ? 'pt-2 border-t border-indigo-100' : ''}>
                  <Row icon={<Baby size={14} />} label={aid.is_twins ? `תינוק ${i + 1}` : 'שם התינוק'} value={b.name || '—'} />
                  {b.gender && <Row icon={<User size={14} />} label="מין" value={b.gender === 'male' ? 'זכר' : 'נקבה'} />}
                </div>
              ))
            })()}
            <Row icon={<CalendarDays size={14} />} label="תאריך לידה" value={fmtDate(aid.birth_date)} />
          </div>

          {/* ימי הזכאות שאושרו לבית ההחלמה */}
          <div className="bg-sky-50 rounded-xl p-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
              <CalendarDays size={15} /> ימי זכאות לבית ההחלמה
            </span>
            <span className="inline-block text-base font-bold px-3 py-1 rounded-full bg-sky-100 text-sky-800">{recoveryDays(aid)} ימים</span>
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
function DataView({ home, aids, onLogout }: { home: string; aids: Aid[]; onLogout: () => void }) {
  const [query, setQuery] = useState('')
  const [arrivedFilter, setArrivedFilter] = useState<'all' | 'arrived' | 'not' | 'pending'>('all')
  const [selected, setSelected] = useState<Aid | null>(null)
  const [logoErr, setLogoErr] = useState(false)
  const [hebrewInfo, setHebrewInfo] = useState<{ hebrewDate: string; parasha: string; hebrewYear: string } | null>(null)
  const today = new Date()

  // סימון הגעת היולדת — נשמר במערכת המרכזית
  const [arrived, setArrived] = useState<Record<string, boolean | null>>(
    () => Object.fromEntries(aids.map(a => [a.id, a.recovery_arrived ?? null])),
  )
  const [savingId, setSavingId] = useState<string | null>(null)
  // סכום שמומש עבור הלידה — מוזן רק כשסומן "הגיעה" ונשלח לאישור
  const [amountInput, setAmountInput] = useState<Record<string, string>>(
    () => Object.fromEntries(aids.map(a => [a.id, a.recovery_amount != null ? String(a.recovery_amount) : ''])),
  )
  const [amountStatus, setAmountStatus] = useState<Record<string, string | null>>(
    () => Object.fromEntries(aids.map(a => [a.id, a.recovery_amount_status ?? null])),
  )
  const [nightsInput, setNightsInput] = useState<Record<string, string>>(
    () => Object.fromEntries(aids.map(a => [a.id, a.recovery_nights != null ? String(a.recovery_nights) : ''])),
  )
  const [receiptInput, setReceiptInput] = useState<Record<string, string>>(
    () => Object.fromEntries(aids.map(a => [a.id, a.recovery_receipt_number ?? ''])),
  )
  const [savingAmt, setSavingAmt] = useState<string | null>(null)
  const [editingAmt, setEditingAmt] = useState<Record<string, boolean>>({})
  // קובץ הקבלה + מצב נעילה של הרשומה
  const [receiptFile, setReceiptFile] = useState<Record<string, File | null>>({})
  const [receiptUrl, setReceiptUrl] = useState<Record<string, string | null>>(
    () => Object.fromEntries(aids.map(a => [a.id, a.recovery_receipt_url ?? null])),
  )
  const [locked, setLocked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(aids.map(a => [a.id, !!a.recovery_locked])),
  )
  const [editRequested, setEditRequested] = useState<Record<string, boolean>>(
    () => Object.fromEntries(aids.map(a => [a.id, !!a.recovery_edit_requested_at])),
  )
  const [uploadingReceipt, setUploadingReceipt] = useState<string | null>(null)
  const [confirmAid, setConfirmAid] = useState<string | null>(null)
  const [requesting, setRequesting] = useState<string | null>(null)

  const uploadReceipt = async (aidId: string, file: File) => {
    setUploadingReceipt(aidId)
    try {
      const fd = new FormData()
      fd.append('home', home); fd.append('aidId', aidId); fd.append('file', file)
      const r = await fetch('/api/portal/recovery-receipt', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.url) {
        setReceiptUrl(m => ({ ...m, [aidId]: d.url }))
        setReceiptFile(m => ({ ...m, [aidId]: file }))
      }
    } catch { /* התעלם */ }
    setUploadingReceipt(null)
  }

  // כל השדות חובה: סכום חיובי, לילות, מספר קבלה, וקובץ קבלה שהועלה
  const canSubmit = (aidId: string) => {
    const amt = Number(amountInput[aidId])
    return Number.isFinite(amt) && amt > 0 &&
      (nightsInput[aidId] ?? '').trim() !== '' &&
      (receiptInput[aidId] ?? '').trim() !== '' &&
      !!receiptUrl[aidId]
  }

  const sendAmount = async (aidId: string) => {
    if (!canSubmit(aidId)) return
    setSavingAmt(aidId)
    try {
      const r = await fetch('/api/portal/recovery-amount', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          home, aidId,
          amount: Number(amountInput[aidId]),
          nights: nightsInput[aidId],
          receiptNumber: (receiptInput[aidId] ?? '').trim(),
        }),
      })
      if (r.ok) {
        setAmountStatus(m => ({ ...m, [aidId]: 'executed' }))
        setLocked(m => ({ ...m, [aidId]: true }))
        setEditingAmt(m => ({ ...m, [aidId]: false }))
        setConfirmAid(null)
      }
    } catch { /* נסיון חוזר אפשרי */ }
    setSavingAmt(null)
  }

  const requestEdit = async (aidId: string) => {
    setRequesting(aidId)
    try {
      const r = await fetch('/api/portal/recovery-request-edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home, aidId }),
      })
      if (r.ok) setEditRequested(m => ({ ...m, [aidId]: true }))
    } catch { /* התעלם */ }
    setRequesting(null)
  }
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

  const matchArrived = (id: string) => {
    if (arrivedFilter === 'all') return true
    const a = arrived[id] ?? null
    if (arrivedFilter === 'arrived') return a === true
    if (arrivedFilter === 'not') return a === false
    return a === null // pending
  }
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return aids.filter(a => {
      if (!matchArrived(a.id)) return false
      if (!q) return true
      const m = a.beneficiary
      return [
        motherName(m), m?.spouse_id_number, a.baby_name,
        fmtDate(a.birth_date), a.card_number,
      ].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aids, query, arrivedFilter, arrived])

  const counts = {
    all: aids.length,
    arrived: aids.filter(a => (arrived[a.id] ?? null) === true).length,
    not: aids.filter(a => (arrived[a.id] ?? null) === false).length,
    pending: aids.filter(a => (arrived[a.id] ?? null) === null).length,
  }

  return (
    <div className="portal16 min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50" dir="rtl">
      {/* טיפוגרפיה נעימה וריווח נדיב — בלי font-size גלובלי שמנפח את הטבלה וגורם לגלישה */}
      <style>{`
        .portal16 { font-size: 15px; line-height: 1.6; }
        .portal16 table { font-size: 14px; }
        .portal16 thead th { padding-top: 14px; padding-bottom: 14px; letter-spacing: .01em; }
        .portal16 tbody td { padding-top: 16px; padding-bottom: 16px; }
        .portal16 input, .portal16 textarea, .portal16 select { font-size: 16px; }
      `}</style>
      {selected && <DetailModal aid={selected} onClose={() => setSelected(null)} />}

      {/* חלונית אימות סופי — "בדוק פעמיים לפני שליחה". לאחר אישור הרשומה ננעלת. */}
      {confirmAid && (() => {
        const a = filtered.find(x => x.id === confirmAid); if (!a) return null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setConfirmAid(null)}>
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
              style={{ animation: 'pop-in 0.2s ease-out' }} onClick={e => e.stopPropagation()}>
              <div className="bg-amber-500 px-5 py-4 text-white flex items-start gap-3">
                <AlertCircle size={22} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-base">אישור סופי — נא לוודא את נכונות הפרטים</p>
                  <p className="text-amber-50 text-xs mt-1 leading-relaxed">נא לעבור בעיון על כל הפרטים ולוודא את נכונותם. לאחר האישור לא ניתן יהיה לערוך את הנתונים.</p>
                </div>
              </div>
              <div className="p-5 space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">יולדת</span><span className="font-semibold text-slate-800">{motherName(a.beneficiary)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">סכום שמומש</span><span className="font-semibold text-slate-800">₪{Number(amountInput[a.id]).toLocaleString('he-IL')}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">מספר לילות</span><span className="font-semibold text-slate-800">{nightsInput[a.id]}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">מספר קבלה</span><span className="font-semibold text-slate-800">{receiptInput[a.id]}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">קובץ קבלה</span><span className="font-semibold text-emerald-600">{receiptUrl[a.id] ? 'צורף ✓' : '—'}</span></div>
              </div>
              <div className="flex gap-2 p-4 border-t border-slate-100">
                <button onClick={() => setConfirmAid(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50">חזור לתיקון</button>
                <button onClick={() => sendAmount(a.id)} disabled={savingAmt === a.id}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-40">
                  {savingAmt === a.id ? '...' : 'אני מאשר/ת ושולח/ת'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
            {logoErr
              ? <Building2 size={22} className="text-indigo-400" />
              : <img src="/logo.png" alt="לוגו" className="w-full h-full object-contain" onError={() => setLogoErr(true)} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 leading-none">היכל החתם סופר · עזר יולדות</p>
            <h1 className="text-base font-bold text-slate-800 truncate">{home}</h1>
          </div>
          <div className="text-left text-xs text-slate-400 flex-shrink-0 hidden sm:block">
            <p>{format(today, 'EEEE', { locale: he })} · {format(today, 'd/M/yyyy')}</p>
            {hebrewInfo?.hebrewDate && (
              <p className="font-medium text-slate-700 mt-0.5">{hebrewInfo.hebrewDate}</p>
            )}
            {hebrewInfo?.parasha && (
              <p className="text-indigo-500 font-semibold mt-0.5">{hebrewInfo.parasha}</p>
            )}
          </div>
          <button onClick={onLogout}
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-300 rounded-lg px-3 py-2 transition-colors">
            <LogOut size={14} /> התנתקות
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
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

        {/* קוביות סינון + פילוח (מספר + אחוז) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {([
            { key: 'all', label: 'סה״כ', count: counts.all, base: 'bg-white border-slate-200', sel: 'ring-2 ring-indigo-400 border-indigo-300', num: 'text-slate-800' },
            { key: 'arrived', label: 'הגיעו', count: counts.arrived, base: 'bg-green-50 border-green-200', sel: 'ring-2 ring-green-400', num: 'text-green-700' },
            { key: 'not', label: 'לא הגיעו', count: counts.not, base: 'bg-red-50 border-red-200', sel: 'ring-2 ring-red-400', num: 'text-red-700' },
            { key: 'pending', label: 'טרם סומן', count: counts.pending, base: 'bg-amber-50 border-amber-200', sel: 'ring-2 ring-amber-400', num: 'text-amber-700' },
          ] as const).map(c => {
            const pct = counts.all ? Math.round((c.count / counts.all) * 100) : 0
            const active = arrivedFilter === c.key
            return (
              <button key={c.key} onClick={() => setArrivedFilter(c.key)}
                className={`rounded-2xl border px-4 py-3 text-right transition-all ${c.base} ${active ? c.sel : 'hover:shadow-sm'}`}>
                <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-extrabold ${c.num}`}>{c.count}</span>
                  {c.key !== 'all' && <span className="text-xs font-semibold text-slate-400">{pct}%</span>}
                </div>
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-center gap-2 my-1">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5">
            <Check size={15} className="text-indigo-500" />
            סמנו הגעה לכל יולדת
            <span className="text-indigo-300">·</span>
            <span className="font-normal text-indigo-400">הרשימה מתעדכנת אוטומטית</span>
          </span>
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
              <table className="w-full text-sm text-center">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['שם היולדת', 'ת.ז.', 'שם התינוק', 'תאריך לידה', 'ימי זכאות', 'הגעה לבית החלמה', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap text-center">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(aid => {
                    const m = aid.beneficiary
                    const a = arrived[aid.id] ?? null
                    const saving = savingId === aid.id
                    const status = amountStatus[aid.id] ?? null
                    const editing = editingAmt[aid.id] ?? false
                    const amountVal = Number(amountInput[aid.id])
                    const showForm = a === true && !(status && !editing)
                    return (
                      <Fragment key={aid.id}>
                      <tr className="hover:bg-indigo-50/40 transition-colors cursor-pointer [&>td]:align-middle [&>td]:text-center"
                        onClick={() => setSelected(aid)}>
                        <td className="px-4 py-3.5 font-medium text-slate-800 whitespace-nowrap text-center align-middle">{motherName(m)}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-500 text-center align-middle"><span className="ltr-num">{m?.spouse_id_number ?? '—'}</span></td>
                        <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap text-center align-middle">
                          <span className="inline-flex items-center gap-1.5">
                            {aid.baby_name ?? '—'}
                            {aid.is_twins && <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700"><Baby size={12} /> תאומים</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap text-center align-middle"><span className="ltr-num">{fmtDate(aid.birth_date)}</span></td>
                        <td className="px-4 py-3.5 text-center align-middle">
                          <span className="inline-block text-sm font-bold px-3 py-1 rounded-full bg-sky-100 text-sky-800" title="ימי זכאות שאושרו לבית ההחלמה">{recoveryDays(aid)} ימים</span>
                        </td>
                        <td className="px-4 py-3.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                          {status && !editing ? (
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="inline-flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2 max-w-xs mx-auto">
                                <Check size={15} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                <span className="text-sm font-semibold text-emerald-800 text-right leading-relaxed">
                                  היולדת מימשה את הזכאות בסכום {Number.isFinite(amountVal) ? `₪${amountVal.toLocaleString('he-IL')}` : ''}{nightsInput[aid.id] ? ` · ${nightsInput[aid.id]} לילות` : ''}{receiptInput[aid.id] ? ` · קבלה ${receiptInput[aid.id]}` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {status === 'rejected'
                                  ? <span className="text-xs font-medium text-red-600">נדחה</span>
                                  : <span className="text-xs font-medium text-green-600">בוצע ✓</span>}
                                {locked[aid.id]
                                  ? (editRequested[aid.id] || requesting === aid.id
                                      ? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><Lock size={12} /> בקשת תיקון נשלחה</span>
                                      : <button type="button" onClick={() => requestEdit(aid.id)}
                                          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline">בקש תיקון</button>)
                                  : <button type="button" onClick={() => setEditingAmt(mm => ({ ...mm, [aid.id]: true }))}
                                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline">ערוך</button>}
                              </div>
                            </div>
                          ) : (
                            <div className={`flex items-center justify-center gap-2 ${saving ? 'opacity-50 pointer-events-none' : ''}`}>
                              <button type="button" onClick={() => markArrived(aid.id, a === true ? null : true)}
                                className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-all ${a === true ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'}`}>
                                <Check size={15} /> הגיעה
                              </button>
                              <button type="button" onClick={() => markArrived(aid.id, a === false ? null : false)}
                                className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-all ${a === false ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'}`}>
                                <X size={15} /> לא הגיעה
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center align-middle">
                          <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium">
                            <ChevronLeft size={13} /> פרטים
                          </span>
                        </td>
                      </tr>

                      {/* שורת טופס מלאה-רוחב — כך עמודות הנתונים נשארות מיושרות וקצרות */}
                      {showForm && (
                        <tr className="bg-emerald-50/30" onClick={e => e.stopPropagation()}>
                          <td colSpan={7} className="px-4 pb-5 pt-1">
                            <div className="flex flex-col gap-3 bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 w-full max-w-sm mx-auto">
                              <label className="flex flex-col gap-1.5 text-right">
                                <span className="text-sm font-semibold text-slate-600">סכום שמומש (₪)</span>
                                <div className="relative">
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">₪</span>
                                  <input
                                    value={amountInput[aid.id] ?? ''}
                                    onChange={e => setAmountInput(mm => ({ ...mm, [aid.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                                    inputMode="decimal" placeholder="0"
                                    className="w-full pr-8 pl-3 py-3 text-base text-center rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                  />
                                </div>
                              </label>
                              <label className="flex flex-col gap-1.5 text-right">
                                <span className="text-sm font-semibold text-slate-600">מספר לילות</span>
                                <input
                                  value={nightsInput[aid.id] ?? ''}
                                  onChange={e => setNightsInput(mm => ({ ...mm, [aid.id]: e.target.value.replace(/\D/g, '') }))}
                                  inputMode="numeric" placeholder="0"
                                  className="w-full px-3 py-3 text-base text-center rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5 text-right">
                                <span className="text-sm font-semibold text-slate-600">מספר קבלה</span>
                                <input
                                  value={receiptInput[aid.id] ?? ''}
                                  onChange={e => setReceiptInput(mm => ({ ...mm, [aid.id]: e.target.value }))}
                                  inputMode="text" placeholder="הזן/י מספר קבלה"
                                  className="w-full px-3 py-3 text-base text-center rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5 text-right">
                                <span className="text-sm font-semibold text-slate-600">קובץ קבלה (תמונה/PDF)</span>
                                <input
                                  type="file" accept="image/*,application/pdf"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadReceipt(aid.id, f) }}
                                  className="w-full text-sm file:ml-3 file:rounded-lg file:border-0 file:bg-emerald-100 file:px-4 file:py-2 file:text-emerald-700 file:font-semibold file:cursor-pointer"
                                />
                                {uploadingReceipt === aid.id
                                  ? <span className="text-xs text-slate-400">מעלה…</span>
                                  : receiptUrl[aid.id] && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check size={13} /> קובץ הועלה</span>}
                              </label>
                              <button type="button" onClick={() => setConfirmAid(aid.id)}
                                disabled={!canSubmit(aid.id) || savingAmt === aid.id}
                                title={!canSubmit(aid.id) ? 'יש למלא סכום, מספר לילות, מספר קבלה ולהעלות קובץ קבלה' : undefined}
                                className="w-full flex items-center justify-center gap-1.5 text-base font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-xl py-3 mt-1">
                                אישור ושליחה
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
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

  const logout = async () => {
    await fetch('/api/portal/logout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home }),
    }).catch(() => {})
    setState('login')
  }

  return <DataView home={home} aids={aids} onLogout={logout} />
}
