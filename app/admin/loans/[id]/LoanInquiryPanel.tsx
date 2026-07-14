'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Loader2, MessageSquare, AlertCircle, Mail } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// שרשור הבירור עם מבקש ההלוואה.
// מה שנכתב כאן נשלח לו במייל; תשובתו במייל נכנסת לכאן, והבקשה חוזרת
// אוטומטית לרשימת ההמתנה לאישור.
// ─────────────────────────────────────────────────────────────────────────────

interface Msg {
  id: string
  direction: 'staff' | 'applicant'
  body: string
  sender_name?: string | null
  created_at: string
}

const fmt = (d: string) =>
  new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function LoanInquiryPanel({ loanId, hasEmail, applicantName, onSent }: {
  loanId: string
  hasEmail: boolean
  /** שם המבקש — מוצג על ההודעות שהוא שלח, במקום "המבקש" הגנרי. */
  applicantName?: string
  onSent?: () => void
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/loans/${loanId}/messages`)
      const d = await res.json()
      if (res.ok) setMsgs(d.messages ?? [])
    } catch { /* טעינה בלבד */ }
    finally { setLoading(false) }
  }, [loanId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // רענון חי — תשובה שנקלטת במייל מופיעה כאן תוך שניות, בלי לרענן את הדף.
  // גם מיד עם חזרה ללשונית, כדי שלא יהיה עיכוב עד לטיק הבא.
  useEffect(() => {
    const t = setInterval(() => { void load() }, 10_000)
    const onFocus = () => { void load() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return

    setSending(true); setErr('')
    try {
      const res = await fetch(`/api/admin/loans/${loanId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: body }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'השליחה נכשלה'); return }

      setText('')
      await load()
      onSent?.()          // רענון הסטטוס בדף (עבר ל"בתהליך בירור")
    } catch {
      setErr('שגיאת תקשורת')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[600px]">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <MessageSquare size={16} className="text-sky-600" />
        <h3 className="font-semibold text-slate-900 text-sm">בירור מול המבקש</h3>
        {msgs.length > 0 && (
          <span className="text-xs text-slate-400 mr-auto">{msgs.length} הודעות</span>
        )}
      </div>

      {/* השרשור */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-slate-50/50">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4">
            <Mail size={26} className="text-slate-300" />
            <p className="text-sm text-slate-500 leading-relaxed">
              טרם נשלחה הודעת בירור.
              <br />
              מה שתכתבו כאן יישלח למבקש במייל, והבקשה תעבור ל״בתהליך בירור״.
            </p>
          </div>
        ) : (
          msgs.map(m => {
            const isStaff = m.direction === 'staff'
            // מי כתב: הנציג בשמו · המבקש בשמו. לא כתובת מייל — היא לא מוסיפה
            // מידע כאן וגרמה לשורה להתבלגן.
            const who = isStaff
              ? (m.sender_name || 'צוות הגמ״ח')
              : (applicantName || 'המבקש')

            return (
              <div
                key={m.id}
                className={`flex flex-col max-w-[85%] ${isStaff ? 'self-end items-end' : 'self-start items-start'}`}
              >
                {/* מי כתב — מחוץ לבועה, כדי שהבועה תישאר נקייה */}
                <span className={`text-[11px] font-semibold mb-1 px-1 ${isStaff ? 'text-sky-700' : 'text-slate-600'}`}>
                  {who}
                </span>

                <div
                  className={`rounded-2xl px-3.5 py-2.5 ${
                    isStaff
                      ? 'bg-sky-500 text-white rounded-bl-md'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-br-md'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                </div>

                <span className="text-[10px] text-slate-400 mt-1 px-1">{fmt(m.created_at)}</span>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      {/* כתיבה */}
      {!hasEmail ? (
        <div className="p-3 border-t border-slate-200 bg-amber-50 flex items-center gap-2 text-xs text-amber-800">
          <AlertCircle size={14} className="shrink-0" />
          למבקש אין כתובת מייל רשומה — לא ניתן לשלוח בירור.
        </div>
      ) : (
        <div className="border-t border-slate-200 p-3 bg-white flex flex-col gap-2">
          {err && (
            <p className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
              <AlertCircle size={12} /> {err}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                // Enter שולח; Shift+Enter יורד שורה
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
              }}
              placeholder="כתבו מה חסר או מה נדרש להשלים…"
              rows={2}
              disabled={sending}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400 focus:bg-white transition-all disabled:opacity-60"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !text.trim()}
              title="שליחה (Enter)"
              className="w-10 h-10 shrink-0 rounded-xl bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            ההודעה תישלח למייל של המבקש. תשובתו תיכנס לכאן, והבקשה תחזור לרשימת ההמתנה לאישור.
          </p>
        </div>
      )}
    </div>
  )
}
