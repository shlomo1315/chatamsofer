'use client'
import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, FileBarChart } from 'lucide-react'
import { downloadXlsx, todayStamp, type XlsxColumn } from '@/lib/downloadXlsx'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

type Row = {
  id: string; motherName: string; motherId: string; city: string; babyName: string
  birthDate: string; status: string; cardStatus: string; cardBalance: number
  recoveryHome: string; arrived: boolean | null
  recoveryAmount: number | null; recoveryAmountStatus: string; recoveryAmountAt: string; recoveryNights: number | null
}

const BIRTH_STATUS: Record<string, string> = { pending: 'ממתין לאישור', active: 'מאושר', completed: 'הושלם', cancelled: 'בוטל' }
const CARD_STATUS: Record<string, string> = { pending: 'ממתין', approved: 'אושר', awaiting_stock: 'ממתין למלאי', loaded: 'נטען', rejected: 'נדחה' }
const ils = (n: number) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`
const fmtD = (d: string) => (d ? new Date(d).toLocaleDateString('he-IL') : '')

// ⚠️ עמודות התצוגה בלבד. הן *אינן* משפיעות על הייצוא לאקסל: הדוח המיוצא
// חייב להישאר מלא גם כשהמשתמש הסתיר עמודה על המסך.
type ColKey = 'motherName' | 'motherId' | 'babyName' | 'birthDate' | 'recoveryHome'
  | 'arrived' | 'recoveryAmount' | 'recoveryNights' | 'cardStatus'

const COLUMNS: ColDef<ColKey>[] = [
  { key: 'motherName', label: 'שם היולדת', def: true },
  { key: 'motherId', label: 'ת.ז', def: true },
  { key: 'babyName', label: 'תינוק', def: true },
  { key: 'birthDate', label: 'תאריך לידה', def: true },
  { key: 'recoveryHome', label: 'בית החלמה', def: true },
  { key: 'arrived', label: 'הגעה', def: true, align: 'center' },
  { key: 'recoveryAmount', label: 'סכום שמומש', def: true },
  { key: 'recoveryNights', label: 'לילות', def: true, align: 'center' },
  { key: 'cardStatus', label: 'סטטוס כרטיס', def: false },
]

export default function ReportBuilder() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  // filters
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [home, setHome] = useState('all')
  const [cardStatus, setCardStatus] = useState('all')
  const [birthStatus, setBirthStatus] = useState('all')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [onlyBilled, setOnlyBilled] = useState(false)

  useEffect(() => {
    fetch('/api/admin/reports/maternity')
      .then(r => r.json())
      .then(d => { if (d.rows) setRows(d.rows); else setErr(d.error || 'שגיאה') })
      .catch(() => setErr('שגיאת רשת'))
      .finally(() => setLoading(false))
  }, [])

  const homes = useMemo(() => [...new Set(rows.map(r => r.recoveryHome).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => {
    const fromT = from ? new Date(from).getTime() : 0
    const toT = to ? new Date(to).getTime() + 86400000 : Infinity
    const min = minAmount ? Number(minAmount) : -Infinity
    const max = maxAmount ? Number(maxAmount) : Infinity
    return rows.filter(r => {
      const bt = r.birthDate ? new Date(r.birthDate).getTime() : 0
      if (r.birthDate && (bt < fromT || bt >= toT)) return false
      if (!r.birthDate && (from || to)) return false
      if (home !== 'all' && r.recoveryHome !== home) return false
      if (cardStatus !== 'all' && (r.cardStatus || 'pending') !== cardStatus) return false
      if (birthStatus !== 'all' && r.status !== birthStatus) return false
      if (onlyBilled && r.recoveryAmount == null) return false
      const amt = Number(r.recoveryAmount) || 0
      if (r.recoveryAmount != null && (amt < min || amt > max)) return false
      if (r.recoveryAmount == null && (minAmount || maxAmount)) return false
      return true
    })
  }, [rows, from, to, home, cardStatus, birthStatus, minAmount, maxAmount, onlyBilled])

  const totals = useMemo(() => ({
    count: filtered.length,
    amount: filtered.reduce((s, r) => s + (Number(r.recoveryAmount) || 0), 0),
    nights: filtered.reduce((s, r) => s + (Number(r.recoveryNights) || 0), 0),
    balance: filtered.reduce((s, r) => s + (Number(r.cardBalance) || 0), 0),
  }), [filtered])

  // ⚠️ העמודות מוגדרות עם kind ולא כרשימת כותרות: זה מה שקובע שהסכומים
  // והלילות יגיעו לאקסל כמספרים לסכימה, ולא כטקסט. ת"ז נשארת טקסט במפורש
  // כדי לא לאבד אפס מוביל.
  const XLSX_COLUMNS: XlsxColumn[] = [
    { header: 'שם היולדת' }, { header: 'ת.ז', kind: 'id' }, { header: 'עיר' }, { header: 'תינוק' },
    { header: 'תאריך לידה', kind: 'date' }, { header: 'סטטוס לידה' }, { header: 'בית החלמה' },
    { header: 'הגעה' }, { header: 'סכום שמומש', kind: 'number' }, { header: 'לילות', kind: 'number' },
    { header: 'סטטוס כרטיס' }, { header: 'יתרת כרטיס', kind: 'number' },
  ]

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    setExporting(true)
    try {
      await downloadXlsx({
        filename: `דוח-יולדות-${todayStamp()}`,
        sheetName: 'דוח יולדות',
        columns: XLSX_COLUMNS,
        rows: filtered.map(r => [
          r.motherName, r.motherId, r.city, r.babyName, r.birthDate || null,
          BIRTH_STATUS[r.status] ?? r.status, r.recoveryHome,
          r.arrived === true ? 'הגיעה' : r.arrived === false ? 'לא הגיעה' : '',
          r.recoveryAmount, r.recoveryNights,
          CARD_STATUS[r.cardStatus] ?? r.cardStatus, r.cardBalance ?? 0,
        ]),
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'הייצוא נכשל')
    }
    setExporting(false)
  }

  const tc = useTableColumns('reports-maternity', COLUMNS)

  const cell = (c: ColDef<ColKey>, r: Row) => {
    switch (c.key) {
      case 'motherName': return <span className="font-medium text-slate-800">{r.motherName}</span>
      case 'motherId': return <span className="text-slate-500 ltr-num">{r.motherId || '—'}</span>
      case 'babyName': return <span className="text-slate-600">{r.babyName || '—'}</span>
      case 'birthDate': return <span className="text-slate-500 ltr-num">{fmtD(r.birthDate) || '—'}</span>
      case 'recoveryHome': return <span className="text-slate-600">{r.recoveryHome || '—'}</span>
      case 'arrived': return <span>{r.arrived === true ? '✓' : r.arrived === false ? '✗' : '—'}</span>
      case 'recoveryAmount': return <span className="font-semibold text-emerald-700">{r.recoveryAmount != null ? ils(r.recoveryAmount) : '—'}</span>
      case 'recoveryNights': return <span className="text-slate-600">{r.recoveryNights ?? '—'}</span>
      case 'cardStatus': return <span className="text-slate-600">{CARD_STATUS[r.cardStatus] ?? r.cardStatus}</span>
    }
  }

  const selCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FileBarChart size={18} className="text-indigo-600" />
          <h2 className="font-semibold text-slate-900">בונה דוחות — יולדות</h2>
        </div>
        <button onClick={() => void exportExcel()} disabled={loading || exporting || filtered.length === 0}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} הורד דוח (אקסל)
        </button>
      </div>

      {/* filters */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3" dir="rtl">
        <label className="flex flex-col gap-1 text-xs text-slate-500">מתאריך (לידה)
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={selCls} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">עד תאריך
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={selCls} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">בית החלמה
          <select value={home} onChange={e => setHome(e.target.value)} className={selCls}>
            <option value="all">הכל</option>
            {homes.map(h => <option key={h} value={h}>{h}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">סטטוס כרטיס
          <select value={cardStatus} onChange={e => setCardStatus(e.target.value)} className={selCls}>
            <option value="all">הכל</option>
            {Object.entries(CARD_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">סטטוס לידה
          <select value={birthStatus} onChange={e => setBirthStatus(e.target.value)} className={selCls}>
            <option value="all">הכל</option>
            {Object.entries(BIRTH_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">סכום מ-
          <input value={minAmount} onChange={e => setMinAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={selCls} dir="ltr" /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">סכום עד
          <input value={maxAmount} onChange={e => setMaxAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={selCls} dir="ltr" /></label>
        <label className="flex items-center gap-2 text-sm text-slate-600 self-end pb-2">
          <input type="checkbox" checked={onlyBilled} onChange={e => setOnlyBilled(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          רק עם חיוב שבוצע
        </label>
      </div>

      {/* totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 pb-4">
        {[
          { label: 'מספר יולדות', value: String(totals.count), cls: 'text-slate-700 bg-slate-50 border-slate-100' },
          { label: 'סה״כ חויב', value: ils(totals.amount), cls: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
          { label: 'סה״כ לילות', value: totals.nights.toLocaleString('he-IL'), cls: 'text-indigo-700 bg-indigo-50 border-indigo-100' },
          { label: 'יתרת כרטיסים', value: ils(totals.balance), cls: 'text-amber-700 bg-amber-50 border-amber-100' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.cls}`}>
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className="text-lg font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {!loading && !err && filtered.length > 0 && <div className="px-4 pb-3">{tc.picker}</div>}

      {/* table */}
      {/* ⚠️ גלילה אנכית בלבד — הכלל: אין גלילה לרוחב בשום טבלה. */}
      <div className="max-h-[60vh] overflow-y-auto border-t border-slate-100">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm"><Loader2 size={18} className="animate-spin" /> טוען…</div>
        ) : err ? (
          <div className="py-12 text-center text-red-600 text-sm">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">אין תוצאות בסינון זה</div>
        ) : (
          <table className="w-full text-sm text-right" style={tc.rt.tableStyle}>
            <colgroup>{tc.rt.cols}</colgroup>
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                {tc.shown.map((c, i) => (
                  <th key={c.key} className={`px-3 py-2.5 font-medium ${tc.headClass(c)}`}>{c.label}{tc.rt.handle(i)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  {tc.shown.map(c => (
                    <td key={c.key} className={`px-3 py-2 ${tc.cellClass(c)}`}>{cell(c, r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
