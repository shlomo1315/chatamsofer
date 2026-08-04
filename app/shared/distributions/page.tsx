'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Lock, LogIn, Loader2, Users, Wallet, Gift, CalendarDays, ShieldCheck, Search, LogOut } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// דף שיתוף חלוקות חגים — תצוגה בלבד, מוגן בסיסמה, מבודד משאר האתר.
// מרענן אוטומטית כל 10 שניות (polling), כדי שכל שינוי במערכת יופיע חי.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ──
interface Beneficiary {
  id?: string
  full_name?: string | null
  family_name?: string | null
  spouse_name?: string | null
  id_number?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  community_affiliation?: string | null
  children_count?: number | null
  birth_date?: string | null
  spouse_birth_date?: string | null
}
interface Recipient {
  id: string
  distribution_id: string
  source?: string | null
  registered_at?: string | null
  phone?: string | null
  amount?: number | null
  approval_status?: string | null
  card_number?: string | null
  card_linked_at?: string | null
  beneficiary?: Beneficiary | null
}
interface Distribution {
  id: string
  name: string
  year?: string | null
  holiday?: string | null
  description?: string | null
  status?: string | null
  registration_open?: boolean | null
  amount_per_family?: number | null
  total_budget?: number | null
  distribution_date?: string | null
  created_at?: string | null
}

const fmtCur = (n?: number | null) => n != null ? `${Math.round(Number(n) || 0).toLocaleString('he-IL')} ₪` : '—'
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const fmtDateTime = (d?: string | null) => d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const SOURCE_LABEL: Record<string, string> = { phone: 'טלפון', portal: 'ממשק דיגיטלי', email: 'מייל', admin: 'הזנה ידנית' }
const APPROVAL_LABEL: Record<string, string> = { pending: 'ממתין לאישור', approved: 'מאושר', rejected: 'נדחה' }
const APPROVAL_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
}
const benName = (b?: Beneficiary | null) =>
  b ? ([b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ') || b.full_name || 'ללא שם') : 'ללא שם'
const ageOf = (b?: Beneficiary | null): number | null => {
  const dob = b?.birth_date || b?.spouse_birth_date
  if (!dob) return null
  try {
    const diff = Date.now() - new Date(dob).getTime()
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  } catch { return null }
}

// ── Password Screen ──
function PasswordScreen({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/shared/distributions/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'סיסמה שגויה') }
      else onAuth()
    } catch { setError('שגיאת תקשורת, נסה שוב') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
          <div className="bg-gradient-to-l from-indigo-600 to-violet-600 px-8 py-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-4">
              <Lock size={28} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">חלוקות חגים</h1>
            <p className="text-indigo-200 text-sm mt-1">היכל החתם סופר</p>
          </div>
          <form onSubmit={submit} className="px-8 py-7 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">סיסמת כניסה</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="הזן סיסמה..." autoFocus
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-shadow" />
              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
            </div>
            <button type="submit" disabled={loading || !password}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white font-semibold py-3 text-sm shadow-md shadow-indigo-200 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              כניסה
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Recipients table (view-only) ──
function RecipientsTable({ rows, amountPerFamily }: { rows: Recipient[]; amountPerFamily?: number | null }) {
  if (!rows.length) return <p className="px-4 py-8 text-center text-slate-400 text-sm">אין נרשמים לחלוקה זו</p>
  return (
    <div className="w-full">
      <table className="w-full text-[12px] table-fixed">
        <colgroup>
          <col className="w-[9%]" />{/* שם */}
          <col className="w-[6.5%]" />{/* ת"ז */}
          <col className="w-[6.5%]" />{/* אישור */}
          <col className="w-[6.5%]" />{/* כרטיס */}
          <col className="w-[8%]" />{/* בן/בת */}
          <col className="w-[7%]" />{/* טלפון */}
          <col className="w-[10%]" />{/* מייל */}
          <col className="w-[10%]" />{/* כתובת */}
          <col className="w-[5.5%]" />{/* עיר */}
          <col className="w-[6.5%]" />{/* קהילה */}
          <col className="w-[4%]" />{/* גיל */}
          <col className="w-[4%]" />{/* ילדים */}
          <col className="w-[6.5%]" />{/* ערוץ */}
          <col className="w-[8%]" />{/* תאריך */}
          <col className="w-[5.5%]" />{/* סכום */}
        </colgroup>
        <thead className="bg-slate-50 text-slate-500">
          <tr className="[&>th]:px-2 [&>th]:py-2.5 [&>th]:font-bold [&>th]:text-right [&>th]:align-top [&>th]:border-l [&>th]:border-slate-200 [&>th:last-child]:border-l-0">
            <th>שם המשפחה</th><th>ת״ז</th><th>אישור</th><th>כרטיס</th><th>בן/בת זוג</th>
            <th>טלפון</th><th>מייל</th><th>כתובת</th><th>עיר</th><th>קהילה</th>
            <th>גיל</th><th>ילדים</th><th>ערוץ</th><th>תאריך רישום</th><th>סכום</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => {
            const b = r.beneficiary
            const status = (r.approval_status ?? 'pending')
            return (
              <tr key={r.id} className="hover:bg-indigo-50/40 align-top [&>td]:px-2 [&>td]:py-2 [&>td]:border-l [&>td]:border-slate-100 [&>td:last-child]:border-l-0 [&>td]:break-words [&>td]:whitespace-normal [&_span]:!whitespace-normal [&_span]:break-words">
                <td className="font-semibold text-slate-800">{benName(b)}</td>
                <td className="font-mono text-slate-600"><span className="ltr-num">{b?.id_number ?? '—'}</span></td>
                <td>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${APPROVAL_STYLE[status] ?? APPROVAL_STYLE.pending}`}>
                    {APPROVAL_LABEL[status] ?? status}
                  </span>
                </td>
                <td>{r.card_linked_at ? <span className="font-mono text-[12px] text-slate-700 ltr-num">{r.card_number} ✓</span> : <span className="text-[11px] text-slate-400">—</span>}</td>
                <td className="text-slate-600">{b?.spouse_name ?? '—'}</td>
                <td className="font-mono text-slate-600"><span className="ltr-num">{b?.phone ?? b?.phone2 ?? r.phone ?? '—'}</span></td>
                <td className="text-slate-600">{b?.email ?? '—'}</td>
                <td className="text-slate-600">{b?.address ?? '—'}</td>
                <td className="text-slate-600">{b?.city ?? '—'}</td>
                <td className="text-slate-600">{b?.community_affiliation ?? '—'}</td>
                <td className="text-slate-600 ltr-num">{ageOf(b) ?? '—'}</td>
                <td className="text-slate-600 ltr-num">{b?.children_count ?? '—'}</td>
                <td><span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{SOURCE_LABEL[r.source ?? 'admin'] ?? r.source}</span></td>
                <td className="text-slate-500 ltr-num">{fmtDateTime(r.registered_at)}</td>
                <td className="font-bold text-emerald-700 ltr-num">{amountPerFamily ? fmtCur(amountPerFamily) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main ──
export default function SharedDistributionsPage() {
  const [state, setState] = useState<'checking' | 'locked' | 'unlocked'>('checking')
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [countdown, setCountdown] = useState(10)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shared/distributions', { cache: 'no-store' })
      if (res.status === 401) { setState('locked'); return }
      if (res.ok) {
        const d = await res.json()
        setDistributions(d.distributions ?? [])
        setRecipients(d.recipients ?? [])
        setState('unlocked')
        setCountdown(10) // אחרי כל רענון מוצלח — הספירה מתחילה מחדש
      }
    } catch { /* השאר במצב הנוכחי — הטיימר ינסה שוב */ }
  }, [])

  // טעינה ראשונית
  useEffect(() => { void load() }, [load])

  // ⚠️ רענון חי — ספירה לאחור מ-10 שניות, ואז load. רץ רק כשפתוח ומאומת.
  // polling (ולא Supabase Realtime שהעמיס בעבר). הספירה מוצגת למשתמש.
  useEffect(() => {
    if (state !== 'unlocked') return
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { void load(); return 10 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [state, load])

  const logout = useCallback(async () => {
    try { await fetch('/api/shared/distributions/logout', { method: 'POST' }) } catch {}
    setState('locked')
  }, [])

  // ספירות ופילוח — נגזרים מהנתונים בכל טעינה
  const byDist = useMemo(() => {
    const m = new Map<string, Recipient[]>()
    for (const r of recipients) {
      const arr = m.get(r.distribution_id) ?? []
      arr.push(r)
      m.set(r.distribution_id, arr)
    }
    return m
  }, [recipients])

  const totals = useMemo(() => {
    let registered = 0, expected = 0, approved = 0
    for (const d of distributions) {
      const rows = byDist.get(d.id) ?? []
      registered += rows.length
      const amt = Number(d.amount_per_family ?? 0)
      expected += rows.length * amt
      approved += rows.filter(r => r.approval_status === 'approved').length
    }
    return { registered, expected, approved, distributions: distributions.length }
  }, [distributions, byDist])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return distributions
    return distributions.filter(d => [d.name, d.year, d.holiday, d.description].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [distributions, query])

  if (state === 'checking') {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>
  }
  if (state === 'locked') {
    return <PasswordScreen onAuth={() => { setState('checking'); void load() }} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/40" dir="rtl">
      {/* Header עם לוגו */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="היכל החתם סופר" width={44} height={44} className="rounded-xl" />
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">חלוקות חגים</h1>
              <p className="text-xs text-slate-500 flex items-center gap-1"><ShieldCheck size={12} /> היכל החתם סופר</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              הנתונים יתרעננו שוב בעוד <span className="font-bold text-indigo-600 ltr-num">{countdown}</span> שניות
            </span>
            <button onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-rose-300 hover:text-rose-600 transition">
              <LogOut size={14} /> התנתקות
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* דשבורד מסכם */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border-2 border-indigo-200 bg-white p-5">
            <div className="flex items-center gap-2 text-indigo-600 mb-1"><Users size={16} /><span className="text-xs font-bold text-slate-500">סה״כ נרשמו</span></div>
            <p className="text-3xl font-extrabold text-indigo-700 ltr-num">{totals.registered.toLocaleString('he-IL')}</p>
          </div>
          <div className="rounded-2xl border-2 border-emerald-200 bg-white p-5">
            <div className="flex items-center gap-2 text-emerald-600 mb-1"><Wallet size={16} /><span className="text-xs font-bold text-slate-500">צפי תקציבי</span></div>
            <p className="text-3xl font-extrabold text-emerald-700 ltr-num">{fmtCur(totals.expected)}</p>
          </div>
          <div className="rounded-2xl border-2 border-green-200 bg-white p-5">
            <div className="flex items-center gap-2 text-green-600 mb-1"><ShieldCheck size={16} /><span className="text-xs font-bold text-slate-500">מאושרים</span></div>
            <p className="text-3xl font-extrabold text-green-700 ltr-num">{totals.approved.toLocaleString('he-IL')}</p>
          </div>
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-slate-500 mb-1"><Gift size={16} /><span className="text-xs font-bold text-slate-500">חלוקות</span></div>
            <p className="text-3xl font-extrabold text-slate-700 ltr-num">{totals.distributions.toLocaleString('he-IL')}</p>
          </div>
        </div>

        {/* חיפוש */}
        {distributions.length > 3 && (
          <div className="relative max-w-md">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש חלוקה…"
              className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 shadow-sm" />
          </div>
        )}

        {/* קוביות חלוקות */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(d => {
            const rows = byDist.get(d.id) ?? []
            const expected = d.amount_per_family != null ? rows.length * Number(d.amount_per_family) : null
            const isOpen = openId === d.id
            return (
              <button key={d.id} type="button" onClick={() => setOpenId(isOpen ? null : d.id)}
                className={`text-right overflow-hidden bg-white rounded-2xl border transition-all duration-200 ${isOpen ? 'border-indigo-400 ring-2 ring-indigo-100 shadow-lg sm:col-span-2 lg:col-span-3' : 'border-slate-200 hover:border-indigo-300 hover:shadow-md'}`}>
                <div className={`h-1 ${d.registration_open ? 'bg-gradient-to-l from-green-400 to-emerald-500' : 'bg-slate-200'}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-11 h-11 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Gift size={20} className="text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                          <span className="truncate">{d.name}</span>
                          {d.year && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{d.year}</span>}
                        </h3>
                        {d.holiday && <p className="text-xs text-slate-500 mt-0.5">{d.holiday}</p>}
                      </div>
                    </div>
                    {d.registration_open
                      ? <span className="rounded-full bg-green-100 border border-green-300 px-2.5 py-0.5 text-[11px] font-extrabold text-green-800 flex-shrink-0">🟢 פתוח</span>
                      : <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-500 flex-shrink-0">סגור</span>}
                  </div>
                  <div className="flex items-stretch gap-3 mt-4">
                    <div className={`flex-1 rounded-xl border p-3 ${rows.length > 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-1.5 text-indigo-600 mb-0.5"><Users size={14} /><span className="text-[11px] font-bold text-slate-500">נרשמו</span></div>
                      <p className={`text-2xl font-extrabold ltr-num ${rows.length > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>{rows.length.toLocaleString('he-IL')}</p>
                    </div>
                    {expected != null && (
                      <div className="flex-1 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                        <div className="flex items-center gap-1.5 text-emerald-600 mb-0.5"><Wallet size={14} /><span className="text-[11px] font-bold text-slate-500">צפי</span></div>
                        <p className="text-2xl font-extrabold ltr-num text-emerald-700">{fmtCur(expected)}</p>
                      </div>
                    )}
                  </div>
                  {d.distribution_date && (
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-3"><CalendarDays size={12} />{fmtDate(d.distribution_date)}</p>
                  )}
                  <p className="text-[11px] text-indigo-500 font-bold mt-2">{isOpen ? 'לחצו לסגירת רשימת הנרשמים ▲' : 'לחצו לצפייה ברשימת הנרשמים ▼'}</p>
                </div>
                {/* טבלת נרשמים — נפתחת בלחיצה */}
                {isOpen && (
                  <div className="border-t border-slate-200 bg-white" onClick={e => e.stopPropagation()}>
                    <RecipientsTable rows={rows} amountPerFamily={d.amount_per_family} />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {visible.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
            <Gift size={28} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">{query ? 'לא נמצאו חלוקות לחיפוש זה' : 'אין חלוקות להצגה'}</p>
          </div>
        )}

        <p className="text-center text-[11px] text-slate-400 pt-2">מתעדכן אוטומטית · כל הפרטים מוצפנים</p>
      </main>
    </div>
  )
}
