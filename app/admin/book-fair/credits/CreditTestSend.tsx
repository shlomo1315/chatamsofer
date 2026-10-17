'use client'
import { useState } from 'react'

// שליחת בדיקה: מייל ושיחה עם נתוני דוגמה למנהל עצמו, בלי לגעת בלקוחות.
type Result = { ok: boolean; error?: string }

export default function CreditTestSend() {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState<{ ok: boolean; text: string }[]>([])

  async function send() {
    setBusy(true); setMsgs([])
    const r = await fetch('/api/admin/book-fair/credits/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone }),
    })
    const j = await r.json().catch(() => ({})) as { error?: string; email?: Result; phone?: Result }
    setBusy(false)
    if (!r.ok) { setMsgs([{ ok: false, text: j.error ?? 'שליחת הבדיקה נכשלה' }]); return }
    const out: { ok: boolean; text: string }[] = []
    if (j.email) out.push(j.email.ok
      ? { ok: true, text: `מייל בדיקה נשלח ל-${email.trim()}` }
      : { ok: false, text: `מייל הבדיקה נכשל: ${j.email.error}` })
    if (j.phone) out.push(j.phone.ok
      ? { ok: true, text: `שיחת בדיקה יוצאת ל-${phone.trim()}. אפשר להזין פרטי בנק לדוגמה, הם לא נשמרים` }
      : { ok: false, text: `שיחת הבדיקה נכשלה: ${j.phone.error}` })
    setMsgs(out)
  }

  const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm'
  return (
    <section className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-slate-900">שליחת בדיקה</h2>
        <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">מצב בדיקה</span>
      </div>
      <p className="text-sm text-slate-700">
        מייל ושיחה עם נתוני דוגמה (לקוח לדוגמה, 45.50 ש&quot;ח) לכתובת ולטלפון שלכם. הלקוחות ברשימה לא מקבלים כלום והסטטוס שלהם לא משתנה.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-slate-800">
          מייל
          <input type="email" dir="ltr" className={input} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-800">
          טלפון
          <input type="tel" dir="ltr" className={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="0501234567" />
        </label>
        <button className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy || (!email.trim() && !phone.trim())} onClick={send}>
          {busy ? 'שולח…' : 'שלח בדיקה'}
        </button>
      </div>
      {msgs.map((m, i) => (
        <p key={i} role="status" className={`text-sm font-medium ${m.ok ? 'text-green-800' : 'text-red-700'}`}>{m.text}</p>
      ))}
    </section>
  )
}
