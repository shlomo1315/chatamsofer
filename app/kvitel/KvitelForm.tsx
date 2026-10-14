'use client'

import { useState } from 'react'
import { Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { KVITEL_REQUEST_OPTIONS, MAX_LINES, formatLine, type KvitelRelation } from '@/lib/kvitel'

interface Row { name: string; relation: KvitelRelation; parentName: string; requestType: string; requestNote: string }
const emptyRow = (): Row => ({ name: '', relation: 'ben', parentName: '', requestType: '', requestNote: '' })

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-[#1B3256] focus:outline-none focus:ring-2 focus:ring-[#1B3256]/20'
const label = 'mb-1 block text-sm font-medium text-slate-700'

export default function KvitelForm() {
  const [website, setWebsite] = useState('')
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<string[] | null>(null)
  const [missingType, setMissingType] = useState<Set<number>>(new Set())

  const update = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  function removeRow(i: number) {
    setRows(rs => rs.filter((_, j) => j !== i))
    setMissingType(new Set())
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const missing = new Set(rows.flatMap((r, i) => (r.requestType ? [] : [i])))
    setMissingType(missing)
    if (missing.size) { setError('נא לבחור את סוג הבקשה בכל השמות'); return }
    setSending(true)
    try {
      const res = await fetch('/api/kvitel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website, lines: rows }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'השליחה נכשלה. נסו שוב.'); return }
      setSent(rows.map(r => formatLine(r)))
    } catch {
      setError('אין חיבור לשרת. נסו שוב.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
        <h2 className="mt-3 text-xl font-bold" style={{ color: '#1B3256' }}>השמות התקבלו</h2>
        <p className="mt-2 text-sm text-slate-600">הם יוזכרו בתפילה על הציון הקדוש.</p>
        <ul className="mt-5 space-y-2 text-right text-base text-slate-800">
          {sent.map((l, i) => <li key={i} className="border-b border-slate-100 pb-2">{l}</li>)}
        </ul>
        <button
          type="button"
          onClick={() => { setSent(null); setRows([emptyRow()]) }}
          className="mt-6 text-sm font-medium underline"
          style={{ color: '#1B3256' }}
        >
          שליחת שמות נוספים
        </button>
      </section>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {/* מלכודת לבוטים — מוסתר מבני אדם */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">אתר</label>
        <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-bold" style={{ color: '#1B3256' }}>שמות ובקשות</h2>
        {rows.map((r, i) => (
          <fieldset key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <legend className="text-sm font-semibold text-slate-500">שם {i + 1}</legend>
              {rows.length > 1 && (
                <button type="button" onClick={() => removeRow(i)} className="flex items-center gap-1 text-sm text-rose-700" aria-label={`הסרת שם ${i + 1}`}>
                  <Trash2 className="h-4 w-4" aria-hidden /> הסרה
                </button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <label htmlFor={`name-${i}`} className={label}>שם</label>
                <input id={`name-${i}`} className={input} value={r.name} onChange={e => update(i, { name: e.target.value })} placeholder="הזינו את השם הפרטי" />
              </div>
              <div>
                <span className={label}>בן / בת</span>
                <div className="flex gap-2" role="radiogroup">
                  {(['ben', 'bat'] as const).map(rel => (
                    <button
                      key={rel} type="button" role="radio" aria-checked={r.relation === rel}
                      onClick={() => update(i, { relation: rel })}
                      className={`rounded-lg border px-4 py-2.5 text-base ${r.relation === rel ? 'border-[#1B3256] bg-[#1B3256] text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                    >
                      {rel === 'ben' ? 'בן' : 'בת'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor={`parent-${i}`} className={label}>שם האם</label>
                <input id={`parent-${i}`} className={input} value={r.parentName} onChange={e => update(i, { parentName: e.target.value })} placeholder="הזינו את שם האם" />
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor={`type-${i}`} className={label}>הבקשה</label>
              <select
                id={`type-${i}`}
                className={`${input} ${r.requestType ? '' : 'text-slate-500'} ${missingType.has(i) ? 'border-rose-500' : ''}`}
                value={r.requestType}
                aria-invalid={missingType.has(i)}
                aria-describedby={missingType.has(i) ? `type-err-${i}` : undefined}
                onChange={e => {
                  update(i, { requestType: e.target.value })
                  setMissingType(m => { const next = new Set(m); next.delete(i); return next })
                }}
              >
                <option value="" disabled>נא בחר את סוג הבקשה</option>
                {KVITEL_REQUEST_OPTIONS.map(t => <option key={t.key} value={t.key} className="text-slate-900">{t.label}</option>)}
              </select>
              {missingType.has(i) && <p id={`type-err-${i}`} className="mt-1 text-sm text-rose-700">נא לבחור את סוג הבקשה</p>}
              {r.requestType === 'other' && (
                <input className={`${input} mt-2`} value={r.requestNote} maxLength={80} onChange={e => update(i, { requestNote: e.target.value })} placeholder="כתבו את הבקשה בקצרה" aria-label="הבקשה" />
              )}
            </div>
          </fieldset>
        ))}
        {rows.length < MAX_LINES && (
          <button
            type="button" onClick={() => setRows(rs => [...rs, emptyRow()])}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-3 text-base font-medium text-slate-700 hover:border-[#1B3256]"
          >
            <Plus className="h-5 w-5" aria-hidden /> הוספת שם
          </button>
        )}
      </section>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
        <button
          type="submit" disabled={sending}
          className="w-full rounded-xl py-3.5 text-lg font-bold text-white disabled:opacity-60"
          style={{ backgroundColor: '#1B3256' }}
        >
          {sending ? 'שולח…' : 'שליחת השמות'}
        </button>
      </div>
    </form>
  )
}
