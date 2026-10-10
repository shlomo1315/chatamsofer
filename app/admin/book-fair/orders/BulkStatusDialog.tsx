'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowLeft } from 'lucide-react'
import { BOOK_FAIR_STATUS_LABELS } from '@/types/bookFair'
import type { PlanRow, DetectedColumns } from '@/lib/bookFairBulkStatus'

// עדכון סטטוסים וכתובות מאקסל (10.10): העלאה → תצוגה מקדימה → אישור → סיכום.
//
// 🔴 שום דבר אינו משתנה עד לחיצת האישור. התצוגה המקדימה היא קריאה בלבד,
// והשרת בודק כל שורה שוב רגע לפני הביצוע.

type Col = { index: number; label: string }
type Result = { changed: number; statusChanged: number; addressChanged: number; failed: { order_number: string; error: string }[] }
type Filter = 'all' | 'change' | 'same' | 'error'

const label = (s: string | null | undefined) =>
  s ? (BOOK_FAIR_STATUS_LABELS as Record<string, string>)[s] ?? s : '—'

export default function BulkStatusDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const fileRef = useRef<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [columns, setColumns] = useState<Col[]>([])
  const [cols, setCols] = useState<DetectedColumns | null>(null)
  const [plan, setPlan] = useState<PlanRow[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [sendMail, setSendMail] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  async function preview(override?: Partial<DetectedColumns>) {
    const file = fileRef.current
    if (!file) return
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (override) {
        const c = { ...cols, ...override } as DetectedColumns
        fd.append('orderCol', String(c.orderCol))
        fd.append('statusCol', String(c.statusCol))
        fd.append('addressCol', String(c.addressCol))
        fd.append('cityCol', String(c.cityCol))
      }
      const res = await fetch('/api/admin/book-fair/orders/bulk-status', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (j.columns) setColumns(j.columns)
      if (!res.ok) {
        setError(j.error ?? 'קריאת הקובץ נכשלה')
        setPlan(null)
        if (override) setCols({ ...cols, ...override } as DetectedColumns)
        else if (j.columns) setCols({ orderCol: -1, statusCol: -1, addressCol: -1, cityCol: -1, headerRow: false })
        return
      }
      setCols(j.cols); setPlan(j.plan); setFilter('all')
    } catch {
      setError('השליחה לשרת נכשלה')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!plan) return
    const changes = plan.filter(r => r.kind === 'change').map(r => ({
      order_number: r.orderNumber,
      status: r.target ?? undefined,
      address: r.address ?? undefined,
      city_id: r.city?.id ?? undefined,
    }))
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/admin/book-fair/orders/bulk-status', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes, sendMail }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'העדכון נכשל'); return }
      setResult(j)
      router.refresh()
    } catch {
      setError('השליחה לשרת נכשלה')
    } finally {
      setBusy(false)
    }
  }

  const counts = {
    change: plan?.filter(r => r.kind === 'change').length ?? 0,
    same: plan?.filter(r => r.kind === 'same').length ?? 0,
    error: plan?.filter(r => r.kind === 'error').length ?? 0,
  }
  const shown = (plan ?? []).filter(r => filter === 'all' || r.kind === filter)
  const previewErrors = (plan ?? []).filter(r => r.kind === 'error')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !busy && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <FileSpreadsheet size={18} className="text-emerald-600" /> עדכון סטטוסים וכתובות מאקסל
          </h2>
          <button onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          {result ? (
            // ── סיכום ──
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 py-6 text-center">
                <CheckCircle2 size={40} className="text-emerald-600" />
                <p className="text-lg font-bold text-emerald-800">הפעולה בוצעה בהצלחה</p>
                <p className="text-sm text-emerald-700">
                  עודכנו <b>{result.changed}</b> הזמנות
                  {result.statusChanged > 0 && <> · <b>{result.statusChanged}</b> שינויי סטטוס</>}
                  {result.addressChanged > 0 && <> · <b>{result.addressChanged}</b> כתובות</>}
                  {counts.same > 0 && <> · {counts.same} ללא שינוי</>}
                </p>
                {sendMail && result.statusChanged > 0 && (
                  <p className="text-xs text-emerald-600">מיילי העדכון ללקוחות נשלחים ברקע</p>
                )}
              </div>
              {(result.failed.length > 0 || previewErrors.length > 0) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 flex items-center gap-1.5 font-semibold text-amber-800">
                    <AlertTriangle size={16} /> לא נקלטו: {result.failed.length + previewErrors.length}
                  </p>
                  <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm text-amber-900">
                    {previewErrors.map(r => (
                      <li key={`p${r.line}`}>שורה {r.line} · {r.orderNumber || '—'} — {r.error}</li>
                    ))}
                    {result.failed.map((f, i) => (
                      <li key={`f${i}`}>{f.order_number} — {f.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* ── בחירת קובץ ── */}
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-6 text-center hover:border-emerald-400 hover:bg-emerald-50/40">
                <Upload size={24} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{fileName || 'בחירת קובץ אקסל (xlsx)'}</span>
                <span className="text-xs text-slate-500">עמודה של מספרי הזמנה, ולצידה סטטוס ו/או כתובת (ועיר). המערכת מזהה לבד איזו עמודה היא מה.</span>
                <input
                  type="file" accept=".xlsx" className="hidden"
                  onChange={e => { fileRef.current = e.target.files?.[0] ?? null; setFileName(fileRef.current?.name ?? ''); setCols(null); setPlan(null); void preview() }}
                />
              </label>

              {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              {busy && !plan && <div className="flex justify-center py-6"><Loader2 size={22} className="animate-spin text-slate-400" /></div>}

              {/* ── העמודות שזוהו (ניתנות לתיקון) ── */}
              {cols && columns.length > 0 && (
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-4">
                  {([
                    ['orderCol', 'מספר הזמנה', false],
                    ['statusCol', 'סטטוס', true],
                    ['addressCol', 'כתובת', true],
                    ['cityCol', 'עיר', true],
                  ] as const).map(([key, title, optional]) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-500">{title}</span>
                      <select
                        value={cols[key]}
                        disabled={busy}
                        onChange={e => void preview({ [key]: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      >
                        {(optional || cols[key] < 0) && <option value={-1}>— ללא —</option>}
                        {columns.map(c => <option key={c.index} value={c.index}>{c.label}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}

              {/* ── תצוגה מקדימה ── */}
              {plan && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      ['all', 'כל השורות', plan.length, 'text-slate-900'],
                      ['change', 'ישתנו', counts.change, 'text-emerald-700'],
                      ['same', 'ללא שינוי', counts.same, 'text-slate-500'],
                      ['error', 'שגיאות', counts.error, 'text-red-700'],
                    ] as const).map(([k, t, n, color]) => (
                      <button
                        key={k} onClick={() => setFilter(k)}
                        className={`rounded-xl border px-3 py-2 text-right ${filter === k ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        <span className={`block text-lg font-bold ${color}`}>{n}</span>
                        <span className="text-xs text-slate-500">{t}</span>
                      </button>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full table-fixed text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                        <tr>
                          <th className="w-12 px-2 py-2.5 text-right">שורה</th>
                          <th className="w-24 px-2 py-2.5 text-right">הזמנה</th>
                          <th className="w-44 px-2 py-2.5 text-right">סטטוס</th>
                          <th className="px-2 py-2.5 text-right">כתובת / הערה</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {shown.map(r => (
                          <tr key={r.line} className={r.kind === 'error' ? 'bg-red-50/50' : r.kind === 'same' ? 'text-slate-400' : ''}>
                            <td className="px-2 py-2 text-slate-400">{r.line}</td>
                            <td className="truncate px-2 py-2 font-medium" title={r.orderNumber}>{r.orderNumber || '—'}</td>
                            <td className="px-2 py-2">
                              {r.target && r.target !== r.current ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-slate-500">{label(r.current)}</span>
                                  <ArrowLeft size={12} className="text-slate-400" />
                                  <b className="text-emerald-700">{label(r.target)}</b>
                                </span>
                              ) : <span className="text-slate-500">{label(r.current)}</span>}
                            </td>
                            <td className="truncate px-2 py-2" title={r.error ?? r.address ?? ''}>
                              {r.kind === 'error'
                                ? <span className="text-red-700">{r.error}</span>
                                : r.address
                                  ? <span><b>{r.address}</b>{r.city && <> · {r.city.name}</>}{r.oldAddress && <span className="text-slate-400"> (במקום: {r.oldAddress})</span>}</span>
                                  : r.kind === 'same' ? 'ללא שינוי' : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={sendMail} onChange={e => setSendMail(e.target.checked)} />
                    לשלוח ללקוחות מייל עדכון על שינוי הסטטוס (בליקוט / נארז / נשלח / נמסר)
                  </label>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          {result ? (
            <button onClick={onClose} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700">סגירה</button>
          ) : (
            <>
              <button onClick={onClose} disabled={busy} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">ביטול</button>
              <button
                onClick={() => void apply()}
                disabled={busy || !counts.change}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {busy && plan ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                אישור — עדכון {counts.change} הזמנות
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
