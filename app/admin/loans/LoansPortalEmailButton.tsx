'use client'
import { useState } from 'react'
import { Mail, Loader2, Check, Eye, EyeOff, Send } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

// שליחת פרטי הכניסה לפורטל ביצוע ההלוואות במייל — קובע סיסמה ושולח מייל מעוצב.
export default function LoansPortalEmailButton() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async () => {
    setErr('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('כתובת מייל לא תקינה'); return }
    if (password.length < 8) { setErr('הסיסמה חייבת להכיל לפחות 8 תווים'); return }
    setSending(true)
    try {
      const res = await fetch('/api/admin/loans/send-portal-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setErr(data.error || 'השליחה נכשלה'); setSending(false); return }
      setSent(true)
      setTimeout(() => { setOpen(false); setSent(false); setEmail(''); setPassword('') }, 1600)
    } catch {
      setErr('שגיאת רשת — נסו שוב')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); setErr(''); setSent(false) }}>
        <Mail size={16} /> שליחה למייל
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="שליחת פורטל ביצוע ההלוואות במייל" size="md">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            הזינו את כתובת המייל של הגורם המבצע ואת הסיסמה שתוגדר לפורטל. יישלח מייל מעוצב עם קישור, סיסמה והסבר כניסה.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">כתובת מייל לשליחה</label>
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr('') }}
              placeholder="name@example.com" dir="ltr"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">סיסמה לפורטל (לפחות 8 תווים)</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setErr('') }}
                placeholder="הסיסמה שתוגדר" dir="ltr" autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">ביטול</button>
            <button onClick={submit} disabled={sending || sent}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg px-5 py-2 transition-colors">
              {sending ? <Loader2 size={15} className="animate-spin" /> : sent ? <Check size={15} /> : <Send size={15} />}
              {sent ? 'נשלח!' : 'שלח את הפורטל'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
