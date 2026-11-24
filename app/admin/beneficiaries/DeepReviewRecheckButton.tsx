'use client'
import { useState } from 'react'
import { RefreshCw, X, Check } from 'lucide-react'
import { requestErrorMessage } from '@/lib/lineageFaultNotice'

// חישוב מחדש של כל המשפחות בבדיקה מעמיקה מול הקובץ המאושר.
// הפתיחה מריצה תצוגה מקדימה בלבד; השינוי במסד רק אחרי לחיצה על "אישור".
// מי שסדר הדורות שלה תקין עכשיו עוברת ל"ממתין לאישור ראשוני".
type Person = { id: string; name: string; reason: string | null }
type Summary = {
  total: number; release: Person[]; reasonUpdate: number; stillDeep: number; manual: Person[]
  released?: number; reasonsUpdated?: number; failed?: { name: string; error: string }[]
}

const API = '/api/admin/lineage/deep-review-recheck'

async function post(payload: object): Promise<Summary> {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .catch(() => { throw new Error(requestErrorMessage(0, null)) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(requestErrorMessage(r.status, d))
  return d
}

export default function DeepReviewRecheckButton() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [plan, setPlan] = useState<Summary | null>(null)
  const [result, setResult] = useState<Summary | null>(null)

  const openPreview = async () => {
    setOpen(true); setPlan(null); setResult(null); setErr(''); setBusy(true)
    try { setPlan(await post({})) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const apply = async () => {
    setBusy(true); setErr('')
    try { setResult(await post({ apply: true })) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const close = () => {
    if (busy) return
    setOpen(false)
    // אחרי שינוי בפועל הרשימה במסך כבר לא נכונה
    if (result) window.location.reload()
  }

  const s = result ?? plan

  return (
    <>
      <button type="button" onClick={openPreview}
        className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2 text-sm font-bold text-navy-dark hover:bg-sand transition-colors">
        <RefreshCw size={15} /> בדיקה מחדש של סדר הדורות
      </button>

      {open && (
        <div className="dlg-backdrop" onClick={close}>
          <div dir="rtl" onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="bg-navy px-5 py-4 text-white flex items-start gap-3">
              <RefreshCw size={20} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-base">בדיקה מחדש של המשפחות בבדיקה מעמיקה</p>
                <p className="text-gold-soft text-xs mt-1">
                  כל משפחה נבדקת שוב מול הקובץ המאושר. מי שסדר הדורות שלה תקין עכשיו תעבור ל&quot;ממתין לאישור ראשוני&quot;.
                  שום דבר לא משתנה עד הלחיצה על אישור.
                </p>
              </div>
              <button onClick={close} className="text-line hover:text-white"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              {busy && !s && <p className="text-slate-500">בודק את כל המשפחות…</p>}
              {err && <p className="text-red-700 font-semibold">{err}</p>}

              {s && (
                <>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ['בבדיקה מעמיקה', s.total],
                      [result ? 'עברו לממתין' : 'יעברו לממתין', result ? result.released ?? 0 : s.release.length],
                      ['נשארות בבדיקה', s.stillDeep],
                      ['סיבה שהמזכירות רשמה', s.manual.length],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-xl border border-line px-3 py-2">
                        <dt className="text-xs text-slate-500">{l}</dt>
                        <dd className="text-xl font-bold text-navy-dark">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  {s.reasonUpdate > 0 && (
                    <p className="text-slate-600">
                      {result ? `עודכנה הסיבה אצל ${result.reasonsUpdated ?? 0} משפחות` : `אצל ${s.reasonUpdate} מהנשארות תתעדכן הסיבה`} למצב הנוכחי של סדר הדורות.
                    </p>
                  )}
                  {s.manual.length > 0 && (
                    <p className="text-slate-600">{s.manual.length} משפחות בבדיקה מעמיקה מסיבה שהמזכירות רשמה. בהן לא נוגעים.</p>
                  )}

                  {s.release.length > 0 && (
                    <details className="rounded-xl border border-line px-3 py-2" open={!result}>
                      <summary className="cursor-pointer font-semibold text-slate-700">
                        {result ? 'עברו' : 'יעברו'} לממתין לאישור ראשוני ({s.release.length})
                      </summary>
                      <ul className="mt-2 space-y-0.5 text-slate-600 max-h-56 overflow-y-auto">
                        {s.release.map(p => <li key={p.id}>{p.name}{p.reason ? <span className="text-slate-400"> · היה: {p.reason}</span> : null}</li>)}
                      </ul>
                    </details>
                  )}

                  {result && (
                    <p className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                      <Check size={15} /> בוצע. {result.released ?? 0} משפחות עברו לממתין.
                    </p>
                  )}
                  {result?.failed && result.failed.length > 0 && (
                    <ul className="text-red-700 space-y-0.5">
                      {result.failed.map((f, i) => <li key={i}>{f.name}: {f.error}</li>)}
                    </ul>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button type="button" disabled={busy} onClick={close}
                      className="rounded-xl border border-line px-4 py-2 font-semibold text-slate-600 hover:bg-sand disabled:opacity-50">
                      {result ? 'סגירה' : 'ביטול'}
                    </button>
                    {!result && (s.release.length > 0 || s.reasonUpdate > 0) && (
                      <button type="button" disabled={busy} onClick={apply}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 font-bold text-white hover:bg-navy-dark disabled:opacity-50">
                        <Check size={15} /> {busy ? 'מעדכן…' : `אישור: ${s.release.length} לממתין`}
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
