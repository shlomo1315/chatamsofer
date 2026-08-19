'use client'
import { useState, useRef } from 'react'
import { Upload, Loader2, CheckCircle2, AlertTriangle, X, FileSpreadsheet } from 'lucide-react'
import { FIELDS, type FieldKey } from '@/lib/specialImportMap'

// ─────────────────────────────────────────────────────────────────────────────
// ייבוא מאושרים חריגים מקובץ אקסל.
//
// ⚠️ תמיד בשני שלבים: העלאה → תצוגה מקדימה → אישור. ייבוא בלחיצה אחת אינו
// הפיך, וקובץ שעמודותיו זוהו לא נכון היה יוצר מאות רשומות שגויות. כאן
// המשתמש רואה בדיוק מה זוהה ומה ייכנס, לפני שנכתב משהו.
// ─────────────────────────────────────────────────────────────────────────────

interface Row { values: Partial<Record<FieldKey, string>>; line: number; error?: string }
interface Preview {
  headers: string[]
  map: Record<string, FieldKey>
  missing: FieldKey[]
  rows: Row[]
  totalRows: number
  validRows: number
  errorRows: number
  existingRows: number
  existingIds: string[]
}

const LABEL: Record<string, string> = Object.fromEntries(FIELDS.map(f => [f.key, f.label]))

export default function ImportExcelPanel() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pv, setPv] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => { setPv(null); setError(null); setDone(null); if (fileRef.current) fileRef.current.value = '' }

  async function upload(file: File) {
    setBusy(true); setError(null); setDone(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/special-import?step=preview', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'קריאת הקובץ נכשלה'); return }
      setPv(d)
    } catch { setError('שגיאת רשת') } finally { setBusy(false) }
  }

  async function commit() {
    if (!pv) return
    const existing = new Set(pv.existingIds)
    const rows = pv.rows.filter(r => !r.error && !existing.has(r.values.id_number ?? ''))
    if (!rows.length) { setError('אין שורות חדשות לייבוא'); return }
    if (!confirm(`לייבא ${rows.length} מאושרים חריגים?\n\nהרשומות ייווצרו כמאושרות.`)) return

    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/admin/special-import?step=commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'הייבוא נכשל'); return }
      setDone({ inserted: d.inserted ?? 0, skipped: d.skipped ?? 0 })
      setPv(null)
      // רענון הטבלה שמתחת
      setTimeout(() => window.location.reload(), 1500)
    } catch { setError('שגיאת רשת') } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors">
        <FileSpreadsheet size={16} /> ייבוא מאקסל
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={17} className="text-emerald-600" />
          <h3 className="font-bold text-slate-800 text-sm">ייבוא מאושרים חריגים מאקסל</h3>
        </div>
        <button type="button" onClick={() => { setOpen(false); reset() }}
          className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {done && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2">
            <CheckCircle2 size={17} className="text-emerald-600 shrink-0" />
            <p className="text-sm font-bold text-emerald-800">
              יובאו {done.inserted.toLocaleString('he-IL')} רשומות
              {done.skipped > 0 && ` · ${done.skipped} דולגו (כבר קיימות)`}
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={17} className="text-rose-600 shrink-0" />
            <p className="text-sm font-bold text-rose-800">{error}</p>
          </div>
        )}

        {!pv && (
          <>
            <p className="text-sm text-slate-500 leading-relaxed">
              העלו קובץ אקסל. העמודות יזוהו אוטומטית לפי הכותרות — תוצג תצוגה
              מקדימה לאישור לפני שנכנס משהו למערכת.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls"
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f) }}
              className="block w-full text-sm text-slate-500 file:mr-0 file:ml-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-emerald-700" />
            {busy && (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> קורא את הקובץ…
              </p>
            )}
          </>
        )}

        {pv && (
          <>
            {/* מה זוהה */}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">עמודות שזוהו</p>
              <div className="flex flex-wrap gap-1.5">
                {pv.headers.map((h, i) => {
                  const key = pv.map[String(i)]
                  return (
                    <span key={i}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold border ${
                        key ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                      {h || `עמודה ${i + 1}`}
                      {key ? ` ← ${LABEL[key] ?? key}` : ' — לא זוהה'}
                    </span>
                  )
                })}
              </div>
            </div>

            {pv.missing.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="text-sm font-bold text-rose-800">
                  חסרות עמודות חובה: {pv.missing.map(k => LABEL[k] ?? k).join(', ')}
                </p>
                <p className="text-xs text-rose-700 mt-1">
                  ודאו שבקובץ יש עמודה עם כותרת מתאימה (למשל &quot;ת.ז&quot; ו&quot;שם&quot;).
                </p>
              </div>
            )}

            {/* מונים */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                ['סה"כ שורות', pv.totalRows, 'text-slate-800'],
                ['ייובאו', pv.validRows, 'text-emerald-700'],
                ['כבר קיימות', pv.existingRows, 'text-amber-700'],
                ['שגויות', pv.errorRows, 'text-rose-700'],
              ] as [string, number, string][]).map(([label, n, tone]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className={`text-lg font-black ${tone}`}>{n.toLocaleString('he-IL')}</p>
                </div>
              ))}
            </div>

            {/* תצוגה מקדימה */}
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-right">
                  <tr className="border-b border-slate-200 text-[12.5px] font-bold text-slate-500">
                    <th className="px-3 py-2">שורה</th>
                    <th className="px-3 py-2">ת.ז</th>
                    <th className="px-3 py-2">שם</th>
                    <th className="px-3 py-2">משפחה</th>
                    <th className="px-3 py-2">טלפון</th>
                    <th className="px-3 py-2">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {pv.rows.slice(0, 100).map(r => {
                    const exists = pv.existingIds.includes(r.values.id_number ?? '')
                    return (
                      <tr key={r.line} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-400 ltr-num">{r.line}</td>
                        <td className="px-3 py-2 text-slate-700 ltr-num">{r.values.id_number ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{r.values.full_name ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{r.values.family_name ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-500 ltr-num">{r.values.phone ?? '—'}</td>
                        <td className="px-3 py-2">
                          {r.error ? <span className="text-rose-700 font-bold text-xs">{r.error}</span>
                            : exists ? <span className="text-amber-700 font-bold text-xs">כבר קיים</span>
                            : <span className="text-emerald-700 font-bold text-xs">ייובא</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {pv.totalRows > pv.rows.length && (
              <p className="text-xs text-slate-400">
                מוצגות {pv.rows.length} שורות ראשונות מתוך {pv.totalRows.toLocaleString('he-IL')}.
              </p>
            )}

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void commit()}
                disabled={busy || pv.missing.length > 0 || pv.validRows === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                ייבוא {pv.validRows.toLocaleString('he-IL')} רשומות
              </button>
              <button type="button" onClick={reset}
                className="text-sm font-bold text-slate-500 hover:text-slate-700">בחירת קובץ אחר</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
