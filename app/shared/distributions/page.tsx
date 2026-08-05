'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Lock, LogIn, Loader2, Users, Gift, CalendarDays, ShieldCheck, Search, LogOut, MapPin, Baby, GitBranch } from 'lucide-react'
import HolidayRecipientsTable from '@/app/admin/distributions/[id]/HolidayRecipientsTable'
import type { RegisterSource } from '@/lib/distributionSources'
import LineageTreeSvg from '@/app/lineage-review/[token]/LineageTreeSvg'

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
  lineage_node_id?: string | null
}
interface LineageNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status?: string | null
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
const fmtCurNum = (n: number) => `${Math.round(n || 0).toLocaleString('he-IL')} ₪`
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
// ⚠️ כולל שניות — לבקשת ההנהלה, לראות את הרגע המדויק של הרישום (חשוב בשחרור המוני).
const fmtDateTime = (d?: string | null) => d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

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

// ── פילוחים חיים: ערים · קהילות · מספר ילדים ─────────────────────────────────
// כל פילוח מחושב בזמן אמת מכלל הנרשמים (על פני כל החלוקות), ומוצג כגרף עמודות
// אופקי — כדי שאפשר יהיה לסרוק את ההתפלגות במבט. הרשימות ארוכות מקבלות גלילה
// פנימית, כדי שאלפי נרשמים לא ידחפו את הדף.
const KIDS_BUCKETS: { label: string; test: (n: number) => boolean }[] = [
  { label: '0–2 ילדים', test: n => n <= 2 },
  { label: '3–5 ילדים', test: n => n >= 3 && n <= 5 },
  { label: '6–8 ילדים', test: n => n >= 6 && n <= 8 },
  { label: '9 ילדים ומעלה', test: n => n >= 9 },
]

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-[12px] text-slate-600" title={label}>{label}</span>
      <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.max(pct, count > 0 ? 6 : 0)}%` }} />
      </div>
      <span className="w-8 shrink-0 text-left text-[12px] font-bold text-slate-700 ltr-num">{count}</span>
    </div>
  )
}

function BreakdownCard({ title, icon, rows, color, scroll, collapsible }: {
  title: string; icon: React.ReactNode; rows: { label: string; count: number }[]; color: string; scroll?: boolean
  collapsible?: boolean   // ⚠️ קהילות — עשוי להכיל עשרות ערכים ברישום מאסיבי, ולכן
                          // מכווץ כברירת מחדל ונפתח בלחיצה לקוביות קטנות, שלא ידחוף את הדף.
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0)
  const [open, setOpen] = useState(!collapsible)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col">
      <button type="button" disabled={!collapsible} onClick={() => collapsible && setOpen(o => !o)}
        className={`flex items-center gap-2 text-slate-700 ${collapsible ? 'justify-between cursor-pointer' : ''} ${open ? 'mb-4' : ''}`}>
        <span className="flex items-center gap-2">{icon}<h3 className="text-sm font-bold">{title}</h3>
          {collapsible && <span className="text-[11px] font-bold text-slate-400 ltr-num">({rows.length})</span>}
        </span>
        {collapsible && <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>}
      </button>
      {open && (rows.length === 0 ? (
        <p className="text-center text-slate-400 text-xs py-6">אין נתונים</p>
      ) : collapsible ? (
        // ── תצוגת קוביות קטנות (chips) — קומפקטית, מתאימה להרבה ערכים ──
        <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto pl-1">
          {rows.map(r => (
            <span key={r.label} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-100 bg-violet-50 px-2.5 py-1.5">
              <span className="text-[12px] text-slate-700 font-medium max-w-[120px] truncate" title={r.label}>{r.label}</span>
              <span className="rounded-full bg-violet-500 text-white text-[11px] font-bold px-1.5 ltr-num">{r.count}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className={`flex flex-col gap-2.5 ${scroll ? 'max-h-64 overflow-y-auto pl-1' : ''}`}>
          {rows.map(r => <BarRow key={r.label} label={r.label} count={r.count} max={max} color={color} />)}
        </div>
      ))}
    </div>
  )
}

function BreakdownPanels({ recipients }: { recipients: Recipient[] }) {
  // ⚠️ פילוח לפי *משפחה ייחודית* (beneficiary_id) ולא לפי שורת רישום — משפחה
  // שרשומה לשתי חלוקות לא תיספר פעמיים בהתפלגות הדמוגרפית.
  const uniq = useMemo(() => {
    const seen = new Map<string, Beneficiary>()
    for (const r of recipients) {
      const b = r.beneficiary
      const key = b?.id || r.id
      if (b && !seen.has(key)) seen.set(key, b)
    }
    return [...seen.values()]
  }, [recipients])

  const cities = useMemo(() => {
    const m = new Map<string, number>()
    uniq.forEach(b => { const c = b.city?.trim() || 'לא צוין'; m.set(c, (m.get(c) ?? 0) + 1) })
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [uniq])

  const communities = useMemo(() => {
    const m = new Map<string, number>()
    uniq.forEach(b => { const c = b.community_affiliation?.trim() || 'לא צוין'; m.set(c, (m.get(c) ?? 0) + 1) })
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [uniq])

  const kids = useMemo(() =>
    KIDS_BUCKETS.map(bkt => ({ label: bkt.label, count: uniq.filter(b => bkt.test(b.children_count ?? 0)).length })),
    [uniq])

  if (!uniq.length) return null
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <BreakdownCard title="לפי ערים" icon={<MapPin size={16} className="text-rose-500" />} rows={cities} color="bg-rose-400" scroll />
      <BreakdownCard title="לפי קהילות" icon={<Users size={16} className="text-violet-500" />} rows={communities} color="bg-violet-400" scroll />
      <BreakdownCard title="לפי מספר ילדים" icon={<Baby size={16} className="text-teal-500" />} rows={kids} color="bg-teal-400" />
    </div>
  )
}

// ── עץ הדורות הוויזואלי המלא — לצפייה בלבד ────────────────────────────────────
// שימוש חוזר ב-LineageTreeSvg (אותו מנוע בדיוק כמו עץ הניהול ודף הביקורת), עם
// אותם נתונים בדיוק (lineageNodes מה-API). לצפייה בלבד — onSelect ריק, אין עריכה.
function GenerationExplorer({ nodes }: { nodes: LineageNode[] }) {
  if (!nodes.length) return null
  // השורש — צומת דור 1 (החתם סופר). LineageTreeSvg יגזור את כל העץ ממנו.
  const root = nodes.find(n => n.generation === 1) ?? nodes.find(n => !n.parent_id) ?? null
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1 text-slate-700">
        <GitBranch size={16} className="text-indigo-500" />
        <h3 className="text-sm font-bold">עץ הדורות</h3>
      </div>
      <p className="text-[12px] text-slate-500 mb-3">עץ היוחסין המלא — לצפייה בלבד. גררו להזזה · גלגלת לגלילה · Ctrl+גלגלת לזום.</p>
      <LineageTreeSvg
        nodes={nodes.map(n => ({ id: n.id, name: n.name, parent_id: n.parent_id, generation: n.generation, status: n.status ?? 'verified', relation: null }))}
        rootId={root?.id ?? null}
        selectedId={null}
        onSelect={() => { /* צפייה בלבד */ }}
      />
    </div>
  )
}

// ── Main ──
export default function SharedDistributionsPage() {
  const [state, setState] = useState<'checking' | 'locked' | 'unlocked'>('checking')
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [lineageNodes, setLineageNodes] = useState<LineageNode[]>([])
  const [beneficiariesCount, setBeneficiariesCount] = useState(0)
  const [activeTab, setActiveTab] = useState<'distributions' | 'breakdown' | 'tree'>('distributions')
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
        setLineageNodes(d.lineageNodes ?? [])
        setBeneficiariesCount(d.beneficiariesCount ?? 0)
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
    const openCount = distributions.filter(d => d.registration_open).length
    return { openCount, distributions: distributions.length }
  }, [distributions])

  // ── החלוקה הפתוחה לרישום + מספר הנרשמים אליה (הנתון הראשי בכרטיס-העל) ──
  // אם יש כמה פתוחות — הראשונה (העדכנית). אם אין — נופלים לעדכנית ביותר.
  const featured = useMemo(() => {
    const open = distributions.find(d => d.registration_open) ?? distributions[0] ?? null
    if (!open) return null
    const count = (byDist.get(open.id) ?? []).length
    const title = `${open.name}${open.year ? ` ${open.year}` : ''}`
    return { title, count }
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
    <div className="min-h-screen bg-[#FBF8F1]" dir="rtl"
      style={{ backgroundImage: 'radial-gradient(70% 50% at 50% 0%, rgba(176,141,63,0.06), transparent 60%)' }}>
      {/* Header — פס זהב עליון (חותם השושלת) + כותרת ספרותית */}
      <div className="h-1 bg-gradient-to-l from-[#d9b95c] via-[#b08d3f] to-[#8a6a24]" />
      <header className="bg-white/80 backdrop-blur border-b border-[#e8dfc9] sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="היכל החתם סופר" width={46} height={46} className="rounded-xl ring-1 ring-[#e8dfc9]" />
            <div>
              <h1 className="text-xl font-extrabold text-[#3a3630] tracking-tight">חלוקות חגים</h1>
              <p className="text-[11px] text-[#a08a5a] font-semibold flex items-center gap-1 tracking-wide"><ShieldCheck size={12} /> היכל החתם סופר · מרכז השושלת</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 hidden sm:inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              רענון בעוד <span className="font-bold text-[#b08d3f] ltr-num">{countdown}</span> שנ׳
            </span>
            <button onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfc9] bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:border-rose-300 hover:text-rose-600 transition">
              <LogOut size={14} /> התנתקות
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-8 py-8 flex flex-col gap-7">
        {/* ── כרטיס-על: כמות הנרשמים במערכת. הנתון היחיד, לכן מוצג גדול ומכובד —
            "big number" מכוון: זה מדד הליבה שההנהלה מסתכלת עליו. ── */}
        <div className="relative overflow-hidden rounded-3xl border border-[#e8dfc9] bg-white shadow-[0_2px_20px_-8px_rgba(176,141,63,0.25)]">
          <div className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-[#d9b95c] to-[#8a6a24]" />
          <div className="flex items-center gap-5 px-7 py-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f5ecd4] to-[#e6d5a8] ring-1 ring-[#e0cf9e]">
              <Users size={26} className="text-[#9a7b2e]" />
            </div>
            <div>
              <p className="text-[12px] font-bold text-[#a08a5a] tracking-wide mb-0.5">
                מספר הצאצאים שנרשמו לחלוקת {featured?.title ?? 'חגי תשרי תשפ״ז'}
              </p>
              <p className="text-5xl font-extrabold text-[#3a3630] ltr-num leading-none">{(featured?.count ?? 0).toLocaleString('he-IL')}</p>
            </div>
          </div>
        </div>

        {/* ── טאבים ראשיים — פרוסים לרוחב, גדולים ומרווחים (grid שווה) ── */}
        <div className="grid grid-cols-3 gap-3">
          {([
            { key: 'distributions', label: 'רשימת הנרשמים', icon: <Gift size={20} /> },
            { key: 'breakdown', label: 'פילוחים', icon: <MapPin size={20} /> },
            { key: 'tree', label: 'עץ הדורות', icon: <GitBranch size={20} /> },
          ] as const).map(t => (
            <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
              className={`flex items-center justify-center gap-2.5 rounded-2xl px-5 py-5 text-base font-bold transition-all ${
                activeTab === t.key
                  ? 'bg-gradient-to-b from-[#b08d3f] to-[#8a6a24] text-white shadow-[0_6px_18px_-6px_rgba(176,141,63,0.6)]'
                  : 'bg-white border border-[#e8dfc9] text-[#6b5d3e] hover:border-[#d9b95c] hover:text-[#8a6a24] hover:shadow-sm'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── תוכן הטאב הפעיל ── */}

        {activeTab === 'breakdown' && <BreakdownPanels recipients={recipients} />}

        {activeTab === 'tree' && <GenerationExplorer nodes={lineageNodes} />}

        {activeTab === 'distributions' && <>
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
                  </div>
                  {d.distribution_date && (
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-3"><CalendarDays size={12} />{fmtDate(d.distribution_date)}</p>
                  )}
                  <p className="text-[11px] text-indigo-500 font-bold mt-2">{isOpen ? 'לחצו לסגירת רשימת הנרשמים ▲' : 'לחצו לצפייה ברשימת הנרשמים ▼'}</p>
                </div>
                {/* טבלת נרשמים — נפתחת בלחיצה */}
                {isOpen && (
                  <div className="border-t border-slate-200 bg-white" onClick={e => e.stopPropagation()}>
                    <HolidayRecipientsTable
                      rows={rows.map(r => ({
                        id: r.id, source: (r.source ?? 'admin') as RegisterSource,
                        registered_at: r.registered_at ?? null, phone: r.phone ?? null,
                        notified_at: null, notify_error: null, beneficiary_id: r.beneficiary?.id ?? null,
                        approval_status: (r.approval_status ?? 'pending') as 'pending' | 'approved' | 'rejected',
                        card_number: r.card_number ?? null, card_linked_at: r.card_linked_at ?? null,
                        name: benName(r.beneficiary), id_number: r.beneficiary?.id_number ?? null,
                        spouse_name: r.beneficiary?.spouse_name ?? null,
                        ben_phone: r.beneficiary?.phone ?? r.beneficiary?.phone2 ?? r.phone ?? null,
                        email: r.beneficiary?.email ?? null, address: r.beneficiary?.address ?? null,
                        city: r.beneficiary?.city ?? null, age: ageOf(r.beneficiary),
                        children_count: r.beneficiary?.children_count ?? null,
                      }))}
                      amountPerFamily={null}
                      fmtDateTime={fmtDateTime} fmtCur={fmtCurNum}
                      controls={{ hideApproval: true, hideCard: true, hideSource: true }}
                    />
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
        </>}

        <p className="text-center text-[11px] text-slate-400 pt-2">מתעדכן אוטומטית · כל הפרטים מוצפנים</p>
      </main>
    </div>
  )
}
