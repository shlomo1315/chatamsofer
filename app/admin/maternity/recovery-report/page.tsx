'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Download, Loader2, Home, CheckCircle2, Clock,
  AlertTriangle, Wallet, Moon, Search, Receipt,
} from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { downloadXlsx, todayStamp, type XlsxColumn } from '@/lib/downloadXlsx'
import { useToast } from '@/components/ui/Toast'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

// ─────────────────────────────────────────────────────────────────────────────
// דוח מימוש בתי החלמה.
//
// 🔴 השאלה: "כמה יולדות מימשו בית החלמה, וכמה עוד לא" — בפילוח לפי בית.
//
// ⚠️ הדוח מפריד בין *מימוש* (הגיעה בפועל) לבין *חיוב* (הוגשה קבלה), כי
// הפער ביניהם הוא כסף שטרם נגבה — וזה בדיוק מה שאי אפשר לראות בייצוא הרגיל.
// ─────────────────────────────────────────────────────────────────────────────

type State = 'realized-charged' | 'realized-unbilled' | 'not-realized' | 'none'

interface Row {
  id: string
  state: State
  stateLabel: string
  name: string
  id_number: string | null
  phone: string | null
  city: string | null
  birth_date: string | null
  baby_name: string | null
  recovery_home: string | null
  arrived: boolean
  arrived_at: string | null
  nights: number | null
  amount: number
  receiptCount: number
  status: string | null
}

interface HomeStat {
  home: string
  realizedCharged: number
  realizedUnbilled: number
  notRealized: number
  realized: number
  amount: number
  nights: number
}

type Totals = Omit<HomeStat, 'home'>

const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '—' : format(dt, 'dd/MM/yy', { locale: he })
}
const fmtCur = (n: number) => `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n)} ₪`

const STATE_STYLE: Record<State, string> = {
  'realized-charged': 'bg-green-100 text-green-800 border-green-200',
  'realized-unbilled': 'bg-amber-100 text-amber-800 border-amber-200',
  'not-realized': 'bg-slate-100 text-slate-600 border-slate-200',
  'none': 'bg-slate-50 text-slate-400 border-slate-100',
}

// ── הגדרת העמודות ──
type ColKey = 'state' | 'home' | 'name' | 'idNumber' | 'phone' | 'city' | 'birth' | 'arrived' | 'nights' | 'amount' | 'receipts'

// ⚠️ "טלפון" נוסף כעמודה בבורר: הוא כבר היה בחיפוש ובייצוא לאקסל, אבל
// לא הוצג בטבלה — מי שסינן לפי טלפון לא ראה אותו על המסך.
// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
// ⚠️ שם/ת״ז/טלפון — מיון בלבד (ערך ייחודי לכל שורה). מצב, בית החלמה
// ועיר הם קבוצות ערכים סגורות ← גם סינון.
const COLUMNS: ColDef<ColKey, Row>[] = [
  { key: 'state', label: 'מצב', def: true, kind: 'enum', filterable: true,
    // ⚠️ הערך הוא התווית המוצגת ולא הקוד ('realized-charged' וכו').
    value: r => r.stateLabel },
  { key: 'home', label: 'בית החלמה', def: true, kind: 'enum', filterable: true, value: r => r.recovery_home ?? null },
  { key: 'name', label: 'שם המשפחה', def: true, value: r => r.name },
  { key: 'idNumber', label: 'ת״ז', def: true, kind: 'number', value: r => r.id_number ?? null },
  { key: 'phone', label: 'טלפון', def: false, value: r => r.phone ?? null },
  { key: 'city', label: 'עיר', def: true, kind: 'enum', filterable: true, value: r => r.city ?? null },
  // ⚠️ ממוין לפי התאריך הגולמי ולא לפי התווית: תאריך מפורמט ממוין
  // אלפביתית ולא כרונולוגית.
  { key: 'birth', label: 'לידה', def: true, kind: 'date', value: r => r.birth_date ?? null },
  // ⚠️ null כשלא הגיעה — כך "טרם" יורד לסוף המיון בשני הכיוונים.
  { key: 'arrived', label: 'הגעה', def: true, kind: 'date', value: r => r.arrived ? r.arrived_at : null },
  { key: 'nights', label: 'לילות', def: true, align: 'center', kind: 'number', value: r => r.nights ?? null },
  // ⚠️ null (ולא 0) כשאין סכום — אחרת "—" היה ממוין כאפס שקלים.
  { key: 'amount', label: 'סכום', def: true, kind: 'number', value: r => r.amount || null },
  { key: 'receipts', label: 'קבלות', def: true, align: 'center', kind: 'number',
    value: r => r.receiptCount || null },
]

export default function RecoveryReportPage() {
  const toast = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [homes, setHomes] = useState<HomeStat[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [homeFilter, setHomeFilter] = useState('')
  const [stateFilter, setStateFilter] = useState<State | ''>('')
  const [q, setQ] = useState('')
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/maternity/recovery-report', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'טעינת הדוח נכשלה'); return }
      setRows(json.rows ?? [])
      setHomes(json.homes ?? [])
      setTotals(json.totals ?? null)
      setError(null)
    } catch { setError('שגיאת רשת') } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (homeFilter && r.recovery_home !== homeFilter) return false
      if (stateFilter && r.state !== stateFilter) return false
      if (!needle) return true
      return [r.name, r.id_number, r.phone, r.city, r.baby_name, r.recovery_home]
        .filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [rows, homeFilter, stateFilter, q])

  // 🔴 ה-hook מקבל את filtered (אחרי בוררי בית ההחלמה/המצב והחיפוש)
  // ולא את rows: הסינון בכותרת חל *על* מה שהבוררים סיננו, לא במקומם.
  // ⚠️ mode:'client' — כל הדוח נטען בבת אחת, אין דפדוף בשרת.
  const tc = useTableColumns<ColKey, Row>('maternity-recovery-report', COLUMNS, {
    sortFilter: { mode: 'client', rows: filtered },
  })

  // תוכן התא לפי מפתח העמודה
  const cell = (key: ColKey, r: Row) => {
    switch (key) {
      case 'state': return <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATE_STYLE[r.state]}`}>{r.stateLabel}</span>
      case 'home': return <span className="font-medium text-slate-700">{r.recovery_home ?? '—'}</span>
      case 'name': return <span className="font-bold text-slate-800">{r.name}</span>
      case 'idNumber': return <span className="text-slate-500 ltr-num">{r.id_number ?? '—'}</span>
      case 'phone': return <span className="text-slate-500 ltr-num">{r.phone ?? '—'}</span>
      case 'city': return <span className="text-slate-500">{r.city ?? '—'}</span>
      case 'birth': return <span className="text-slate-500 ltr-num">{fmtDate(r.birth_date)}</span>
      case 'arrived': return <span className="text-slate-500 ltr-num">{r.arrived ? fmtDate(r.arrived_at) : '—'}</span>
      case 'nights': return <span className="text-slate-600 ltr-num">{r.nights ?? '—'}</span>
      case 'amount': return <span className="font-bold text-emerald-700 ltr-num">{r.amount ? fmtCur(r.amount) : '—'}</span>
      case 'receipts': return (
        <span className="text-slate-500 ltr-num">
          {r.receiptCount > 0
            ? <span className="inline-flex items-center gap-1"><Receipt size={11} />{r.receiptCount}</span>
            : '—'}
        </span>
      )
    }
  }

  async function exportXlsx() {
    setExporting(true)
    try {
      const columns: XlsxColumn[] = [
        { header: 'מצב', width: 18 },
        { header: 'בית החלמה', width: 20 },
        { header: 'שם המשפחה', width: 26 },
        { header: 'ת"ז', kind: 'id', width: 14 },
        { header: 'טלפון', kind: 'id', width: 14 },
        { header: 'עיר', width: 14 },
        { header: 'תאריך לידה', kind: 'date', width: 12 },
        { header: 'שם התינוק', width: 14 },
        { header: 'הגיעה', width: 8 },
        { header: 'תאריך הגעה', kind: 'date', width: 12 },
        { header: 'לילות', kind: 'number', width: 8 },
        { header: 'סכום שחויב', kind: 'number', width: 12 },
        { header: 'מספר קבלות', kind: 'number', width: 11 },
      ]
      // ⚠️ מייצא את *המסונן* ולא את הכל: המסך והקובץ חייבים להסכים, אחרת
      // מי שסינן לבית אחד ומייצא מקבל קובץ אחר ממה שראה.
      const data = filtered.map(r => [
        r.stateLabel,
        r.recovery_home ?? '—',
        r.name,
        r.id_number ?? '',
        r.phone ?? '',
        r.city ?? '',
        r.birth_date ?? '',
        r.baby_name ?? '',
        r.arrived ? 'כן' : 'לא',
        r.arrived_at ?? '',
        r.nights ?? '',
        r.amount || '',
        r.receiptCount || '',
      ])
      await downloadXlsx({
        filename: `מימוש בתי החלמה ${todayStamp()}`,
        sheetName: 'מימוש בתי החלמה',
        columns,
        rows: data,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ייצוא נכשל')
    } finally { setExporting(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/admin/maternity" className="text-slate-400 hover:text-slate-600">
            <ArrowRight size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">מימוש בתי החלמה</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              מי כבר מימשה את הזכאות ומי עדיין לא — בפילוח לפי בית החלמה
            </p>
          </div>
        </div>
        <button onClick={exportXlsx} disabled={exporting || !filtered.length}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          ייצוא לאקסל ({filtered.length.toLocaleString('he-IL')})
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-900 flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* סיכום */}
      {totals && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button onClick={() => setStateFilter(s => s === 'realized-charged' ? '' : 'realized-charged')}
            className={`rounded-2xl border p-4 text-right transition-all ${stateFilter === 'realized-charged' ? 'border-green-400 bg-green-50 ring-2 ring-green-200' : 'border-slate-200 bg-white hover:border-green-300'}`}>
            <div className="flex items-center gap-1.5 text-green-700 mb-1">
              <CheckCircle2 size={14} /><span className="text-[11px] font-bold text-slate-500">מימשו וחויבו</span>
            </div>
            <p className="text-2xl font-black text-green-700 ltr-num">{totals.realizedCharged.toLocaleString('he-IL')}</p>
          </button>

          {/* ⚠️ הכרטיס שבגללו הדוח נבנה: יולדות שמימשו ובית ההחלמה טרם גבה. */}
          <button onClick={() => setStateFilter(s => s === 'realized-unbilled' ? '' : 'realized-unbilled')}
            className={`rounded-2xl border p-4 text-right transition-all ${stateFilter === 'realized-unbilled' ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
            <div className="flex items-center gap-1.5 text-amber-700 mb-1">
              <Clock size={14} /><span className="text-[11px] font-bold text-slate-500">מימשו — טרם חויבו</span>
            </div>
            <p className="text-2xl font-black text-amber-700 ltr-num">{totals.realizedUnbilled.toLocaleString('he-IL')}</p>
          </button>

          <button onClick={() => setStateFilter(s => s === 'not-realized' ? '' : 'not-realized')}
            className={`rounded-2xl border p-4 text-right transition-all ${stateFilter === 'not-realized' ? 'border-slate-400 bg-slate-50 ring-2 ring-slate-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <div className="flex items-center gap-1.5 text-slate-600 mb-1">
              <Home size={14} /><span className="text-[11px] font-bold text-slate-500">טרם מימשו</span>
            </div>
            <p className="text-2xl font-black text-slate-700 ltr-num">{totals.notRealized.toLocaleString('he-IL')}</p>
          </button>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-1.5 text-emerald-700 mb-1">
              <Wallet size={14} /><span className="text-[11px] font-bold text-slate-500">סך שחויב</span>
            </div>
            <p className="text-2xl font-black text-emerald-700 ltr-num">{fmtCur(totals.amount)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
              <Moon size={10} /> {totals.nights.toLocaleString('he-IL')} לילות
            </p>
          </div>
        </div>
      )}

      {/* פילוח לפי בית החלמה */}
      {homes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 font-extrabold text-slate-900">פילוח לפי בית החלמה</div>
          <div className="divide-y divide-slate-50">
            {homes.map(h => (
              <button key={h.home} onClick={() => setHomeFilter(f => f === h.home ? '' : h.home)}
                className={`w-full px-5 py-3 flex items-center justify-between gap-3 flex-wrap text-right transition-colors ${
                  homeFilter === h.home ? 'bg-indigo-50' : 'hover:bg-slate-50'
                }`}>
                <span className="font-bold text-slate-800">{h.home}</span>
                <div className="flex items-center gap-2 text-[11px] flex-wrap">
                  <span className="rounded-full bg-green-100 border border-green-200 px-2 py-0.5 font-bold text-green-800">
                    {h.realizedCharged} חויבו
                  </span>
                  {h.realizedUnbilled > 0 && (
                    <span className="rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 font-bold text-amber-800">
                      {h.realizedUnbilled} טרם חויבו
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">
                    {h.notRealized} טרם מימשו
                  </span>
                  <span className="font-bold text-emerald-700 ltr-num">{fmtCur(h.amount)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* חיפוש + מסננים פעילים */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש בשם, ת״ז, טלפון, עיר…"
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        {(homeFilter || stateFilter) && (
          <button onClick={() => { setHomeFilter(''); setStateFilter('') }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:text-rose-600 hover:border-rose-200">
            נקה סינון
          </button>
        )}
      </div>

      {/* הטבלה */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <p className="px-5 py-10 text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 size={15} className="animate-spin" /> טוען…
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">לא נמצאו רשומות</p>
        ) : (
          /* ⚠️ בלי overflow-x — הכלל: אין גלילה לרוחב בשום טבלה. */
          <div className="w-full">
            <div className="flex flex-col gap-2 px-5 py-3 border-b border-slate-100">{tc.picker}{tc.activeFilters}</div>
            <table className="w-full text-[12px] border-collapse" style={tc.rt.tableStyle}>
              <colgroup>{tc.rt.cols}</colgroup>
              <thead className="bg-slate-50 text-slate-500">
                <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:font-bold [&>th]:text-right">
                  {/* כותרת אחידה לכל המערכת — מיון, סינון וגרירת רוחב.
                      ⚠️ הריפוד מגיע מ-[&>th] שעל ה-<tr>. */}
                  {tc.shown.map((c, i) => tc.th(c, i))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {/* 🔴 tc.rows ולא filtered — אחרת המיון והסינון בכותרת לא
                    היו משפיעים על מה שמוצג בפועל. */}
                {tc.rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 [&>td]:px-3 [&>td]:py-2.5">
                    {tc.shown.map(c => (
                      <td key={c.key} className={tc.cellClass(c)}>{cell(c.key, r)}</td>
                    ))}
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
