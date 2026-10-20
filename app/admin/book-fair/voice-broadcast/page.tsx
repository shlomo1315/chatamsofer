'use client'
import { useEffect, useMemo, useState } from 'react'

type Recipient = { phone: string; name: string }
const API = '/api/admin/book-fair/voice-broadcast'

const Card = ({ step, title, children }: { step: number; title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-700 text-sm text-white">{step}</span>{title}
    </h2>
    {children}
  </section>
)

// הודעה קולית לרוכשים: 1. נוסח ומספר בדיקה, 2. בדיקה, 3. שליחה לכולם (עם רשימת הנמענים).
export default function VoiceBroadcastPage() {
  const [saved, setSaved] = useState<{ text: string; testPhone: string } | null>(null)
  const [text, setText] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [defaults, setDefaults] = useState('')
  const [spoken, setSpoken] = useState('')
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [started, setStarted] = useState(false)
  const [last, setLast] = useState<{ total: number; dialed: number; at: string } | null>(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(API).then(r => r.json()).then(d => {
      setSaved(d.content); setText(d.content.text); setTestPhone(d.content.testPhone)
      setDefaults(d.defaults.text); setSpoken(d.spoken); setRecipients(d.recipients ?? [])
      setStarted(!!d.alreadyStarted); setLast(d.last ?? null)
    }).catch(() => setMsg('הטעינה נכשלה'))
  }, [])

  const dirty = !!saved && (saved.text !== text.trim() || saved.testPhone !== testPhone.replace(/\D/g, ''))
  const count = recipients.length
  const shown = useMemo(() => {
    const s = q.trim().replace(/\s/g, '')
    return s ? recipients.filter(r => r.name.includes(q.trim()) || r.phone.includes(s)) : recipients
  }, [recipients, q])

  async function call(method: 'PUT' | 'POST', body: object) {
    setBusy(true); setMsg('')
    try {
      const r = await fetch(API, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(d.error ?? 'הפעולה נכשלה'); return null }
      return d
    } finally { setBusy(false) }
  }

  async function save(body: object, done: string) {
    const d = await call('PUT', body)
    if (d) { setSaved(d.content); setText(d.content.text); setTestPhone(d.content.testPhone); setSpoken(d.spoken); setMsg(done) }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">הודעה קולית לרוכשים</h1>
        <p className="mt-1 text-sm text-gray-600">מי שעונה שומע את ההודעה המוקלטת והשיחה מסתיימת. בלי תפריט. ההקלטה נבנית מהנוסח השמור, והמייל נשלח בנפרד.</p>
      </div>

      <Card step={1} title="הנוסח ומספר הבדיקה">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="vb-text">הנוסח <span className="font-normal text-gray-500">(שורה ריקה = הפסקה)</span></label>
            <textarea id="vb-text" rows={14} value={text} onChange={e => setText(e.target.value)} className="w-full rounded-lg border border-gray-300 p-2.5 leading-relaxed" />
            <label className="block text-sm font-medium" htmlFor="vb-phone">מספר טלפון לבדיקה</label>
            <input id="vb-phone" dir="ltr" inputMode="tel" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="05X-XXXXXXX" className="w-full rounded-lg border border-gray-300 p-2.5" />
            <div className="flex flex-wrap gap-3">
              <button disabled={busy || !dirty} onClick={() => save({ text, testPhone }, 'נשמר. ההקלטה החדשה תופק בבדיקה הבאה')} className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">שמור</button>
              <button disabled={busy || text.trim() === defaults} onClick={() => { if (confirm('לאפס לנוסח המקורי?')) save({ reset: true }, 'הנוסח אופס למקורי') }} className="rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50">אפס לנוסח המקורי</button>
            </div>
            {dirty && <p className="text-sm text-amber-700">יש שינויים שלא נשמרו. בדיקה ושליחה משתמשות בנוסח השמור.</p>}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">כך זה יוקרא (טלפון ספרה אחרי ספרה, כתובת אות אחרי אות)</p>
            <div className="max-h-[420px] overflow-auto whitespace-pre-line rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed">{spoken}</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card step={2} title="שיחת בדיקה">
          <p className="mb-3 text-sm text-gray-600">{saved?.testPhone ? <>מחייג למספר השמור: <b dir="ltr">{saved.testPhone}</b></> : 'הזינו מספר בשלב 1 ושמרו, כדי לאפשר בדיקה.'}</p>
          <button disabled={busy || dirty || !saved?.testPhone} onClick={async () => { if (await call('POST', { test: true })) setMsg('מחייגים אליך עכשיו') }} className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">חייג אליי לבדיקה</button>
        </Card>
        <Card step={3} title="שליחה לכולם">
          <p className="mb-3 text-sm text-gray-600">מספרים ייחודיים (הזמנות משלוח בלבד): <b className="text-base text-gray-900">{count || '...'}</b>{started && ' · שליחה מלאה כבר התחילה'}</p>
          <button
            disabled={busy || !count || started || dirty}
            onClick={async () => {
              if (!confirm(`לחייג ל-${count} מספרים ולהשמיע את ההודעה?`)) return
              const d = await call('POST', { confirm: count })
              if (d) { setMsg(`חויגו ${d.dialed} מתוך ${d.total}`); setStarted(true) }
            }}
            className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">שלח לכל הנמענים</button>
          {last && <p className="mt-3 text-sm text-gray-600">שליחה אחרונה ({new Date(last.at).toLocaleString('he-IL')}): חויגו {last.dialed} מתוך {last.total}</p>}
        </Card>
      </div>
      {msg && <p role="status" className="rounded-lg bg-gray-100 p-3">{msg}</p>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">הנמענים ({count})</h2>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם או טלפון" aria-label="חיפוש נמען" className="w-full rounded-lg border border-gray-300 p-2 text-sm sm:w-64" />
        </div>
        <div className="max-h-[480px] overflow-auto rounded-lg border border-gray-100">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 bg-gray-50 text-gray-600"><tr><th className="p-2">שם</th><th className="p-2">טלפון</th></tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.phone} className="border-t border-gray-100">
                  <td className="p-2">{r.name || '—'}</td><td className="p-2" dir="ltr">{r.phone}</td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={2} className="p-4 text-center text-gray-500">לא נמצאו נמענים</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
