'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useCan } from '@/components/StaffPermissions'

interface Credit { id: string; order_id: string; order_number: string; title: string; quantity: number; source: string; created_at: string }
interface Matched { item_id: string; order_number: string; title: string; quantity: number }
interface Unmatched { line: number; order_number: string; book: string; reason: string }
interface Preview { summary: { rows: number; items: number; copies: number; unmatched: number }; matched: Matched[]; unmatched: Unmatched[] }

const btn = 'rounded-lg bg-[#1B3256] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#14243f] disabled:opacity-50'

export default function ItemCreditsClient() {
  const canEdit = useCan('book_fair', 'edit')
  const [credits, setCredits] = useState<Credit[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [skipErrors, setSkipErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/book-fair/item-credits', { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (r.ok) setCredits(j.credits ?? [])
  }, [])
  useEffect(() => { const h = setTimeout(load, 0); return () => clearTimeout(h) }, [load])

  async function upload(confirm: boolean) {
    if (!file) return
    setBusy(true); setMsg(null)
    const fd = new FormData()
    fd.set('file', file)
    if (confirm) { fd.set('confirm', 'true'); if (skipErrors) fd.set('skipErrors', 'true') }
    const r = await fetch('/api/admin/book-fair/item-credits', { method: 'POST', body: fd })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      setMsg({ ok: false, text: j.error ?? 'הפעולה נכשלה' })
      if (j.unmatched) setPreview(p => p ? { ...p, unmatched: j.unmatched } : p)
      return
    }
    if (j.preview) { setPreview(j); return }
    setMsg({ ok: true, text: `נשמרו ${j.summary.items} שורות (${j.summary.copies} עותקים)` })
    setPreview(null); setFile(null); load()
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-bold text-slate-900">העלאת אקסל</h2>
        <p className="text-sm text-slate-600">
          עמודות: מספר הזמנה, שם ספר, וכמות (לא חובה, ברירת מחדל 1). הקובץ קובע את הכמות המזוכה בשורה, כך שהעלאה חוזרת אינה מכפילה.{' '}
          <a className="text-[#1B3256] underline" href="/api/admin/book-fair/item-credits?template=1">הורדת תבנית</a>
        </p>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".xlsx" onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null) }} />
            <button className={btn} disabled={!file || busy} onClick={() => upload(false)}>תצוגה מקדימה</button>
          </div>
        ) : <p className="text-sm text-slate-500">אין לך הרשאת עריכה ביריד.</p>}
        {preview && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-800">
              הותאמו {preview.summary.items} שורות הזמנה ({preview.summary.copies} עותקים) מתוך {preview.summary.rows} שורות בקובץ
            </p>
            {preview.matched.length > 0 && (
              <ul className="max-h-48 list-disc overflow-auto pr-5 text-sm text-slate-700">
                {preview.matched.map(m => <li key={m.item_id}>הזמנה {m.order_number}: {m.title} × {m.quantity}</li>)}
              </ul>
            )}
            {preview.unmatched.length > 0 && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <p className="mb-1 font-medium">{preview.unmatched.length} שורות שלא הותאמו:</p>
                <ul className="max-h-48 list-disc overflow-auto pr-5">
                  {preview.unmatched.map((u, i) => (
                    <li key={i}>שורה {u.line}{u.order_number && ` · הזמנה ${u.order_number}`}{u.book && ` · ${u.book}`}: {u.reason}</li>
                  ))}
                </ul>
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={skipErrors} onChange={e => setSkipErrors(e.target.checked)} />
                  לדלג על השורות האלה ולשמור את השאר
                </label>
              </div>
            )}
            <button className={btn} disabled={busy || preview.summary.items === 0 || (preview.unmatched.length > 0 && !skipErrors)} onClick={() => upload(true)}>
              שמירת הסימונים
            </button>
          </div>
        )}
        {msg && <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">ספרים שסומנו כזוכו ({credits.length})</h2>
          {credits.length > 0 && (
            <a className={btn} href="/api/admin/book-fair/item-credits?export=1">הורדת אקסל להעלאה בזיכוי על ספרים חסרים</a>
          )}
        </div>
        <p className="mb-3 text-sm text-slate-600">
          סימון ידני וביטול סימון: בכרטיס ההזמנה, ליד שורת הספר. באקסל שורה אחת לכל לקוח עם כל הספרים והסכום המלא,
          ואפשר להעלות אותו כמו שהוא. עמודת &quot;סטטוס זיכוי&quot; מראה אם כבר הועלה, נשלח או הועבר בבנק.
        </p>
        {credits.length === 0 ? <p className="text-sm text-slate-500">עדיין לא סומנו ספרים.</p> : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr><th className="pb-2 text-right">הזמנה</th><th className="pb-2 text-right">ספר</th><th className="pb-2 text-right">כמות</th><th className="pb-2 text-right">מקור</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {credits.map(c => (
                <tr key={c.id}>
                  <td className="py-2"><Link className="text-[#1B3256] underline" href={`/admin/book-fair/orders/${c.order_id}`}>{c.order_number}</Link></td>
                  <td className="py-2">{c.title}</td>
                  <td className="py-2 tabular-nums">{c.quantity}</td>
                  <td className="py-2 text-slate-500">{c.source === 'excel' ? 'אקסל' : 'ידני'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
