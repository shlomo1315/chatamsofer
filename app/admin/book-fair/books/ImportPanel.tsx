'use client'
import { useState, useRef } from 'react'
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, X } from 'lucide-react'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { TEMPLATE_HEADERS } from '@/lib/bookFairImport'

// ייבוא קטלוג מאקסל.
//
// 🔴 שני שלבים בכוונה: העלאה מחזירה *תצוגה מקדימה* בלבד, והכתיבה
// מתרחשת רק בלחיצה שנייה מפורשת. קובץ שנכנס חלקית בלי שאיש ידע הוא
// קטלוג שקרי — הספרים שנשמטו פשוט לא יימכרו ואיש לא יבין למה.

type PreviewBook = { sku: string; title: string; price_agorot: number; stock_web: number; stock_phone: number }
type PreviewUpdate = { sku: string; title: string; oldTitle: string }
type RowError = { row: number; messages: string[] }

type Preview = {
  summary: { total: number; create: number; update: number; errors: number; skipped: number }
  create: PreviewBook[]
  update: PreviewUpdate[]
  errors: RowError[]
  duplicateSkus: string[]
}

type Done = { created: number; updated: number; errors: number; failures: string[] }

export default function ImportPanel({ canImport, onDone }: { canImport: boolean; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [mode, setMode] = useState<'merge' | 'skip'>('merge')

  function reset() {
    setFile(null); setPreview(null); setDone(null); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function send(confirm: boolean) {
    if (!file) return
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mode', mode)
      if (confirm) fd.append('confirm', 'true')

      const res = await fetch('/api/admin/book-fair/books/import', { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) { setError(json.error ?? 'הייבוא נכשל'); return }
      if (confirm) setDone(json as Done)
      else setPreview(json as Preview)
    } catch {
      setError('הייבוא נכשל — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  // ── סיום ──
  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 flex-shrink-0 text-emerald-600" size={22} />
          <div className="flex flex-col gap-2">
            <h3 className="font-bold text-emerald-900">הייבוא הושלם</h3>
            <ul className="text-sm text-emerald-800">
              {done.created > 0 && <li>נוספו <b>{done.created}</b> ספרים חדשים</li>}
              {done.updated > 0 && <li>עודכנו <b>{done.updated}</b> ספרים קיימים</li>}
              {done.errors > 0 && <li className="text-amber-800">{done.errors} שורות נדחו בשל שגיאות</li>}
            </ul>
            {done.failures.length > 0 && (
              <div className="rounded-xl bg-white/70 p-3 text-xs text-red-700">
                <b>שורות שנכשלו בשמירה:</b>
                <ul className="mt-1">{done.failures.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button onClick={onDone} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                לקטלוג
              </button>
              <button onClick={reset} className="rounded-xl px-4 py-2 text-sm text-emerald-800 hover:bg-emerald-100">
                ייבוא נוסף
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── שלב 1: התבנית ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-1 font-semibold text-slate-900">1. הורידו את התבנית</h3>
        <p className="mb-4 text-sm text-slate-500">
          מלאו בה את רשימת הספרים. אפשר גם להעלות קובץ משלכם — המערכת מזהה כותרות בניסוחים שונים.
        </p>

        {/* ⚠️ כפתור ולא <a>: זו הורדת קובץ ולא ניווט, ו-<Link> של next
            היה מנסה לנתב אליה כאל עמוד. */}
        <button
          type="button"
          onClick={() => { window.location.href = '/api/admin/book-fair/books/import' }}
          className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
        >
          <Download size={16} /> הורדת תבנית אקסל
        </button>

        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-600">העמודות בתבנית:</p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_HEADERS.map(h => (
              <span
                key={h.field}
                title={h.hint}
                className={`rounded-lg px-2.5 py-1 text-xs ${
                  h.required
                    ? 'bg-indigo-100 font-medium text-indigo-800'
                    : 'bg-white text-slate-500 border border-slate-200'
                }`}
              >
                {h.label}{h.required && ' *'}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">* שדה חובה</p>
        </div>
      </section>

      {/* ── שלב 2: העלאה ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-1 font-semibold text-slate-900">2. העלו את הקובץ המלא</h3>
        <p className="mb-4 text-sm text-slate-500">
          תוצג תצוגה מקדימה לאישור — שום דבר לא נשמר לפני שתאשרו.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            disabled={!canImport}
            onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setError('') }}
            className="block text-sm text-slate-600 file:ml-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          {file && !preview && (
            <button
              onClick={() => send(false)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              בדיקת הקובץ
            </button>
          )}
        </div>

        {!canImport && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            אין לך הרשאת הוספה במחלקה זו.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
        )}
      </section>

      {/* ── שלב 3: תצוגה מקדימה ── */}
      {preview && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">3. אישור</h3>
            <button onClick={reset} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title="ביטול">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="ספרים חדשים" value={preview.summary.create} tone="emerald" />
            <Stat label="עדכון קיימים" value={preview.summary.update} tone="sky" />
            <Stat label="שורות שנדחו" value={preview.summary.errors} tone={preview.summary.errors ? 'red' : 'slate'} />
            <Stat label="שורות ריקות" value={preview.summary.skipped} tone="slate" />
          </div>

          {/* ⚠️ ההתנהגות מול ספרים קיימים נבחרת מפורשות, לא מוכרעת בשקט */}
          {preview.summary.update > 0 && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="mb-2 text-sm font-medium text-sky-900">
                {preview.summary.update} מק״טים כבר קיימים בקטלוג. מה לעשות?
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-start gap-2 text-sm text-sky-800">
                  <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-1" />
                  <span>
                    <b>לעדכן</b> — שם, מחבר, מחיר וכרכים יתעדכנו מהקובץ.
                    <span className="block text-xs text-sky-700">המלאי לא ייגע — הוא משקף מכירות שהתרחשו מאז.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-sky-800">
                  <input type="radio" checked={mode === 'skip'} onChange={() => setMode('skip')} className="mt-1" />
                  <span><b>לדלג</b> — להוסיף רק את החדשים</span>
                </label>
              </div>
            </div>
          )}

          {preview.errors.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-red-900">
                <AlertTriangle size={15} /> שורות שלא ייובאו
              </p>
              <ul className="flex flex-col gap-1 text-xs text-red-800">
                {preview.errors.map(e => (
                  <li key={e.row}>
                    <b>שורה {e.row}:</b> {e.messages.join(' · ')}
                  </li>
                ))}
              </ul>
              {preview.summary.errors > preview.errors.length && (
                <p className="mt-2 text-xs text-red-600">
                  ועוד {preview.summary.errors - preview.errors.length} שורות…
                </p>
              )}
            </div>
          )}

          {preview.create.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">ספרים שייווספו:</p>
              <div className="rounded-xl border border-slate-200">
                <table className="w-full table-fixed text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right w-24">מק״ט</th>
                      <th className="px-3 py-2 text-right">שם</th>
                      <th className="px-3 py-2 text-right w-24">מחיר</th>
                      <th className="px-3 py-2 text-right w-20">אתר</th>
                      <th className="px-3 py-2 text-right w-20">טלפון</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.create.map(b => (
                      <tr key={b.sku}>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{b.sku}</td>
                        <td className="px-3 py-2 truncate" title={b.title}>{b.title}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtAgorot(b.price_agorot)}</td>
                        <td className="px-3 py-2 tabular-nums">{b.stock_web}</td>
                        <td className="px-3 py-2 tabular-nums">{b.stock_phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.summary.create > preview.create.length && (
                <p className="mt-2 text-xs text-slate-400">
                  מוצגים {preview.create.length} מתוך {preview.summary.create}
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={() => send(true)}
              disabled={busy || (preview.summary.create === 0 && (mode === 'skip' || preview.summary.update === 0))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
              ייבוא {preview.summary.create + (mode === 'merge' ? preview.summary.update : 0)} שורות
            </button>
            <button onClick={reset} className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100">
              ביטול
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'sky' | 'red' | 'slate' }) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    sky:     'border-sky-200 bg-sky-50 text-sky-800',
    red:     'border-red-200 bg-red-50 text-red-800',
    slate:   'border-slate-200 bg-slate-50 text-slate-600',
  }
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  )
}
