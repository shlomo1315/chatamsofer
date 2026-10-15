'use client'
import { useCallback, useEffect, useState } from 'react'

interface Credit {
  id: string; customer_name: string | null; phone: string | null; email: string | null
  channel: 'phone' | 'email'; books: string; amount_agorot: number; status: string; send_error: string | null
}
interface Preview {
  summary: { count: number; phone: number; email: number; totalAgorot: number }
  sample: { customer_name: string | null; phone: string | null; email: string | null; channel: string; books: string; amount_agorot: number }[]
  errors: { line: number; message: string }[]
}

const STATUS: Record<string, string> = {
  pending: 'ממתין לשליחה', sent: 'נשלח', send_failed: 'השליחה נכשלה', answered: 'ענה', details_entered: 'הזין פרטים',
}
const shekels = (a: number) => (a / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 })
const btn = 'rounded-lg bg-[#1B3256] px-4 py-2 text-sm font-medium text-white disabled:opacity-50'
const btn2 = 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50'

export default function CreditsClient() {
  const [credits, setCredits] = useState<Credit[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [skipErrors, setSkipErrors] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/book-fair/credits')
    const j = await r.json().catch(() => ({}))
    if (r.ok) setCredits(j.credits ?? [])
  }, [])
  // setTimeout(0) כמו במסך הזיכויים: הכלל set-state-in-effect מסמן קריאה ישירה
  useEffect(() => { const h = setTimeout(load, 0); return () => clearTimeout(h) }, [load])

  async function upload(confirm: boolean) {
    if (!file) return
    setBusy(true); setMsg(null)
    const fd = new FormData()
    fd.set('file', file)
    if (confirm) { fd.set('confirm', 'true'); if (skipErrors) fd.set('skipErrors', 'true') }
    const r = await fetch('/api/admin/book-fair/credits', { method: 'POST', body: fd })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      setMsg({ ok: false, text: j.error ?? 'הפעולה נכשלה' })
      if (j.errors) setPreview(p => p ? { ...p, errors: j.errors } : p)
      return
    }
    if (j.preview) { setPreview(j); return }
    setMsg({ ok: true, text: `נשמרו ${j.summary.count} זיכויים` })
    setPreview(null); setFile(null); load()
  }

  async function send(ids: string[], resend = false) {
    if (!ids.length) return
    if (!confirm(`לשלוח ל-${ids.length} לקוחות? שיחות ומיילים אי אפשר לבטל.`)) return
    setBusy(true); setMsg(null)
    const r = await fetch('/api/admin/book-fair/credits/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, resend }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok
      ? { ok: j.failed === 0, text: `נשלחו ${j.sent}, נכשלו ${j.failed}, דולגו ${j.skipped}` }
      : { ok: false, text: j.error ?? 'השליחה נכשלה' })
    setSelected(new Set()); load()
  }

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const unsent = credits.filter(c => c.status === 'pending' || c.status === 'send_failed').map(c => c.id)
  const counts = credits.reduce<Record<string, number>>((m, c) => { m[c.status] = (m[c.status] ?? 0) + 1; return m }, {})

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-bold text-slate-900">העלאת אקסל</h2>
        <p className="text-sm text-slate-600">
          עמודות: שם, טלפון, מייל, ספרים, סכום. בעל טלפון בלבד מקבל שיחה, בעל מייל בלבד מקבל מייל.{' '}
          <a className="text-[#1B3256] underline" href="/api/admin/book-fair/credits?template=1">הורדת תבנית</a>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".xlsx" onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null) }} />
          <button className={btn} disabled={!file || busy} onClick={() => upload(false)}>תצוגה מקדימה</button>
        </div>
        {preview && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-800">
              {preview.summary.count} זיכויים ({preview.summary.phone} שיחות, {preview.summary.email} מיילים), סה&quot;כ {shekels(preview.summary.totalAgorot)} ש&quot;ח
            </p>
            {preview.errors.length > 0 && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <p className="mb-1 font-medium">{preview.errors.length} שורות עם שגיאות:</p>
                <ul className="max-h-40 list-disc overflow-auto pr-5">
                  {preview.errors.map((e, i) => <li key={i}>{e.line ? `שורה ${e.line}: ` : ''}{e.message}</li>)}
                </ul>
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={skipErrors} onChange={e => setSkipErrors(e.target.checked)} />
                  לדלג על השורות האלה ולשמור את השאר
                </label>
              </div>
            )}
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-right text-slate-500"><th className="p-1">לקוח</th><th>ערוץ</th><th>ספרים</th><th>סכום</th></tr></thead>
                <tbody>
                  {preview.sample.map((c, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="p-1">{c.customer_name ?? ''} {c.phone ?? c.email}</td>
                      <td>{c.channel === 'phone' ? 'שיחה' : 'מייל'}</td><td>{c.books}</td><td>{shekels(c.amount_agorot)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.summary.count > preview.sample.length && <p className="text-xs text-slate-500">מוצגות {preview.sample.length} הראשונות</p>}
            </div>
            <button className={btn} disabled={busy || preview.summary.count === 0 || (preview.errors.length > 0 && !skipErrors)} onClick={() => upload(true)}>
              אישור ושמירה
            </button>
          </div>
        )}
      </section>

      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">לקוחות ({credits.length})</h2>
          <div className="flex flex-wrap gap-2">
            <button className={btn} disabled={busy || !unsent.length} onClick={() => send(unsent)}>שליחה לכל מי שלא נשלח ({unsent.length})</button>
            <button className={btn2} disabled={busy || !selected.size} onClick={() => send([...selected], true)}>שליחה חוזרת לנבחרים</button>
            <a className={btn2} href="/api/admin/book-fair/credits/export">ייצוא פרטי חשבון (מנהל)</a>
          </div>
        </div>
        <p className="text-sm text-slate-600">{Object.entries(STATUS).map(([k, v]) => `${v}: ${counts[k] ?? 0}`).join(' · ')}</p>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-slate-500"><th className="p-1"></th><th>לקוח</th><th>ערוץ</th><th>ספרים</th><th>סכום</th><th>סטטוס</th></tr></thead>
            <tbody>
              {credits.map(c => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="p-1"><input type="checkbox" aria-label="בחירה" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td>{c.customer_name ?? ''} {c.phone ?? c.email}</td>
                  <td>{c.channel === 'phone' ? 'שיחה' : 'מייל'}</td>
                  <td>{c.books}</td><td>{shekels(c.amount_agorot)}</td>
                  <td>{STATUS[c.status] ?? c.status}{c.send_error ? ` (${c.send_error})` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
