'use client'
import { useState } from 'react'
import { X, Send, Loader2, CheckCircle2, Mail } from 'lucide-react'

// חלונית שליחת מייל מהירה מתוך המערכת — נשלחת דרך חשבון המייל של המשרד (Gmail).
// משמשת בלחיצה על כתובת מייל בטבלאות (למשל כרטסת נתמכים).
export default function QuickEmailModal({
  to,
  toName,
  onClose,
}: {
  to: string
  toName?: string
  onClose: () => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const send = async () => {
    if (!to || !subject.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/admin/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject: subject.trim(), body: body.replace(/\n/g, '<br/>') }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'שגיאה בשליחה')
      setSent(true)
      setTimeout(onClose, 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשליחת המייל')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col items-center gap-4 px-8 py-10">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">המייל נשלח בהצלחה</h3>
          <p className="text-sm text-slate-500">אל: {toName || to}</p>
          <p className="text-xs text-slate-400">חלון זה ייסגר אוטומטית</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Mail size={17} className="text-indigo-600" /> שליחת מייל</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        {/* Recipient (locked) */}
        <div className="border-b border-slate-100 px-5 py-3 flex flex-col gap-2">
          <span className="text-xs font-medium text-slate-500">אל:</span>
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
              {(toName || to).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              {toName && <p className="text-sm font-medium text-slate-800">{toName}</p>}
              <p className="text-xs text-slate-500" dir="ltr">{to}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
          <span className="text-xs text-slate-400 w-10 flex-shrink-0">נושא:</span>
          <input className="flex-1 text-sm outline-none" value={subject} onChange={e => setSubject(e.target.value)} placeholder="נושא המייל..." autoFocus />
        </div>

        <textarea
          className="flex-1 px-5 py-4 text-sm text-slate-800 outline-none resize-none min-h-[200px]"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="כתוב את ההודעה כאן..."
        />

        {error && <p className="px-5 pb-2 text-xs text-red-500">{error}</p>}

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">ביטול</button>
          <button
            onClick={send}
            disabled={sending || !to || !subject.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            שלח
          </button>
        </div>
      </div>
    </div>
  )
}
