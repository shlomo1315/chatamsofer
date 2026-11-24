'use client'
import { useState } from 'react'
import { AlertTriangle, X, Send } from 'lucide-react'

// הודעה מרוכזת לכל המשפחות בבדיקה מעמיקה: "התגלתה תקלה בסדר הדורות".
// הפתיחה מריצה תצוגה מקדימה בלבד (כמה ייכנסו, מי בלי מייל, המייל המלא),
// והשליחה יוצאת רק אחרי לחיצה נוספת על "שלח".
type Person = { id: string; name: string; email: string | null }
type Preview = {
  total: number; toSend: number; alreadySent: number
  noEmail: Person[]; noLineage: Person[]
  from: string; sample: { to: string | null; subject: string; html: string }
}
type Failure = { name: string; email: string; error: string }

export default function BulkLineageFaultButton() {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState<number | null>(null)
  const [failed, setFailed] = useState<Failure[]>([])

  const post = async (send: boolean) => {
    const r = await fetch('/api/admin/beneficiaries/lineage-fault-notice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ send }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'הבקשה נכשלה')
    return d
  }

  const openPreview = async () => {
    setOpen(true); setPreview(null); setSent(null); setFailed([]); setErr(''); setBusy(true)
    try { setPreview(await post(false)) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const sendAll = async () => {
    setBusy(true); setErr(''); setSent(0)
    let total = 0
    try {
      // שולחים במנות עד שלא נשאר אף אחד, או עד מנה שבה אף מייל לא יצא
      // (כשל קבוע אצל כולם), כדי לא להיתקע בלולאה.
      for (;;) {
        const d = await post(true)
        total += d.sent; setSent(total); setFailed(d.failed ?? [])
        if (!d.remaining || !d.sent) break
      }
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const done = sent !== null && !busy

  return (
    <>
      <button type="button" onClick={openPreview}
        className="inline-flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-3.5 py-2 text-sm font-bold text-orange-800 hover:bg-orange-100 transition-colors">
        <AlertTriangle size={15} /> הודעה על תקלה בסדר הדורות
      </button>

      {open && (
        <div className="dlg-backdrop" onClick={() => { if (!busy) setOpen(false) }}>
          <div dir="rtl" onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-navy px-5 py-4 text-white flex items-start gap-3">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-base">הודעה למשפחות בבדיקה מעמיקה</p>
                <p className="text-gold-soft text-xs mt-1">מייל עם קישור אישי להסדרה מחדש של סדר הדורות. משפחה שכבר קיבלה לא תקבל שוב.</p>
              </div>
              <button onClick={() => { if (!busy) setOpen(false) }} className="text-line hover:text-white"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              {busy && !preview && <p className="text-slate-500">טוען תצוגה מקדימה…</p>}
              {err && <p className="text-red-700 font-semibold">{err}</p>}

              {preview && (
                <>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ['בבדיקה מעמיקה', preview.total],
                      ['יקבלו מייל', preview.toSend],
                      ['בלי מייל תקין', preview.noEmail.length],
                      ['כבר קיבלו', preview.alreadySent],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-xl border border-line px-3 py-2">
                        <dt className="text-xs text-slate-500">{l}</dt>
                        <dd className="text-xl font-bold text-navy-dark">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {preview.noLineage.length > 0 && (
                    <p className="text-slate-600">{preview.noLineage.length} משפחות עם מייל אבל בלי שיוך לעץ הדורות, ולכן לא יקבלו קישור.</p>
                  )}

                  <div className="rounded-xl border border-line overflow-hidden">
                    <div className="bg-sand px-3 py-2 text-xs text-slate-600 space-y-0.5">
                      <p><b>מאת:</b> <span dir="ltr">{preview.from}</span></p>
                      <p><b>אל (דוגמה):</b> <span dir="ltr">{preview.sample.to ?? '—'}</span></p>
                      <p><b>נושא:</b> {preview.sample.subject}</p>
                    </div>
                    <iframe title="דוגמת המייל" srcDoc={preview.sample.html} sandbox="" className="w-full h-[420px] bg-white" />
                  </div>

                  {(preview.noEmail.length > 0 || preview.noLineage.length > 0) && (
                    <details className="rounded-xl border border-line px-3 py-2">
                      <summary className="cursor-pointer font-semibold text-slate-700">משפחות שלא יקבלו ({preview.noEmail.length + preview.noLineage.length})</summary>
                      <ul className="mt-2 space-y-0.5 text-slate-600 max-h-48 overflow-y-auto">
                        {preview.noEmail.map(p => <li key={p.id}>{p.name}: אין מייל תקין</li>)}
                        {preview.noLineage.map(p => <li key={p.id}>{p.name}: אין שיוך לעץ</li>)}
                      </ul>
                    </details>
                  )}

                  {sent !== null && (
                    <p className="font-semibold text-navy-dark">{busy ? `שולח… ${sent} נשלחו עד כה` : `נשלחו ${sent} מיילים.`}</p>
                  )}
                  {done && failed.length > 0 && (
                    <ul className="text-red-700 space-y-0.5">
                      {failed.map(f => <li key={f.email}>{f.name} ({f.email}): {f.error}</li>)}
                    </ul>
                  )}

                  <div className="flex justify-end gap-2">
                    <button type="button" disabled={busy} onClick={() => setOpen(false)}
                      className="rounded-xl border border-line px-4 py-2 font-semibold text-slate-600 hover:bg-sand disabled:opacity-50">
                      {done ? 'סגירה' : 'ביטול'}
                    </button>
                    {sent === null && preview.toSend > 0 && (
                      <button type="button" disabled={busy} onClick={sendAll}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 font-bold text-white hover:bg-navy-dark disabled:opacity-50">
                        <Send size={15} /> שלח ל-{preview.toSend} משפחות
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
