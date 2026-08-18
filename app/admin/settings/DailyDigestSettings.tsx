'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, X, Check, Mail, Send, CalendarClock } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// סיכום יומי למנהל — הפעלה, נמענים ושליחה ידנית.
//
// ⚠️ "שלח לבדיקה" נפרד מ"שלח לכולם": בדיקת הנוסח לא צריכה להטריד את כל
// הנמענים, ובלי הפרדה מנהל שרוצה לראות איך זה נראה שולח לכולם.
// ─────────────────────────────────────────────────────────────────────────────

export default function DailyDigestSettings() {
  const [enabled, setEnabled] = useState(false)
  const [emails, setEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState<'test' | 'all' | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/daily-digest', { cache: 'no-store' })
      if (r.ok) {
        const d = await r.json()
        setEnabled(d.enabled === true)
        setEmails(Array.isArray(d.emails) ? d.emails : [])
      }
    } catch { /* נשאר בברירת המחדל */ }
    setLoading(false)
  }, [])
  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase()
    if (!e) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErr('כתובת מייל לא תקינה'); return }
    if (emails.includes(e)) { setErr('כתובת זו כבר ברשימה'); return }
    setEmails([...emails, e]); setNewEmail(''); setErr('')
  }

  const save = async () => {
    setSaving(true); setErr(''); setMsg('')
    try {
      const r = await fetch('/api/admin/daily-digest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, emails }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'השמירה נכשלה'); return }
      setMsg('ההגדרות נשמרו')
      setTimeout(() => setMsg(''), 3000)
    } catch { setErr('השמירה נכשלה') } finally { setSaving(false) }
  }

  const send = async (mode: 'test' | 'all') => {
    setSending(mode); setErr(''); setMsg('')
    try {
      const body = mode === 'test' ? { to: testEmail.trim().toLowerCase() } : {}
      if (mode === 'test' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.to ?? ''))) {
        setErr('יש להזין כתובת תקינה לבדיקה'); return
      }
      const r = await fetch('/api/admin/daily-digest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'השליחה נכשלה'); return }
      setMsg(mode === 'test' ? 'נשלח לבדיקה' : `הסיכום נשלח ל-${d.sent} נמענים`)
      setTimeout(() => setMsg(''), 4000)
    } catch { setErr('השליחה נכשלה') } finally { setSending(null) }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-slate-400 py-6">
      <Loader2 size={15} className="animate-spin" /> טוען…
    </div>
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── הפעלה ── */}
      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <CalendarClock size={17} />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">סיכום יומי אוטומטי</p>
            <p className="text-xs text-slate-500 mt-0.5">
              נשלח בכל לילה בחצות · פעילות היום וכל מה שממתין לאישור
            </p>
            {/* ⚠️ נאמר במפורש: זו התנהגות שהמשתמש ביקש ולא מובנת מאליה מהמסך. */}
            <p className="text-[11px] text-amber-700 mt-1">
              לא נשלח בשבתות ובחגים
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setEnabled(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
          aria-pressed={enabled} aria-label="הפעלת הסיכום היומי">
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'right-0.5' : 'right-[22px]'}`} />
        </button>
      </div>

      {/* ── נמענים ── */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold text-slate-500">מי מקבל את הסיכום</p>
        <div className="flex gap-2">
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
            placeholder="הוספת כתובת מייל…" dir="ltr"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-right outline-none focus:border-indigo-400" />
          <button type="button" onClick={addEmail}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition">
            <Plus size={13} /> הוספה
          </button>
        </div>

        {emails.length === 0 ? (
          // ⚠️ ריק = לא יישלח כלום. נאמר, ולא מוצג כמצב תקין.
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            לא הוגדרו נמענים — הסיכום לא יישלח.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {emails.map(e => (
              <span key={e} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                <Mail size={11} className="text-slate-400" />
                <span dir="ltr">{e}</span>
                <button type="button" onClick={() => setEmails(emails.filter(x => x !== e))}
                  className="text-slate-400 hover:text-rose-600 transition" aria-label={`הסרת ${e}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── שליחה ידנית ── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5 flex flex-col gap-3">
        <p className="text-xs font-bold text-slate-500">שליחה ידנית</p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={testEmail} onChange={e => setTestEmail(e.target.value)}
            placeholder="כתובת לבדיקה…" dir="ltr"
            className="flex-1 min-w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm text-right outline-none focus:border-indigo-400" />
          <button type="button" onClick={() => void send('test')} disabled={sending !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition disabled:opacity-50">
            {sending === 'test' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            שליחה לבדיקה
          </button>
          <button type="button" onClick={() => void send('all')} disabled={sending !== null || emails.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition disabled:opacity-50">
            {sending === 'all' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            שליחה לכל הנמענים
          </button>
        </div>
      </div>

      {/* ── שמירה ── */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-900 transition disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          שמירת ההגדרות
        </button>
        {msg && <span className="text-xs font-bold text-emerald-700">{msg}</span>}
        {err && <span className="text-xs font-bold text-rose-600">{err}</span>}
      </div>
    </div>
  )
}
