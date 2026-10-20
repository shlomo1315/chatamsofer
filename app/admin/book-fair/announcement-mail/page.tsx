'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

type Content = { subject: string; body: string }
const API = '/api/admin/book-fair/announcement-mail'

const Card = ({ step, title, children }: { step: number; title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-700 text-sm text-white">{step}</span>{title}
    </h2>
    {children}
  </section>
)

// מסך מייל ההודעה למזמינים: 1. נוסח (עריכה + תצוגה חיה), 2. בדיקה, 3. שליחה לכולם.
export default function AnnouncementMailPage() {
  const [saved, setSaved] = useState<Content | null>(null)
  const [draft, setDraft] = useState<Content>({ subject: '', body: '' })
  const [defaults, setDefaults] = useState<Content | null>(null)
  const [html, setHtml] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [started, setStarted] = useState(false)
  const [last, setLast] = useState<{ total: number; sent: number; failed: number; at: string } | null>(null)
  const [test, setTest] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(API).then(r => r.json()).then(d => {
      setSaved(d.content); setDraft(d.content); setDefaults(d.defaults); setHtml(d.html ?? '')
      setCount(d.count ?? null); setStarted(!!d.alreadyStarted); setLast(d.last ?? null)
    }).catch(() => setMsg('הטעינה נכשלה'))
  }, [])

  // תצוגה חיה של הטיוטה (בדיוק כמו המייל שיישלח, כולל הלוגו)
  const refreshPreview = useCallback((c: Content) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview: c }) })
        .then(r => r.json()).then(d => { if (d.html) setHtml(d.html) }).catch(() => {})
    }, 400)
  }, [])

  const edit = (c: Content) => { setDraft(c); refreshPreview(c) }
  const dirty = !!saved && (saved.subject !== draft.subject.trim() || saved.body !== draft.body.trim())

  async function call(method: 'PUT' | 'POST', body: object) {
    setBusy(true); setMsg('')
    try {
      const r = await fetch(API, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setMsg(d.error ?? 'הפעולה נכשלה')
      return r.ok ? d : null
    } finally { setBusy(false) }
  }

  async function save(body: object, done: string) {
    const d = await call('PUT', body)
    if (d) { setSaved(d.content); setDraft(d.content); setHtml(d.html); setMsg(done) }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">הודעה למזמינים במייל</h1>
        <p className="mt-1 text-sm text-gray-600">נשלח מכתובת היריד למזמינים דרך האתר עם משלוח. כתובת אחת מקבלת מייל אחד. עריכת הנוסח כאן לא משנה את ההקלטה הקולית.</p>
      </div>

      <Card step={1} title="הנוסח">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="am-subject">נושא המייל</label>
            <input id="am-subject" value={draft.subject} onChange={e => edit({ ...draft, subject: e.target.value })} className="w-full rounded-lg border border-gray-300 p-2.5" />
            <label className="block text-sm font-medium" htmlFor="am-body">תוכן ההודעה <span className="font-normal text-gray-500">(שורה ריקה = פסקה חדשה)</span></label>
            <textarea id="am-body" rows={16} value={draft.body} onChange={e => edit({ ...draft, body: e.target.value })} className="w-full rounded-lg border border-gray-300 p-2.5 leading-relaxed" />
            <div className="flex flex-wrap gap-3">
              <button disabled={busy || !dirty} onClick={() => save(draft, 'הנוסח נשמר')} className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">שמור נוסח</button>
              <button disabled={busy || !defaults} onClick={() => { if (defaults && confirm('לאפס לנוסח המקורי?')) save({ reset: true }, 'הנוסח אופס למקורי') }} className="rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50">אפס לנוסח המקורי</button>
            </div>
            {dirty && <p className="text-sm text-amber-700">יש שינויים שלא נשמרו. בדיקה ושליחה משתמשות בנוסח השמור.</p>}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">כך המייל ייראה</p>
            <p className="mb-2 rounded-lg bg-gray-50 p-2.5 text-sm"><span className="text-gray-500">נושא: </span>{draft.subject || defaults?.subject}</p>
            <iframe title="תצוגה מקדימה של המייל" srcDoc={html} className="h-[560px] w-full rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card step={2} title="שליחת בדיקה">
          <p className="mb-3 text-sm text-gray-600">שולח את הנוסח השמור לכתובת אחת בלבד.</p>
          <input dir="ltr" value={test} onChange={e => setTest(e.target.value)} placeholder="name@example.com" className="mb-3 w-full rounded-lg border border-gray-300 p-2.5" />
          <button disabled={busy || !test || dirty} onClick={async () => { if (await call('POST', { test })) setMsg('מייל הבדיקה נשלח') }} className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">שלח בדיקה</button>
        </Card>
        <Card step={3} title="שליחה לכולם">
          <p className="mb-3 text-sm text-gray-600">נמענים: <b className="text-base text-gray-900">{count ?? '...'}</b>{started && ' · שליחה מלאה כבר התחילה'}</p>
          <button
            disabled={busy || count == null || started || dirty}
            onClick={async () => {
              if (!confirm(`לשלוח מייל ל-${count} כתובות?`)) return
              const d = await call('POST', { confirm: count })
              if (d) { setMsg(`נשלחו ${d.sent} מתוך ${d.total}, נכשלו ${d.failed}`); setStarted(true) }
            }}
            className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">שלח לכל הנמענים</button>
          {last && <p className="mt-3 text-sm text-gray-600">שליחה אחרונה ({new Date(last.at).toLocaleString('he-IL')}): נשלחו {last.sent} מתוך {last.total}, נכשלו {last.failed}</p>}
        </Card>
      </div>
      {msg && <p role="status" className="rounded-lg bg-gray-100 p-3">{msg}</p>}
    </div>
  )
}
