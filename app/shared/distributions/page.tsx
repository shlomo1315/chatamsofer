'use client'
import { useState, useEffect, useCallback, useMemo, type CSSProperties, type ReactNode } from 'react'
import SharedRecipientsTable from './panels/SharedRecipientsTable'
import { Lock, LogIn, Loader2, Users, Search, MapPin, Baby, GitBranch } from 'lucide-react'
import s from './board.module.css'
import {
  registrationSeries, areaPaths, dayAxis, channelShares, conicOf, topCounts, kidsBuckets, pctOf,
  maternityFunnel, inPeriod, byRecoveryHome, paidByMonth, generationCounts, fanRings,
  type Bar, type Channel,
} from '@/lib/sharedBoard'
import LineageTreeSvg from '@/app/lineage-review/[token]/LineageTreeSvg'
import { BRAND } from './brand'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

// ── עמודות סיכום בתי ההחלמה ──
type HomeColKey = 'home' | 'arrived' | 'nights' | 'paid' | 'unbilled'

// ⚠️ stateOf ו-LABEL הועלו מתוך הרכיב לרמת המודול: הם פונקציות טהורות
// בלי תלות ב-state, וכך אפשר להשתמש בהם גם בהגדרת העמודות (ה-value של
// "מצב") בלי לשכפל את הלוגיקה ובלי useMemo עם תלויות מזויפות.
const stateOf = (r: MaternityRow) => {
  if (!String(r.recovery_home ?? '').trim()) return 'none' as const
  if (r.recovery_arrived !== true) return 'not-realized' as const
  return (r.receiptCount ?? 0) > 0 ? 'realized-charged' as const : 'realized-unbilled' as const
}
const LABEL = {
  'realized-charged': 'מימשה וחויבה',
  'realized-unbilled': 'מימשה — טרם חויבה',
  'not-realized': 'טרם מימשה',
  'none': 'ללא בית החלמה',
} as const

/** שורת הסיכום לבית החלמה אחד — כפי ש-byHome בונה אותה. */
type HomeSummary = { home: string; arrived: number; unbilled: number; amount: number; nights: number; names: string[] }

// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
//
// 🔴 **מיון בלבד, בלי סינון** — לטבלה הזאת יש שורת "סה״כ" שמחושבת מכל
// בתי ההחלמה. סינון היה מסתיר שורות בזמן שהסיכום ממשיך לכלול אותן,
// כלומר סכום שאינו מסתדר עם מה שרואים. מיון אינו משנה סכומים.
const HOME_COLUMNS: ColDef<HomeColKey, HomeSummary>[] = [
  { key: 'home', label: 'בית החלמה', def: true, value: h => h.home },
  { key: 'arrived', label: 'יולדות שהגיעו', def: true, kind: 'number', value: h => h.arrived },
  { key: 'nights', label: 'לילות', def: true, kind: 'number', value: h => h.nights },
  { key: 'paid', label: 'שולם', def: true, kind: 'number', value: h => h.amount },
  { key: 'unbilled', label: 'טרם חויבו', def: true, kind: 'number', value: h => h.unbilled },
]

// ── עמודות הרשימה השמית ──
type MatColKey = 'state' | 'name' | 'id_number' | 'city' | 'baby' | 'birth' | 'home' | 'nights' | 'receipts' | 'amount'

// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
// ⚠️ שם/ת״ז/תינוק — מיון בלבד. מצב, עיר ובית החלמה הם קבוצות ערכים
// סגורות ← גם סינון.
const MAT_COLUMNS: ColDef<MatColKey, MaternityRow>[] = [
  { key: 'state', label: 'מצב', def: true, kind: 'enum', filterable: true,
    // ⚠️ הערך הוא התווית המוצגת ולא הקוד ('realized-charged' וכו').
    value: r => LABEL[stateOf(r)] },
  { key: 'name', label: 'שם המשפחה', def: true,
    value: r => [r.beneficiary?.family_name, r.beneficiary?.full_name || r.beneficiary?.spouse_name]
      .filter(Boolean).join(' ') || null },
  // ⚠️ הערכים שאוחדו קודם (ת"ז, עיר, תינוק, קבלות) הופרדו לעמודות משלהם —
  // הבורר הוא שמחליט מה נכנס למסך, ולא איחוד שמערבב שני ערכים בתא אחד.
  { key: 'id_number', label: 'ת״ז', def: false, kind: 'number', value: r => r.beneficiary?.id_number ?? null },
  { key: 'city', label: 'עיר', def: true, kind: 'enum', filterable: true, value: r => r.beneficiary?.city ?? null },
  { key: 'baby', label: 'שם התינוק', def: false, value: r => r.baby_name || null },
  // ⚠️ ממוין לפי התאריך הגולמי ולא לפי התווית: תאריך מפורמט ממוין
  // אלפביתית ולא כרונולוגית.
  { key: 'birth', label: 'תאריך לידה', def: true, kind: 'date', value: r => r.birth_date ?? null },
  { key: 'home', label: 'בית החלמה', def: true, kind: 'enum', filterable: true, value: r => r.recovery_home || null },
  { key: 'nights', label: 'לילות', def: true, align: 'center', kind: 'number', value: r => r.recovery_nights ?? null },
  // ⚠️ null (ולא 0) כשאין — התא מציג "—", וכך הריקים יורדים לסוף המיון.
  { key: 'receipts', label: 'קבלות', def: false, align: 'center', kind: 'number', value: r => (r.receiptCount ?? 0) || null },
  { key: 'amount', label: 'סכום', def: true, kind: 'number',
    value: r => Number(r.recovery_amount ?? 0) > 0 ? Number(r.recovery_amount) : null },
]

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
interface MaternityRow {
  id: string
  birth_date?: string | null
  baby_name?: string | null
  baby_gender?: string | null
  recovery_home?: string | null
  recovery_arrived?: boolean | null
  recovery_arrived_at?: string | null
  recovery_nights?: number | null
  recovery_amount?: number | null
  receiptCount?: number | null
  card_number?: string | null
  card_voucher_status?: string | null
  status?: string | null
  created_at?: string | null
  beneficiary?: {
    full_name?: string | null
    family_name?: string | null
    spouse_name?: string | null
    id_number?: string | null
    phone?: string | null
    city?: string | null
  } | null
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
  /** החלוקה החיה — נקבע בשרת (pickLiveDistribution). לכל היותר אחת. */
  live?: boolean
}

const fmtCurNum = (n: number) => `${Math.round(n || 0).toLocaleString('he-IL')} ₪`
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

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
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f0] via-[#f5efe0] to-[#ece0c4] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl overflow-hidden border" style={{ borderColor: BRAND.sand, boxShadow: '0 24px 60px -30px rgba(138,106,36,0.55)' }}>
          {/* 🔴 זהב המותג ולא indigo/violet: זה המסך הראשון שרואים, וגרדיאנט
              סגול גנרי הוא בדיוק מה שגורם לדף להיראות כתבנית ולא כזהות. */}
          <div className="relative overflow-hidden px-8 py-9 text-center"
            style={{ background: `linear-gradient(160deg, ${BRAND.goldDeep}, ${BRAND.gold} 60%, #9a7a2e)` }}>
            <span aria-hidden className="pointer-events-none absolute -top-16 right-1/3 h-40 w-40 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.25), transparent 70%)' }} />
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/25 ring-1 ring-white/30 mb-4">
              <Lock size={28} className="text-white" />
            </div>
            <h1 className="relative text-xl font-extrabold text-white">איגוד הצאצאים</h1>
            <p className="relative text-sm mt-1 text-white/75">שעל ידי היכל החתם סופר</p>
          </div>
          <form onSubmit={submit} className="px-8 py-7 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">סיסמת כניסה</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="הזן סיסמה..." autoFocus
                className="w-full rounded-xl border border-[#e8dfc9] bg-[#faf7f0] px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#d9b95c]/60 focus:border-[#b08d3f] transition-shadow" />
              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
            </div>
            <button type="submit" disabled={loading || !password}
              className="flex items-center justify-center gap-2 rounded-xl text-white font-bold py-3 text-sm transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: `linear-gradient(90deg, ${BRAND.goldDeep}, ${BRAND.gold})`, boxShadow: '0 10px 24px -14px rgba(138,106,36,0.9)' }}>
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
// 🔴 קודם הוחזר `null` כשאין צמתים — כלומר מסך לבן לגמרי, בלי הבדל בין
// "עדיין טוען", "הטעינה נכשלה" ו"אין נתונים". המצב חייב להיראות.
function GenerationExplorer({ nodes, loading, onRetry }: {
  nodes: LineageNode[]; loading?: boolean; onRetry?: () => void
}) {
  if (!nodes.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        {loading ? (
          <>
            <Loader2 size={22} className="mx-auto animate-spin text-indigo-500" />
            <p className="mt-3 text-sm font-bold text-slate-600">טוען את עץ הדורות…</p>
            <p className="mt-1 text-[12px] text-slate-400">אלפי צמתים — הטעינה עשויה לקחת כמה שניות</p>
          </>
        ) : (
          <>
            <GitBranch size={22} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-600">עץ הדורות לא נטען</p>
            {onRetry && (
              <button type="button" onClick={onRetry}
                className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-[12px] font-bold text-indigo-600 transition hover:border-indigo-300">
                נסה שוב
              </button>
            )}
          </>
        )}
      </div>
    )
  }
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
// ⚠️ הטבלה עברה ל-panels/SharedRecipientsTable — היא זהה במבנה לזו של
// ממשק הניהול (עמודות נפרדות, בורר עמודות, חיפוש חופשי, בלי גלילה לרוחב).

// ── Main ──
// ─────────────────────────────────────────────────────────────────────────────
// טאב עזר יולדות — תצוגה בלבד.
//
// ⚠️ המצב נגזר משני צירים ולא מ-status: הגעה בפועל לבית ההחלמה, וקבלה
// שהוגשה. הפער ביניהם — מי שמימשה ובית ההחלמה טרם גבה — הוא כסף שטרם שולם,
// והוא נעלם לגמרי כשמציגים סטטוס גולמי בלבד.
// ─────────────────────────────────────────────────────────────────────────────
function MaternityPanel({ rows }: { rows: MaternityRow[] }) {
  const [q, setQ] = useState('')
  const [home, setHome] = useState('')

  const STYLE = {
    'realized-charged': 'bg-emerald-50 text-emerald-800 border-emerald-200',
    'realized-unbilled': 'bg-amber-50 text-amber-800 border-amber-200',
    'not-realized': 'bg-[#f6f1e4] text-[#6b5d3e] border-[#e8dfc9]',
    'none': 'bg-slate-50 text-slate-400 border-slate-100',
  } as const

  const homes = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) { const h = String(r.recovery_home ?? '').trim(); if (h) s.add(h) }
    return [...s].sort()
  }, [rows])

  // ── סינון לפי טווח תאריכים ──
  //
  // ⚠️ התאריך הקובע הוא *ההגעה בפועל* (recovery_arrived_at) ולא הלידה:
  // דוח פעילות של בית החלמה שואל "כמה יולדות שהו אצלי בחודש X", ולידה
  // בסוף החודש עם שהות בחודש הבא הייתה נספרת בחודש הלא נכון.
  // ⚠️ נפילה-לאחור לתאריך הלידה רק כשאין תאריך הגעה — כדי ששורות
  // ותיקות לא ייעלמו מהדוח לגמרי.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const rowDate = (r: MaternityRow): string | null =>
    r.recovery_arrived_at ?? r.birth_date ?? null

  /** קיצורי טווח — החודש, הקודם, 3 חודשים, הכל. */
  const setRange = (kind: 'this' | 'prev' | 'q' | 'all') => {
    if (kind === 'all') { setFrom(''); setTo(''); return }
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    if (kind === 'this') { setFrom(iso(new Date(y, m, 1))); setTo(iso(new Date(y, m + 1, 0))) }
    else if (kind === 'prev') { setFrom(iso(new Date(y, m - 1, 1))); setTo(iso(new Date(y, m, 0))) }
    else { setFrom(iso(new Date(y, m - 2, 1))); setTo(iso(new Date(y, m + 1, 0))) }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (home && String(r.recovery_home ?? '').trim() !== home) return false
      const rd = rowDate(r)
      // ⚠️ שורה בלי תאריך כלל נשמרת רק כשאין סינון — אחרת דוח חודשי
      // היה כולל שורות שאיש אינו יודע מתי קרו.
      if ((from || to) && !rd) return false
      if (from && rd && rd.slice(0, 10) < from) return false
      if (to && rd && rd.slice(0, 10) > to) return false
      if (!needle) return true
      const b = r.beneficiary
      return [b?.family_name, b?.full_name, b?.spouse_name, b?.id_number, b?.city, r.baby_name, r.recovery_home]
        .filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [rows, q, home, from, to])

  // ── פילוח לפי בית החלמה ──
  // ⚠️ נגזר מ-filtered ולא מ-rows: הפילוח חייב לשקף את הטווח שנבחר,
  // אחרת המספרים בטבלה והמספרים בפילוח סותרים זה את זה.
  const byHome = useMemo(() => {
    const m = new Map<string, { home: string; arrived: number; unbilled: number; amount: number; nights: number; names: string[] }>()
    for (const r of filtered) {
      const h = String(r.recovery_home ?? '').trim()
      if (!h) continue
      const e = m.get(h) ?? { home: h, arrived: 0, unbilled: 0, amount: 0, nights: 0, names: [] }
      const s = stateOf(r)
      if (s === 'realized-charged' || s === 'realized-unbilled') {
        e.arrived++
        if (s === 'realized-unbilled') e.unbilled++
        const b = r.beneficiary
        const nm = [b?.family_name, b?.spouse_name || b?.full_name].filter(Boolean).join(' ')
        if (nm) e.names.push(nm)
      }
      e.amount += Number(r.recovery_amount ?? 0) || 0
      e.nights += Number(r.recovery_nights ?? 0) || 0
      m.set(h, e)
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount || b.arrived - a.arrived)
  }, [filtered])

  const totals = useMemo(() => {
    let charged = 0, unbilled = 0, notRealized = 0, amount = 0, nights = 0
    for (const r of filtered) {
      const s = stateOf(r)
      if (s === 'realized-charged') charged++
      else if (s === 'realized-unbilled') unbilled++
      else if (s === 'not-realized') notRealized++
      amount += Number(r.recovery_amount ?? 0) || 0
      nights += Number(r.recovery_nights ?? 0) || 0
    }
    return { charged, unbilled, notRealized, amount, nights }
  }, [filtered])

  const d = (v?: string | null) => {
    if (!v) return '—'
    const dt = new Date(v)
    return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('he-IL')
  }
  const cur = (n: number) => `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n)} ₪`

  // בורר עמודות + גרירת רוחב — רכיב מערכתי משותף, אחד לכל טבלה.
  // ⚠️ mode:'client' — כל הרשומות מגיעות כ-prop, אין דפדוף בשרת.
  // 🔴 טבלת בתי ההחלמה: מיון בלבד (אין עמודה עם filterable) — יש בה
  // שורת "סה״כ", וסינון היה מסתיר שורות בזמן שהסיכום כולל אותן.
  const htc = useTableColumns<HomeColKey, HomeSummary>('shared-recovery-homes', HOME_COLUMNS, {
    sortFilter: { mode: 'client', rows: byHome },
  })
  // 🔴 הרשימה השמית מקבלת את filtered (אחרי בוררי הטווח/הבית והחיפוש).
  const mtc = useTableColumns<MatColKey, MaternityRow>('shared-maternity-rows', MAT_COLUMNS, {
    sortFilter: { mode: 'client', rows: filtered },
  })

  const homeCell = (c: ColDef<HomeColKey>, h: typeof byHome[number]) => {
    switch (c.key) {
      case 'home':
        return (
          <span className="block">
            <span className="block font-bold text-[#3a3630]">{h.home}</span>
            {/* ⚠️ השמות מוצגים כאן ולא רק בטבלה למטה: הבקשה הייתה
                לראות "כמה יולדות הגיעו עם שמות" בלי לחפש. */}
            {h.names.length > 0 && (
              <span className="block text-[11px] text-[#8a7a56] leading-relaxed mt-0.5">
                {h.names.join(' · ')}
              </span>
            )}
          </span>
        )
      case 'arrived': return <span className="font-bold text-[#3a3630] tabular-nums">{h.arrived}</span>
      case 'nights': return <span className="tabular-nums text-[#6b5d3e]">{h.nights || '—'}</span>
      case 'paid':
        return <span className="font-bold text-emerald-800 tabular-nums">
          {h.amount ? `₪${Math.round(h.amount).toLocaleString('he-IL')}` : '—'}
        </span>
      case 'unbilled':
        return h.unbilled
          ? <span className="inline-block rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 font-bold tabular-nums">{h.unbilled}</span>
          : <span className="text-[#b3a382]">—</span>
    }
  }

  // סכום העמודה בשורת הסה״כ — נגזר מאותה הגדרת עמודות, כדי שהסה״כ
  // יישאר מיושר לכותרת גם כשמסתירים עמודות.
  const homeTotal = (c: ColDef<HomeColKey>) => {
    switch (c.key) {
      case 'home': return 'סה״כ'
      case 'arrived': return byHome.reduce((s, h) => s + h.arrived, 0)
      case 'nights': return byHome.reduce((s, h) => s + h.nights, 0) || '—'
      case 'paid': return `₪${Math.round(byHome.reduce((s, h) => s + h.amount, 0)).toLocaleString('he-IL')}`
      case 'unbilled': return byHome.reduce((s, h) => s + h.unbilled, 0) || '—'
    }
  }

  const matCell = (c: ColDef<MatColKey>, r: MaternityRow) => {
    const b = r.beneficiary
    switch (c.key) {
      case 'state': {
        const s = stateOf(r)
        return <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${STYLE[s]}`}>{LABEL[s]}</span>
      }
      case 'name':
        return <span className="font-bold text-[#3a3630]">
          {[b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || '—'}
        </span>
      case 'id_number': return <span className="text-[#8a7a56] ltr-num">{b?.id_number ?? '—'}</span>
      case 'city': return <span className="text-[#6b5d3e]">{b?.city ?? '—'}</span>
      case 'baby': return <span className="text-[#8a7a56]">{r.baby_name || '—'}</span>
      case 'birth': return <span className="text-[#6b5d3e] ltr-num">{d(r.birth_date)}</span>
      case 'home':
        return (
          <span className="block text-[#6b5d3e]">
            {r.recovery_home || '—'}
            {/* ⚠️ ההגעה מתחת לבית ההחלמה — היא חסרת משמעות בלעדיו. */}
            {r.recovery_arrived && (
              <span className="block text-[11px] text-emerald-700 ltr-num">הגיעה {d(r.recovery_arrived_at)}</span>
            )}
          </span>
        )
      case 'nights': return <span className="text-[#6b5d3e] ltr-num">{r.recovery_nights ?? '—'}</span>
      case 'receipts': return <span className="text-[#6b5d3e] ltr-num">{(r.receiptCount ?? 0) || '—'}</span>
      case 'amount':
        return <span className="font-bold text-emerald-700 ltr-num">
          {Number(r.recovery_amount ?? 0) > 0 ? cur(Number(r.recovery_amount)) : '—'}
        </span>
    }
  }

  return (
    <div className="space-y-4">
      {/* סיכום */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'מימשו וחויבו', value: totals.charged.toLocaleString('he-IL'), tone: 'text-emerald-700' },
          { label: 'מימשו — טרם חויבו', value: totals.unbilled.toLocaleString('he-IL'), tone: 'text-amber-700' },
          { label: 'טרם מימשו', value: totals.notRealized.toLocaleString('he-IL'), tone: 'text-[#6b5d3e]' },
          { label: 'סך שחויב', value: cur(totals.amount), tone: 'text-emerald-700' },
        ].map(c => (
          <div key={c.label} className="rounded-2xl border border-[#e8dfc9] bg-white p-4">
            <p className="text-[11px] font-bold text-[#8a7a56]">{c.label}</p>
            <p className={`text-2xl font-extrabold ltr-num mt-1 ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* סינון */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-[#b3a382] pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש בשם, ת״ז, עיר…"
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-[#e8dfc9] bg-white text-[#3a3630] placeholder:text-[#b3a382] focus:outline-none focus:ring-2 focus:ring-[#d9b95c]/40" />
        </div>
        <select value={home} onChange={e => setHome(e.target.value)}
          className="rounded-xl border border-[#e8dfc9] bg-white px-3 py-2 text-sm font-bold text-[#6b5d3e] focus:outline-none focus:ring-2 focus:ring-[#d9b95c]/40">
          <option value="">כל בתי ההחלמה</option>
          {homes.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>

      {/* ── סינון לפי תקופה ──
          ⚠️ קיצורים *וגם* טווח חופשי: הקיצורים מכסים את השאלה הנפוצה
          ("מה היה החודש"), והטווח החופשי נדרש לחשבונית מול בית החלמה
          שאינה מתיישרת לגבולות חודש. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {([
            { k: 'this' as const, label: 'החודש' },
            { k: 'prev' as const, label: 'חודש קודם' },
            { k: 'q' as const, label: '3 חודשים' },
            { k: 'all' as const, label: 'הכל' },
          ]).map(b => (
            <button key={b.k} type="button" onClick={() => setRange(b.k)}
              className="rounded-lg border border-[#e8dfc9] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#6b5d3e] hover:bg-[#faf6ec] transition-colors">
              {b.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-[#8a7a56]">
          מתאריך
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-[#e8dfc9] bg-white px-2 py-1.5 text-[12px] text-[#3a3630] focus:outline-none focus:ring-2 focus:ring-[#d9b95c]/40" />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-[#8a7a56]">
          עד
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-[#e8dfc9] bg-white px-2 py-1.5 text-[12px] text-[#3a3630] focus:outline-none focus:ring-2 focus:ring-[#d9b95c]/40" />
        </label>
        {(from || to) && (
          <span className="text-[11px] text-[#8a7a56]">· לפי מועד ההגעה לבית ההחלמה</span>
        )}
      </div>

      {/* ── פילוח לפי בית החלמה ──
          ⚠️ מוצג מעל הטבלה ולא מתחתיה: זו השאלה שבגללה נכנסים למסך
          ("כמה שילמתי לכל בית וכמה יולדות הגיעו"), והפירוט השמי הוא
          העומק שמתחתיו. */}
      {byHome.length > 0 && (
        <div className="rounded-2xl border border-[#e8dfc9] bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#f0e9d8] bg-[#faf6ec] flex items-center justify-between gap-2">
            <span className="text-[13px] font-extrabold text-[#6b5d3e]">סיכום לפי בית החלמה</span>
            <span className="text-[11px] text-[#8a7a56]">{byHome.length} בתים · {filtered.length} רשומות</span>
          </div>
          {/* ⚠️ בלי overflow-x ובלי min-w: אין גלילה לרוחב בשום טבלה. */}
          <div className="w-full">
            <div className="flex flex-col gap-2 px-3 py-3">{htc.picker}{htc.activeFilters}</div>
            <table className="w-full text-[12px] border-collapse" style={htc.rt.tableStyle}>
              <colgroup>{htc.rt.cols}</colgroup>
              <thead>
                <tr className="bg-[#fdfaf3] text-[#8a7a56] text-[11px]
                               [&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th]:font-bold
                               [&>th]:border-l [&>th]:border-[#f0e9d8] [&>th:last-child]:border-l-0">
                  {/* כותרת אחידה לכל המערכת — מיון וגרירת רוחב.
                      ⚠️ הריפוד מגיע מ-[&>th] שעל ה-<tr>. */}
                  {htc.shown.map((c, i) => htc.th(c, i))}
                </tr>
              </thead>
              <tbody>
                {/* 🔴 htc.rows ולא byHome — אחרת המיון בכותרת לא היה
                    משפיע על מה שמוצג בפועל. */}
                {htc.rows.map(h => (
                  <tr key={h.home} className="border-t border-[#f4efe1]
                    [&>td]:px-3 [&>td]:py-2.5 [&>td]:border-l [&>td]:border-[#f0e9d8] [&>td:last-child]:border-l-0">
                    {htc.shown.map(c => (
                      <td key={c.key} className={htc.cellClass(c)}>{homeCell(c, h)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#faf6ec] border-t-2 border-[#e8dfc9] font-extrabold text-[#3a3630]
                  [&>td]:px-3 [&>td]:py-2.5 [&>td]:border-l [&>td]:border-[#f0e9d8] [&>td:last-child]:border-l-0">
                  {htc.shown.map(c => (
                    <td key={c.key} className={`${htc.cellClass(c)} tabular-nums`}>{homeTotal(c)}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* הטבלה */}
      <div className="rounded-2xl border border-[#e8dfc9] bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[#8a7a56]">לא נמצאו רשומות</p>
        ) : (
          // 🔴 בלי overflow-x: הבורר קובע אילו עמודות נכנסות למסך.
          <div className="w-full">
            <div className="flex flex-col gap-2 px-2.5 py-3">{mtc.picker}{mtc.activeFilters}</div>
            <table className="w-full text-[12px] border-collapse" style={mtc.rt.tableStyle}>
              <colgroup>{mtc.rt.cols}</colgroup>
              <thead className="bg-[#faf7ef] text-[#8a7a56]">
                <tr className="[&>th]:px-2.5 [&>th]:py-2.5 [&>th]:font-bold [&>th]:text-right [&>th]:border-l [&>th]:border-[#efe7d4] [&>th:last-child]:border-l-0">
                  {/* כותרת אחידה לכל המערכת — מיון, סינון וגרירת רוחב.
                      ⚠️ הריפוד מגיע מ-[&>th] שעל ה-<tr>. */}
                  {mtc.shown.map((c, i) => mtc.th(c, i))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f4efe2]">
                {/* 🔴 mtc.rows ולא filtered — אחרת המיון והסינון בכותרת
                    לא היו משפיעים על מה שמוצג בפועל. */}
                {mtc.rows.map(r => (
                  <tr key={r.id} className="hover:bg-[#faf7ef] [&>td]:px-2.5 [&>td]:py-2 [&>td]:border-l [&>td]:border-[#f4efe2] [&>td:last-child]:border-l-0">
                    {mtc.shown.map(c => (
                      <td key={c.key} className={mtc.cellClass(c)}>{matCell(c, r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-[#a8996f]">
        מוצגות {filtered.length.toLocaleString('he-IL')} מתוך {rows.length.toLocaleString('he-IL')} רשומות · תצוגה בלבד
      </p>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// עיצוב ב׳ · לוח (מוקאפ מאושר 24.11.2026): תפריט צד, ארבעה דפים — בית,
// חלוקות חגים, עזר יולדות וצאצאים. גמ״ח ההלוואות הוצא מכאן (נשאר ב-/shared/loans).
// ⚠️ הניווט ב-hash (#page/tab), כדי שקישור או רענון ישאירו את אותו מסך.
// ─────────────────────────────────────────────────────────────────────────────
const cssVars = (o: Record<string, string | number>) => o as CSSProperties
const num = (v: number) => Math.round(v || 0).toLocaleString('he-IL')

const ICONS: Record<'home' | 'gift' | 'baby' | 'tree' | 'ref' | 'out', ReactNode> = {
  home: <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1" /><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z" /></>,
  baby: <><circle cx="12" cy="12" r="8" /><path d="M9 11h.01M15 11h.01M9.5 15c1.5 1 3.5 1 5 0" /></>,
  tree: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 8v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V8M12 13v4" /></>,
  ref: <path d="M20 11a8 8 0 1 0-2 5.3M20 5v6h-6" />,
  out: <path d="M10 5H5v14h5M14 8l-4 4 4 4M10 12h10" />,
}
const Ico = ({ k, className }: { k: keyof typeof ICONS; className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>{ICONS[k]}</svg>
)

type Page = 'home' | 'holidays' | 'maternity' | 'tree'
const PAGES: Page[] = ['home', 'holidays', 'maternity', 'tree']

function readHash(): [Page, string] {
  if (typeof window === 'undefined') return ['home', '']
  const [p = '', t = ''] = window.location.hash.slice(1).split('/')
  return [PAGES.includes(p as Page) ? (p as Page) : 'home', t]
}

function greeting(d = new Date()) {
  const h = d.getHours()
  return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב'
}

const famName = (b?: { full_name?: string | null; family_name?: string | null; spouse_name?: string | null } | null) => {
  if (!b) return '—'
  const name = [b.family_name, b.full_name].filter(Boolean).join(' ') || '—'
  return b.spouse_name ? `${name} ו${b.spouse_name}` : name
}

const distLabel = (d: Distribution) => `${d.name}${d.year ? ` ${d.year}` : ''}`

/** "21.11 · 18:04:39" — כמו בטבלה במוקאפ. */
const stamp = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} · ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const channelOf = (source?: string | null) => channelShares([{ source }]).find(c => c.count > 0)?.label ?? '—'

const APPROVAL_PILL: Record<string, [string, string]> = {
  approved: [s.pOk, 'מאושר'],
  pending: [s.pWt, 'ממתין'],
  rejected: [s.pNo, 'נדחה'],
}
const MAT_PILL: Record<ReturnType<typeof stateOf>, string> = {
  'realized-charged': s.pOk,
  'realized-unbilled': s.pWt,
  'not-realized': s.pNo,
  none: s.pNo,
}

// ── רכיבי הלוח ──
function AreaChart({ values }: { values: number[] }) {
  const { line, area } = areaPaths(values)
  return (
    <svg className={s.area} viewBox="0 0 600 170" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill="var(--area)" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

function HBars({ bars, fmt = num }: { bars: Bar[]; fmt?: (v: number) => string }) {
  const max = Math.max(0, ...bars.map(b => b.value))
  return (
    <div>
      {bars.map(b => (
        <div key={b.label} className={s.hb}>
          <span className={s.l} title={b.label}>{b.label}</span>
          <span className={s.t}><i style={cssVars({ '--w': `${pctOf(b.value, max)}%` })} /></span>
          <b>{fmt(b.value)}</b>
        </div>
      ))}
    </div>
  )
}

function Cols({ bars, fmt = num, height, lastBar }: { bars: Bar[]; fmt?: (v: number) => string; height?: number; lastBar?: string }) {
  const max = Math.max(0, ...bars.map(b => b.value))
  return (
    <div className={s.cols} style={height ? { height } : undefined}>
      {bars.map((b, i) => (
        <div key={`${b.label}-${i}`} className={s.c}>
          <b>{fmt(b.value)}</b>
          <i style={cssVars({ '--h': `${pctOf(b.value, max)}%`, ...(lastBar && i === bars.length - 1 ? { '--bar': lastBar } : {}) })} />
          <span>{b.label}</span>
        </div>
      ))}
    </div>
  )
}

function Legend({ parts, wide }: { parts: Channel[]; wide?: boolean }) {
  return (
    <div className={s.leg} style={wide ? { width: '100%' } : undefined}>
      {parts.map(p => (
        <div key={p.key}>
          <i style={{ background: p.color }} />
          <span>{p.label}</span>
          <b>{Math.round(p.pct)}%</b>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, hint, link, className, style, flush, children }: {
  title: ReactNode; hint?: ReactNode; link?: { href: string; label: string }
  className?: string; style?: CSSProperties; flush?: boolean; children: ReactNode
}) {
  return (
    <section className={`${s.pn} ${className ?? ''}`} style={style}>
      <div className={s.ph}>
        <h3>{title}</h3>
        {link ? <a className={s.lk} href={link.href}>{link.label}</a> : hint ? <span className={s.hint}>{hint}</span> : null}
      </div>
      {flush ? children : <div className={s.bd}>{children}</div>}
    </section>
  )
}

function Funnel({ f, gaps }: { f: ReturnType<typeof maternityFunnel>; gaps?: boolean }) {
  const row = (label: string, value: number, opacity: number) => (
    <div className={s.r}>
      <span>{label}</span>
      <span className={s.t}><i style={cssVars({ '--w': `${pctOf(value, f.born)}%`, opacity })} /></span>
      <b>{num(value)}</b>
    </div>
  )
  return (
    <div className={s.fun}>
      {row('נולדו', f.born, 1)}
      {gaps && <div className={s.gap}>{num(f.born - f.arrived)} לא הגיעו</div>}
      {row('הגיעו לבית החלמה', f.arrived, 0.7)}
      {gaps && <div className={s.gap}>{num(f.waiting)} ממתינות לקבלה</div>}
      {row('חויבו · שולם', f.billed, 0.45)}
    </div>
  )
}

function FanChart({ counts }: { counts: { generation: number; count: number }[] }) {
  const rings = fanRings(counts)
  return (
    <svg className={s.fan} viewBox="0 0 400 214" role="img" aria-label="מניפת הדורות">
      <path d="M164,206 A36 36 0 0 1 236,206Z" fill="currentColor" />
      {rings.map(r => (
        <path
          key={r.generation}
          d={`M${200 - r.r},206 A${r.r} ${r.r} 0 0 1 ${200 + r.r},206`}
          fill="none" stroke="currentColor" strokeWidth={r.width}
          strokeDasharray={`${r.dash} 2`} opacity={r.opacity}
        >
          <title>{`דור ${r.generation}`}</title>
        </path>
      ))}
    </svg>
  )
}

const Skeleton = ({ h }: { h: number }) => <div className={s.sk} style={{ height: h }} />

function Tabs({ page, tab, items }: { page: Page; tab: string; items: { key: string; label: string; count?: number }[] }) {
  return (
    <nav className={s.tabs}>
      {items.map(t => (
        <a key={t.key} href={`#${page}${t.key ? `/${t.key}` : ''}`} className={tab === t.key ? s.on : undefined}>
          {t.label}{t.count != null && <em>{num(t.count)}</em>}
        </a>
      ))}
    </nav>
  )
}

export default function SharedDistributionsPage() {
  const [state, setState] = useState<'checking' | 'locked' | 'unlocked'>('checking')
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [lineageNodes, setLineageNodes] = useState<LineageNode[]>([])
  // 🔴 העץ נטען **פעם אחת בלבד**, לפי דרישה (בכניסה לבית או לצאצאים) —
  // אלפי צמתים, ואין סיבה למשוך אותם שוב בכל רענון.
  const [lineageLoaded, setLineageLoaded] = useState(false)
  const [lineageLoading, setLineageLoading] = useState(false)
  const [beneficiariesCount, setBeneficiariesCount] = useState(0)
  const [maternity, setMaternity] = useState<MaternityRow[]>([])
  const [[page, tab], setRoute] = useState<[Page, string]>(['home', ''])
  // null = ברירת מחדל: החלוקה החיה אם יש, אחרת חלוקות קודמות
  const [holView, setHolView] = useState<'live' | 'prev' | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [period, setPeriod] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shared/distributions', { cache: 'no-store' })
      if (res.status === 401) { setState('locked'); return }
      if (res.ok) {
        const d = await res.json()
        setDistributions(d.distributions ?? [])
        setRecipients(d.recipients ?? [])
        setBeneficiariesCount(d.beneficiariesCount ?? 0)
        setMaternity(d.maternity ?? [])
        setUpdatedAt(new Date())
        setState('unlocked')
      }
    } catch { /* נשאר במצב הנוכחי; כפתור הרענון ינסה שוב */ }
  }, [])

  // ⚠️ `force` נדרש ל"נסה שוב": איפוס `lineageLoaded` ב-state לא משנה את
  // הערך שנתפס ב-closure של הפונקציה הזו, והניסיון החוזר היה יוצא מיד.
  const loadLineage = useCallback(async (force = false) => {
    if (!force && (lineageLoaded || lineageLoading)) return
    setLineageLoading(true)
    try {
      const r = await fetch('/api/shared/distributions/lineage', { cache: 'no-store' })
      if (r.ok) {
        const d = await r.json()
        setLineageNodes(d.lineageNodes ?? [])
        setLineageLoaded(true)
      }
    } catch { /* נשאר לא-טעון; ניסיון חוזר בכניסה הבאה */ }
    finally { setLineageLoading(false) }
  }, [lineageLoaded, lineageLoading])

  // טעינה ראשונית (ה-setState קורה אחרי ה-fetch, לא באופן סינכרוני)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const sync = () => setRoute(readHash())
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state === 'unlocked' && (page === 'home' || page === 'tree')) void loadLineage()
  }, [state, page, loadLineage])

  // 🔴 אין רענון אוטומטי (הוא משך אלפי שורות כל 10 שניות ותקע את הדף) — רק כפתור.
  const refresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const logout = useCallback(async () => {
    try { await fetch('/api/shared/distributions/logout', { method: 'POST' }) } catch {}
    setState('locked')
  }, [])

  // ── חלוקות חגים ──
  const byDist = useMemo(() => {
    const m = new Map<string, Recipient[]>()
    for (const r of recipients) {
      const list = m.get(r.distribution_id) ?? []
      list.push(r)
      m.set(r.distribution_id, list)
    }
    return m
  }, [recipients])
  const live = distributions.find(d => d.live) ?? null
  const prevDists = useMemo(() => distributions.filter(d => !d.live), [distributions])
  const view = holView ?? (live ? 'live' : 'prev')
  const selected = view === 'live' && live ? live : (prevDists.find(d => d.id === pickedId) ?? prevDists[0] ?? null)
  const selRows = useMemo(() => (selected ? byDist.get(selected.id) ?? [] : []), [selected, byDist])
  const homeDist = live ?? distributions[0] ?? null
  const homeRows = useMemo(() => (homeDist ? byDist.get(homeDist.id) ?? [] : []), [homeDist, byDist])

  const hol = useMemo(() => {
    const approved = selRows.filter(r => r.approval_status === 'approved').length
    const rejected = selRows.filter(r => r.approval_status === 'rejected').length
    const series = registrationSeries(selRows)
    const recent = [...selRows]
      .sort((a, b) => String(b.registered_at ?? '').localeCompare(String(a.registered_at ?? '')))
      .slice(0, 8)
    return {
      approved,
      pending: selRows.length - approved - rejected,
      series,
      channels: channelShares(selRows),
      cities: topCounts(selRows, r => r.beneficiary?.city, 6),
      kids: kidsBuckets(selRows.map(r => r.beneficiary ?? {})),
      recent,
    }
  }, [selRows])

  const home = useMemo(() => ({
    approved: homeRows.filter(r => r.approval_status === 'approved').length,
    series: registrationSeries(homeRows),
    channels: channelShares(homeRows),
  }), [homeRows])

  // ── עזר יולדות ──
  const matAll = useMemo(() => maternityFunnel(maternity), [maternity])
  const matRows = useMemo(() => inPeriod(maternity, period), [maternity, period])
  const mat = useMemo(() => ({
    funnel: maternityFunnel(matRows),
    homes: byRecoveryHome(matRows),
    recent: [...matRows].sort((a, b) => String(b.birth_date ?? '').localeCompare(String(a.birth_date ?? ''))).slice(0, 8),
  }), [matRows])
  const months = useMemo(() => paidByMonth(maternity), [maternity])

  // ── צאצאים ──
  const gens = useMemo(() => generationCounts(lineageNodes), [lineageNodes])
  const biggest = gens.reduce<{ generation: number; count: number } | null>((m, g) => (!m || g.count > m.count ? g : m), null)
  const homeGens = [...gens].sort((a, b) => b.count - a.count).slice(0, 4).sort((a, b) => a.generation - b.generation)
  const treeReady = lineageLoaded && !lineageLoading

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f1ec]" dir="rtl">
        <Loader2 className="animate-spin text-[#9a6b12]" size={32} />
      </div>
    )
  }
  if (state === 'locked') {
    return <PasswordScreen onAuth={() => { setState('checking'); void load() }} />
  }

  const refreshBtn = (
    <button type="button" className={s.btn} onClick={() => void refresh()} disabled={refreshing}>
      <Ico k="ref" className={refreshing ? s.spin : undefined} />רענון
    </button>
  )
  const nav = (key: Page, label: string, icon: keyof typeof ICONS, count?: number) => (
    <a href={`#${key}`} className={page === key ? s.on : undefined} aria-current={page === key ? 'page' : undefined}>
      <Ico k={icon} /><span>{label}</span>{count != null ? <em>{num(count)}</em> : <span />}
    </a>
  )
  const treeSk = <><Skeleton h={18} /><div style={{ height: 8 }} /><Skeleton h={18} /><div style={{ height: 8 }} /><Skeleton h={18} /></>

  return (
    <div className={s.B} dir="rtl">
      <div className={s.app}>
        <aside className={s.side}>
          <div className={s.brand}>
            <span className={s.mono}>ח״ס</span>
            <div><b>איגוד הצאצאים</b><span>היכל החתם סופר</span></div>
          </div>
          <div>
            <p className={s.sl}>סקירה</p>
            <nav className={s.nv}>{nav('home', 'בית', 'home')}</nav>
          </div>
          <div>
            <p className={s.sl}>מחלקות</p>
            <nav className={s.nv}>
              {nav('holidays', 'חלוקות חגים', 'gift', live ? (byDist.get(live.id) ?? []).length : undefined)}
              {nav('maternity', 'עזר יולדות', 'baby', maternity.length)}
              {nav('tree', 'צאצאים', 'tree', beneficiariesCount)}
            </nav>
          </div>
          <div className={s.sfoot}>
            <span className={s.ro}>תצוגה בלבד</span>
            {updatedAt && <span>עודכן {updatedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>}
            <button type="button" className={s.out} onClick={() => void logout()}><Ico k="out" />התנתקות</button>
          </div>
        </aside>

        <main className={s.main}>
          {page === 'home' && (
            <div className={s.page} key="home">
              <header className={s.hd}>
                <div>
                  <h1>{greeting()}</h1>
                  <p>{homeDist ? `${distLabel(homeDist)} · ${homeDist.registration_open ? 'הרישום פתוח' : 'הרישום סגור'}` : 'אין עדיין חלוקות'}</p>
                </div>
                <div className={s.acts}>{refreshBtn}</div>
              </header>

              <div className={`${s.g} ${s.k2} ${s.mb}`}>
                <a className={`${s.kpi} ${s.s3}`} href="#holidays">
                  <span className={s.lb}><span className={s.dot} style={cssVars({ '--d': 'var(--hol)' })} />{homeDist ? `נרשמו ל${homeDist.name}` : 'נרשמו'}</span>
                  <b>{num(homeRows.length)}</b>
                  <span className={s.ft}><strong>{homeRows.length ? Math.round((home.approved / homeRows.length) * 100) : 0}%</strong> אושרו</span>
                  <AreaChart values={home.series.cumulative} />
                </a>
                <a className={`${s.kpi} ${s.s3}`} href="#maternity">
                  <span className={s.lb}><span className={s.dot} style={cssVars({ '--d': 'var(--mat)' })} />לידות במעקב</span>
                  <b>{num(matAll.born)}</b>
                  <span className={s.ft}><strong>{num(matAll.arrived)}</strong> הגיעו לבית החלמה</span>
                </a>
                <a className={`${s.kpi} ${s.s3}`} href="#maternity">
                  <span className={s.lb}><span className={s.dot} style={cssVars({ '--d': 'var(--mat)' })} />שולם ליולדות</span>
                  <b>{fmtCurNum(matAll.paid)}</b>
                  <span className={s.ft}><strong>{num(matAll.waiting)}</strong> ממתינות לקבלה</span>
                </a>
                <a className={`${s.kpi} ${s.s3}`} href="#tree">
                  <span className={s.lb}><span className={s.dot} style={cssVars({ '--d': 'var(--tree)' })} />צאצאים רשומים</span>
                  <b>{num(beneficiariesCount)}</b>
                  <span className={s.ft}>שרשרת יוחסין מלאה</span>
                </a>
              </div>

              <div className={s.g}>
                <Panel className={s.s8} title={homeDist ? `רישום ל${distLabel(homeDist)}` : 'רישום'} link={{ href: '#holidays/recipients', label: 'לכל הנרשמים ←' }}>
                  {home.series.cumulative.length ? (
                    <>
                      <AreaChart values={home.series.cumulative} />
                      <div className={s.axis}>{dayAxis(home.series.daily.length).map(l => <span key={l}>{l}</span>)}</div>
                    </>
                  ) : <div className={s.empty}><b>אין עדיין רישומים</b></div>}
                </Panel>
                <Panel className={s.s4} title="ערוץ רישום">
                  <div className={s.dn}>
                    <div className={s.donut} style={{ background: conicOf(home.channels) }} />
                    <Legend parts={home.channels} />
                  </div>
                </Panel>
                <Panel className={s.s6} style={cssVars({ '--acc': 'var(--mat)' })} title="עזר יולדות · מלידה ועד תשלום" link={{ href: '#maternity', label: 'לפירוט ←' }}>
                  <Funnel f={matAll} />
                </Panel>
                <Panel className={s.s6} style={cssVars({ '--acc': 'var(--tree)' })} title="צאצאים לפי דור" link={{ href: '#tree', label: 'לעץ ←' }}>
                  {treeReady ? (homeGens.length ? <HBars bars={homeGens.map(g => ({ label: `דור ${g.generation}`, value: g.count }))} /> : <div className={s.empty}><b>אין נתוני דורות</b></div>) : treeSk}
                </Panel>
              </div>
            </div>
          )}

          {page === 'holidays' && (
            <div className={s.page} key="holidays" style={cssVars({ '--acc': 'var(--hol)' })}>
              <header className={s.hd}>
                <div>
                  <h1>חלוקות חגים</h1>
                  <p>{selected ? `${distLabel(selected)} · ${selected.registration_open ? 'הרישום פתוח' : 'הרישום סגור'}` : 'אין כרגע חלוקה פתוחה'}</p>
                </div>
                <div className={s.acts}>
                  <div className={s.seg} role="group" aria-label="בחירת חלוקה">
                    {live && <button type="button" className={view === 'live' ? s.on : undefined} onClick={() => setHolView('live')}>{live.name}</button>}
                    <button type="button" className={view === 'prev' ? s.on : undefined} onClick={() => setHolView('prev')}>חלוקות קודמות</button>
                  </div>
                  {refreshBtn}
                </div>
              </header>

              {view === 'prev' && prevDists.length > 0 && (
                <Panel className={s.mb} title="חלוקות קודמות" hint="לחצו על חלוקה כדי לראות את הנתונים שלה" flush>
                  <div className={`${s.tbl} ${s.tscroll}`}>
                    <table>
                      <thead><tr><th>חלוקה</th><th className={s.hideM}>תאריך חלוקה</th><th>נרשמו</th><th>אושרו</th></tr></thead>
                      <tbody>
                        {prevDists.map(d => {
                          const rows = byDist.get(d.id) ?? []
                          return (
                            <tr key={d.id} className={`${s.pick} ${selected?.id === d.id ? s.sel : ''}`} onClick={() => setPickedId(d.id)}>
                              <td>{distLabel(d)}</td>
                              <td className={s.hideM}>{fmtDate(d.distribution_date)}</td>
                              <td>{num(rows.length)}</td>
                              <td>{num(rows.filter(r => r.approval_status === 'approved').length)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}

              {!selected ? (
                <div className={s.empty}><b>אין חלוקות להצגה</b>כשתיפתח חלוקה, הנתונים שלה יופיעו כאן.</div>
              ) : (
                <>
                  <Tabs page="holidays" tab={tab} items={[
                    { key: '', label: 'סקירה' },
                    { key: 'recipients', label: 'הנרשמים', count: selRows.length },
                    { key: 'breakdown', label: 'פילוחים' },
                  ]} />

                  {tab === 'recipients' && (
                    <Panel title={`הנרשמים ל${distLabel(selected)}`} flush>
                      <div className={s.embed}><SharedRecipientsTable rows={selRows} /></div>
                    </Panel>
                  )}

                  {tab === 'breakdown' && <BreakdownPanels recipients={selRows} />}

                  {tab !== 'recipients' && tab !== 'breakdown' && (
                    <>
                      <div className={`${s.g} ${s.k2} ${s.mb}`}>
                        <div className={`${s.kpi} ${s.s3}`}>
                          <span className={s.lb}>נרשמו</span>
                          <b>{num(selRows.length)}</b>
                          <span className={s.ft}>ב-<strong>{num(hol.series.daily.length)}</strong> ימי רישום</span>
                        </div>
                        <div className={`${s.kpi} ${s.s3}`}>
                          <span className={s.lb}>אושרו</span>
                          <b>{num(hol.approved)}</b>
                          <span className={s.ft}><strong>{selRows.length ? Math.round((hol.approved / selRows.length) * 100) : 0}%</strong> מהנרשמים</span>
                        </div>
                        <div className={`${s.kpi} ${s.s3}`}>
                          <span className={s.lb}>ממתינים לאישור</span>
                          <b>{num(hol.pending)}</b>
                          <span className={s.ft}>טרם טופלו</span>
                        </div>
                        <div className={`${s.kpi} ${s.s3}`}>
                          <span className={s.lb}>חלוקות פתוחות</span>
                          <b>{num(distributions.filter(d => d.registration_open).length)}</b>
                          <span className={s.ft}>מתוך <strong>{num(distributions.length)}</strong> חלוקות</span>
                        </div>
                      </div>

                      <div className={s.g}>
                        <Panel className={s.s8} title="קצב הרישום" hint="מצטבר · ומתחת לפי יום">
                          {hol.series.cumulative.length ? (() => {
                            const days = hol.series.daily.slice(-40)
                            const max = Math.max(0, ...days)
                            const cum = hol.series.cumulative
                            return (
                              <>
                                <AreaChart values={cum} />
                                <div className={s.dly}>{days.map((d, i) => <i key={i} title={num(d)} style={cssVars({ '--h': `${Math.max(4, pctOf(d, max))}%` })} />)}</div>
                                <div className={s.axis}>
                                  <span>יום 1 · {num(cum[0])}</span>
                                  <span>יום {cum.length} · {num(cum[cum.length - 1])}</span>
                                </div>
                              </>
                            )
                          })() : <div className={s.empty}><b>אין עדיין רישומים</b></div>}
                        </Panel>
                        <Panel className={s.s4} title="ערוץ רישום">
                          <div className={s.dg}>
                            <div className={s.donut} style={{ background: conicOf(hol.channels) }} />
                            <Legend parts={hol.channels} wide />
                          </div>
                        </Panel>
                        <Panel className={s.s6} title="לפי עיר" hint={`${hol.cities.length} מובילות`}>
                          {hol.cities.length ? <HBars bars={hol.cities} /> : <div className={s.empty}>אין נתוני ערים</div>}
                        </Panel>
                        <Panel className={s.s6} title="לפי מספר ילדים">
                          <Cols bars={hol.kids} height={170} />
                        </Panel>
                        <Panel className={s.s12} title="נרשמו לאחרונה" link={{ href: '#holidays/recipients', label: 'לכל הנרשמים ←' }} flush>
                          <div className={`${s.tbl} ${s.tscroll}`}>
                            <table>
                              <thead><tr><th>משפחה</th><th>עיר</th><th>ילדים</th><th className={s.hideM}>ערוץ</th><th className={s.hideM}>נרשם</th><th>מצב</th></tr></thead>
                              <tbody>
                                {hol.recent.map(r => {
                                  const [cls, label] = APPROVAL_PILL[r.approval_status ?? ''] ?? APPROVAL_PILL.pending
                                  return (
                                    <tr key={r.id}>
                                      <td>{famName(r.beneficiary)}</td>
                                      <td>{r.beneficiary?.city || '—'}</td>
                                      <td>{r.beneficiary?.children_count ?? '—'}</td>
                                      <td className={s.hideM}>{channelOf(r.source)}</td>
                                      <td className={`${s.hideM} ${s.mut}`}><span className={s.ltr}>{stamp(r.registered_at)}</span></td>
                                      <td><span className={`${s.pill} ${cls}`}>{label}</span></td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                            {!hol.recent.length && <div className={s.empty}>אין עדיין נרשמים</div>}
                          </div>
                        </Panel>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {page === 'maternity' && (
            <div className={s.page} key="maternity" style={cssVars({ '--acc': 'var(--mat)', '--area': 'rgba(15,118,110,.14)' })}>
              <header className={s.hd}>
                <div>
                  <h1>עזר יולדות</h1>
                  <p>בתי החלמה · תשלומים · כרטיסי מזון</p>
                </div>
                <div className={s.acts}>
                  <div className={s.seg} role="group" aria-label="תקופה">
                    {([[1, 'החודש'], [3, '3 חודשים'], [null, 'הכול']] as const).map(([m, label]) => (
                      <button key={label} type="button" className={period === m ? s.on : undefined} onClick={() => setPeriod(m)}>{label}</button>
                    ))}
                  </div>
                  {refreshBtn}
                </div>
              </header>

              <Tabs page="maternity" tab={tab} items={[
                { key: '', label: 'סקירה' },
                { key: 'mothers', label: 'היולדות', count: matRows.length },
                { key: 'homes', label: 'בתי החלמה' },
              ]} />

              {tab === 'mothers' && <MaternityPanel rows={matRows} />}

              {tab === 'homes' && (
                <Panel title="בתי החלמה" hint="לפי התקופה שנבחרה" flush>
                  <div className={`${s.tbl} ${s.tscroll}`}>
                    <table>
                      <thead><tr><th>בית החלמה</th><th>הגיעו</th><th>לילות</th><th>שולם</th><th>טרם חויבו</th></tr></thead>
                      <tbody>
                        {mat.homes.map(h => (
                          <tr key={h.home}>
                            <td>{h.home}</td><td>{num(h.arrived)}</td><td>{num(h.nights)}</td>
                            <td>{fmtCurNum(h.paid)}</td>
                            <td>{h.unbilled ? <span className={`${s.pill} ${s.pWt}`}>{num(h.unbilled)}</span> : <span className={s.mut}>0</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!mat.homes.length && <div className={s.empty}>אין בתי החלמה בתקופה הזו</div>}
                  </div>
                </Panel>
              )}

              {tab !== 'mothers' && tab !== 'homes' && (
                <>
                  <div className={`${s.g} ${s.k2} ${s.mb}`}>
                    <div className={`${s.kpi} ${s.s3}`}>
                      <span className={s.lb}>לידות</span>
                      <b>{num(mat.funnel.born)}</b>
                      <span className={s.ft}>{period === 1 ? 'החודש' : period ? `ב-${period} חודשים` : 'מתחילת הרישום'}</span>
                    </div>
                    <div className={`${s.kpi} ${s.s3}`}>
                      <span className={s.lb}>הגיעו לבית החלמה</span>
                      <b>{num(mat.funnel.arrived)}</b>
                      <span className={s.ft}><strong>{mat.funnel.born ? Math.round((mat.funnel.arrived / mat.funnel.born) * 100) : 0}%</strong> מהלידות</span>
                    </div>
                    <div className={`${s.kpi} ${s.s3}`}>
                      <span className={s.lb}>שולם בפועל</span>
                      <b>{fmtCurNum(mat.funnel.paid)}</b>
                      <span className={s.ft}><strong>{num(mat.funnel.billed)}</strong> חויבו</span>
                    </div>
                    <div className={`${s.kpi} ${s.s3}`}>
                      <span className={s.lb}>ממתינות לקבלה</span>
                      <b style={{ color: '#8a5a00' }}>{num(mat.funnel.waiting)}</b>
                      <span className={s.ft}>הגיעו, טרם חויבו</span>
                    </div>
                  </div>

                  <div className={s.g}>
                    <Panel className={s.s7} title="מלידה ועד תשלום" hint="השלב שבו נתקעים">
                      <Funnel f={mat.funnel} gaps />
                    </Panel>
                    <Panel className={s.s5} title="לפי בית החלמה" hint="₪ ששולם">
                      {mat.homes.length ? <HBars bars={mat.homes.slice(0, 6).map(h => ({ label: h.home, value: h.paid }))} fmt={v => `${num(v)}`} /> : <div className={s.empty}>אין נתונים</div>}
                    </Panel>
                    <Panel className={s.s12} title="תשלומים לפי חודש" hint="₪ · שישה חודשים">
                      <Cols bars={months} fmt={v => num(v)} lastBar="#7fb8b0" />
                      <p className={s.note}>החודש נקבע לפי ההגעה לבית ההחלמה, והסכום נספר רק כשיש קבלה.</p>
                    </Panel>
                    <Panel className={s.s12} title="יולדות" link={{ href: '#maternity/mothers', label: 'לכל היולדות ←' }} flush>
                      <div className={`${s.tbl} ${s.tscroll}`}>
                        <table>
                          <thead><tr><th>משפחה</th><th>בית החלמה</th><th>לילות</th><th>סכום</th><th>מצב</th></tr></thead>
                          <tbody>
                            {mat.recent.map(r => {
                              const st = stateOf(r)
                              return (
                                <tr key={r.id}>
                                  <td>{famName(r.beneficiary)}</td>
                                  <td>{r.recovery_home || '—'}</td>
                                  <td>{r.recovery_nights ?? '—'}</td>
                                  <td>{r.recovery_amount != null ? fmtCurNum(Number(r.recovery_amount)) : '—'}</td>
                                  <td><span className={`${s.pill} ${MAT_PILL[st]}`}>{LABEL[st]}</span></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        {!mat.recent.length && <div className={s.empty}>אין לידות בתקופה הזו</div>}
                      </div>
                    </Panel>
                  </div>
                </>
              )}
            </div>
          )}

          {page === 'tree' && (
            <div className={s.page} key="tree" style={cssVars({ '--acc': 'var(--tree)' })}>
              <header className={s.hd}>
                <div>
                  <h1>צאצאים ועץ הדורות</h1>
                  <p>שרשרת היוחסין המלאה · לצפייה בלבד</p>
                </div>
                <div className={s.acts}>{refreshBtn}</div>
              </header>

              <Tabs page="tree" tab={tab} items={[{ key: '', label: 'סקירה' }, { key: 'full', label: 'העץ המלא' }]} />

              {tab === 'full' ? (
                <GenerationExplorer nodes={lineageNodes} loading={lineageLoading} onRetry={() => void loadLineage(true)} />
              ) : (
                <>
                  <div className={`${s.g} ${s.mb}`}>
                    <div className={`${s.kpi} ${s.s4}`}>
                      <span className={s.lb}>צאצאים רשומים</span>
                      <b>{num(beneficiariesCount)}</b>
                      <span className={s.ft}>שרשרת יוחסין מלאה</span>
                    </div>
                    <div className={`${s.kpi} ${s.s4}`}>
                      <span className={s.lb}>הדור הגדול ביותר</span>
                      <b>{biggest ? `דור ${biggest.generation}` : '—'}</b>
                      <span className={s.ft}>{biggest ? <><strong>{num(biggest.count)}</strong> צאצאים</> : 'נטען…'}</span>
                    </div>
                    <div className={`${s.kpi} ${s.s4}`}>
                      <span className={s.lb}>דורות ברשומות</span>
                      <b>{treeReady ? num(gens.length) : '—'}</b>
                      <span className={s.ft}>מהחתם סופר ועד היום</span>
                    </div>
                  </div>
                  <div className={s.g}>
                    <Panel className={s.s7} title="מניפת הדורות" hint="כל טבעת היא דור">
                      {treeReady ? (gens.length ? <FanChart counts={gens} /> : <div className={s.empty}><b>אין נתוני דורות</b></div>) : <Skeleton h={214} />}
                    </Panel>
                    <Panel className={s.s5} title="לפי דור">
                      {treeReady ? <HBars bars={gens.map(g => ({ label: `דור ${g.generation}`, value: g.count }))} /> : treeSk}
                    </Panel>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
