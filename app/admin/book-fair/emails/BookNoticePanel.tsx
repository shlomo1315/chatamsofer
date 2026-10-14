'use client'
import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, Phone, Mail, Send, AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'
import { DEFAULT_SUBJECT, DEFAULT_EMAIL_MESSAGE, DEFAULT_PHONE_MESSAGE } from '@/lib/bookFairBookNotice'

// הודעה למזמיני ספר אחד — שיחה טלפונית ומייל (14.10).
// תצוגה מקדימה קודם, ושליחה רק בלחיצה ובאישור. מי שכבר קיבל לא יקבל שוב.

type Book = { id: string; title: string; author: string | null; publisher: string | null; sku: string }
type Target = { key: string; name: string | null; orders: string[] }
type Preview = {
  book: Book
  orders: number
  withEmail: number
  withPhone: number
  phoneOnly: number
  emailOnly: number
  sentEmail: number
  sentPhone: number
  pendingEmail: Target[]
  pendingPhone: Target[]
  noContact: { orderNumber: string; name: string | null; phone: string | null; email: string | null }[]
  history: { id: string; channel: 'email' | 'phone'; status: string; total: number; sent_count: number | null; failed_count: number | null; created_at: string }[]
  callConfigured: boolean
}

const API = '/api/admin/book-fair/book-notice'

export default function BookNoticePanel() {
  const canSend = useCan('book_fair', 'edit')
  const [q, setQ] = useState('חוט המשולש')
  const [books, setBooks] = useState<(Book & { is_active: boolean })[] | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const [subject, setSubject] = useState('')
  const [emailMsg, setEmailMsg] = useState('')
  const [phoneMsg, setPhoneMsg] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [busy, setBusy] = useState('')

  const search = useCallback(async (term: string) => {
    setError('')
    try {
      const res = await fetch(`${API}?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'החיפוש נכשל')
      setBooks(j.books ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'החיפוש נכשל')
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetch(`${API}?q=${encodeURIComponent('חוט המשולש')}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (alive) setBooks(j.books ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const load = useCallback(async (bookId: string, resetTexts: boolean) => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}?bookId=${bookId}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'הטעינה נכשלה')
      setPreview(j)
      if (resetTexts) {
        setSubject(DEFAULT_SUBJECT(j.book.title))
        setEmailMsg(DEFAULT_EMAIL_MESSAGE(j.book.title))
        setPhoneMsg(DEFAULT_PHONE_MESSAGE(j.book.title))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הטעינה נכשלה')
    } finally {
      setLoading(false)
    }
  }, [])

  async function send(channel: 'email' | 'phone', test: boolean) {
    if (!preview) return
    const n = channel === 'email' ? preview.pendingEmail.length : preview.pendingPhone.length
    if (!test && !window.confirm(channel === 'email'
      ? `לשלוח מייל ל-${n} כתובות? אי אפשר לבטל מייל שיצא.`
      : `להתקשר ל-${n} מספרים ולהקריא את ההודעה? אי אפשר לבטל שיחה שיצאה.`)) return
    setBusy(`${channel}-${test ? 'test' : 'send'}`); setError(''); setInfo('')
    try {
      const res = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: preview.book.id, channel,
          subject, message: channel === 'email' ? emailMsg : phoneMsg,
          ...(test ? { test: channel === 'email' ? testEmail : testPhone } : { confirm: true }),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'השליחה נכשלה')
      if (test) setInfo(channel === 'email' ? `מייל מבחן נשלח ל-${testEmail}` : `שיחת מבחן יצאה ל-${testPhone}`)
      else {
        setInfo(`${channel === 'email' ? 'מיילים' : 'שיחות'}: ${j.sent} מתוך ${j.total} יצאו${j.failed ? ` · ${j.failed} נכשלו (יישלחו שוב בלחיצה הבאה)` : ''}`)
        await load(preview.book.id, false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'השליחה נכשלה')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
      <div>
        <h2 className="font-bold text-slate-900">הודעה למזמיני ספר מסוים</h2>
        <p className="text-sm text-slate-500">שיחה טלפונית ומייל לכל מי שהזמין את הספר. קודם תצוגה מקדימה, ושליחה רק בלחיצה. מי שכבר קיבל לא יקבל שוב.</p>
      </div>

      <form onSubmit={e => { e.preventDefault(); search(q) }} className="flex flex-wrap gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="שם הספר" className={`${INPUT} min-w-0 flex-1`} />
        <button className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          <Search size={15} /> חיפוש
        </button>
      </form>

      {books && (
        books.length === 0
          ? <p className="text-sm text-slate-500">לא נמצא ספר בשם הזה בקטלוג</p>
          : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-slate-500">נמצאו {books.length} ספרים. בחרו את הספר:</p>
              <div className="flex flex-wrap gap-2">
                {books.map(b => (
                  <button key={b.id} onClick={() => load(b.id, true)}
                    className={`rounded-xl border px-3 py-2 text-right text-sm ${preview?.book.id === b.id ? 'border-amber-500 bg-white ring-2 ring-amber-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                    <span className="font-medium text-slate-900">{b.title}</span>
                    <span className="block text-xs text-slate-500">
                      {[b.author, b.publisher, `מק״ט ${b.sku}`].filter(Boolean).join(' · ')}{!b.is_active && ' · לא פעיל'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{info}</p>}
      {loading && <div className="flex justify-center py-6"><Loader2 size={22} className="animate-spin text-slate-400" /></div>}

      {preview && !loading && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-slate-900">{preview.book.title}</h3>
            <button onClick={() => load(preview.book.id, false)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              <RefreshCw size={14} /> רענון
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="הזמנות פעילות" value={preview.orders} />
            <Stat label="כתובות מייל" value={preview.withEmail} />
            <Stat label="מספרי טלפון" value={preview.withPhone} />
            <Stat label="בלי מייל ובלי טלפון" value={preview.noContact.length} warn={preview.noContact.length > 0} />
          </div>
          <p className="text-xs text-slate-500">
            {preview.phoneOnly} הזמנות עם טלפון בלבד · {preview.emailOnly} עם מייל בלבד · מבוטלות, שלא שולמו ומזוכות במלואן לא נכללות
          </p>

          {/* ── טלפון ── */}
          <Channel
            icon={<Phone size={16} />} title="שיחה טלפונית (הקראה)"
            sent={preview.sentPhone} pending={preview.pendingPhone} ltrKeys
          >
            {!preview.callConfigured && (
              <p className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle size={15} /> שיחות יוצאות בימות אינן מוגדרות בשרת, ולכן לא תצא שיחה
              </p>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">הטקסט להקראה</span>
              <textarea value={phoneMsg} onChange={e => setPhoneMsg(e.target.value)} rows={4} className={INPUT} />
              <span className="text-xs text-slate-400">פסיקים ונקודות מוסרים לפני ההקראה (ימות קוטעת בהם). להפסקה קצרה כתבו ;</span>
            </label>
            {canSend && (
              <Actions
                testValue={testPhone} setTest={setTestPhone} testPlaceholder="050-0000000"
                testOk={testPhone.replace(/\D/g, '').length >= 9}
                busy={busy} channel="phone" count={preview.pendingPhone.length} unit="מספרים"
                disabled={!preview.callConfigured || !phoneMsg.trim()} onSend={send}
              />
            )}
          </Channel>

          {/* ── מייל ── */}
          <Channel
            icon={<Mail size={16} />} title="מייל"
            sent={preview.sentEmail} pending={preview.pendingEmail} ltrKeys
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">נושא</span>
              <input value={subject} onChange={e => setSubject(e.target.value)} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">המלל</span>
              <textarea value={emailMsg} onChange={e => setEmailMsg(e.target.value)} rows={9} className={INPUT} />
              <span className="text-xs text-slate-400">בראש המייל יופיע &quot;שלום וברכה להרב [שם]&quot; וקישור להזמנה שלו. נשלח מ-yerid@chasamsofer.info</span>
            </label>
            {canSend && (
              <Actions
                testValue={testEmail} setTest={setTestEmail} testPlaceholder="name@example.com"
                testOk={testEmail.includes('@')}
                busy={busy} channel="email" count={preview.pendingEmail.length} unit="כתובות"
                disabled={!subject.trim() || !emailMsg.trim()} onSend={send}
              />
            )}
          </Channel>

          {/* ── בלי פרטי קשר ── */}
          {preview.noContact.length > 0 && (
            <div className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-white p-3">
              <h4 className="text-sm font-bold text-red-800">בלי מייל ובלי טלפון תקין ({preview.noContact.length}) — צריך לטפל ידנית</h4>
              <ul className="divide-y divide-slate-100 text-sm">
                {preview.noContact.map(n => (
                  <li key={n.orderNumber} className="flex flex-wrap gap-x-4 gap-y-0.5 py-1.5">
                    <span className="font-medium text-slate-900">{n.orderNumber}</span>
                    <span>{n.name || '—'}</span>
                    {n.phone && <span className="text-slate-500" dir="ltr">{n.phone}</span>}
                    {n.email && <span className="break-all text-slate-500" dir="ltr">{n.email}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.history.length > 0 && (
            <div className="flex flex-col gap-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700">שליחות קודמות לספר הזה</span>
              {preview.history.map(h => (
                <span key={h.id}>
                  {fmt(h.created_at)} · {h.channel === 'phone' ? 'שיחות' : 'מיילים'} · {h.sent_count ?? 0}/{h.total} יצאו{h.failed_count ? ` · ${h.failed_count} נכשלו` : ''}{h.status === 'sending' ? ' · בתהליך' : ''}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Channel({ icon, title, sent, pending, ltrKeys, children }: {
  icon: React.ReactNode; title: string; sent: number; pending: Target[]; ltrKeys?: boolean; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="inline-flex items-center gap-1.5 font-bold text-slate-900">{icon} {title}</h4>
        <span className="text-sm text-slate-600">ממתינים: <b>{pending.length}</b></span>
        {sent > 0 && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><Check size={14} /> כבר קיבלו: {sent}</span>}
      </div>
      {pending.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">רשימת הממתינים</summary>
          <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {pending.map(t => (
              <li key={t.key} className="flex flex-wrap gap-x-4 py-1">
                <span>{t.name || '—'}</span>
                <span className="break-all text-slate-500" dir={ltrKeys ? 'ltr' : undefined}>{t.key}</span>
                <span className="text-slate-400">{t.orders.join(', ')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {children}
    </div>
  )
}

function Actions({ testValue, setTest, testPlaceholder, testOk, busy, channel, count, unit, disabled, onSend }: {
  testValue: string; setTest: (v: string) => void; testPlaceholder: string; testOk: boolean
  busy: string; channel: 'email' | 'phone'; count: number; unit: string; disabled: boolean
  onSend: (c: 'email' | 'phone', test: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">{channel === 'phone' ? 'שיחת מבחן אל' : 'מייל מבחן אל'}</span>
        <input value={testValue} onChange={e => setTest(e.target.value)} dir="ltr" placeholder={testPlaceholder} className={INPUT} />
      </label>
      <button onClick={() => onSend(channel, true)} disabled={!!busy || disabled || !testOk}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
        {busy === `${channel}-test` ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} מבחן
      </button>
      <button onClick={() => onSend(channel, false)} disabled={!!busy || disabled || count === 0}
        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40">
        {busy === `${channel}-send` ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        {busy === `${channel}-send` ? 'שולח… (עד כמה דקות)' : count === 0 ? 'כולם כבר קיבלו' : `שליחה ל-${count} ${unit}`}
      </button>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`flex flex-col rounded-xl border bg-white px-3 py-2 ${warn ? 'border-red-200' : 'border-slate-200'}`}>
      <span className={`text-lg font-bold ${warn ? 'text-red-700' : 'text-slate-900'}`}>{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const INPUT = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100'
