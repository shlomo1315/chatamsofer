'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Send, Loader2, PenSquare, Reply, CheckCircle2, X, ExternalLink } from 'lucide-react'
import { ParsedMessage } from '@/lib/gmail'

interface Props { email: string; name: string; beneficiaryId: string }

function formatDate(raw: string) {
  try {
    const d = new Date(raw)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch { return raw }
}

function ComposePane({ toEmail, toName, replyTo, onSent, onCancel }: {
  toEmail: string; toName: string; replyTo?: ParsedMessage; onSent: () => void; onCancel: () => void
}) {
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentInfo, setSentInfo] = useState<{ body: string } | null>(null)

  const send = async () => {
    if (!subject) return
    setSending(true)
    await fetch('/api/admin/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toEmail, subject, body: body.replace(/\n/g, '<br/>'), threadId: replyTo?.threadId }),
    })
    setSending(false)
    setSentInfo({ body })
    setTimeout(() => { onSent() }, 2000)
  }

  if (sentInfo) {
    return (
      <div className="border border-slate-200 rounded-xl bg-green-50 p-6 flex flex-col items-center gap-3 text-center">
        <CheckCircle2 size={28} className="text-green-600" />
        <p className="font-semibold text-slate-800">המייל נשלח בהצלחה ל-{toName}</p>
        {sentInfo.body && <p className="text-sm text-slate-500 line-clamp-3 whitespace-pre-wrap">{sentInfo.body}</p>}
      </div>
    )
  }

  return (
    <div className="border border-indigo-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-indigo-50">
        <span className="text-sm font-medium text-indigo-700">{replyTo ? `השב ל: ${replyTo.subject}` : `מייל חדש → ${toName}`}</span>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
      </div>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
        <span className="text-xs text-slate-400 w-10">נושא:</span>
        <input className="flex-1 text-sm outline-none" value={subject} onChange={e => setSubject(e.target.value)} placeholder="נושא המייל..." />
      </div>
      <textarea
        className="w-full px-4 py-3 text-sm outline-none resize-none min-h-[120px]"
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="כתוב את ההודעה כאן..."
        autoFocus
      />
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800">ביטול</button>
        <button
          onClick={send}
          disabled={sending || !subject}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          שלח
        </button>
      </div>
    </div>
  )
}

export default function BeneficiaryMailThread({ email, name, beneficiaryId }: Props) {
  const router = useRouter()
  const [messages, setMessages] = useState<ParsedMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [selected, setSelected] = useState<ParsedMessage | null>(null)
  const [composing, setComposing] = useState(false)
  const [replyTo, setReplyTo] = useState<ParsedMessage | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/gmail/messages?folder=INBOX&q=${encodeURIComponent(`from:${email} OR to:${email}`)}`)
    const data = await res.json()
    if (data.notConnected) { setNotConnected(true); setLoading(false); return }
    setMessages(data.messages ?? [])
    setLoading(false)
  }, [email])

  useEffect(() => { load() }, [load])

  const openMessage = async (msg: ParsedMessage) => {
    setSelected(prev => prev?.id === msg.id ? null : msg)
    if (!msg.isRead) {
      await fetch('/api/admin/gmail/mark-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msg.id }) })
      setMessages(ms => ms.map(m => m.id === msg.id ? { ...m, isRead: true } : m))
    }
  }

  const startReply = (msg: ParsedMessage) => {
    setReplyTo(msg)
    setComposing(true)
    // scroll compose into view
    setTimeout(() => document.getElementById('compose-pane')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  if (notConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Mail size={36} className="text-slate-300" />
        <p className="text-sm text-slate-500">Gmail לא מחובר</p>
        <a href="/api/auth/gmail" className="text-sm text-indigo-600 hover:underline">חבר Gmail</a>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">כל ההתכתבות עם <span className="font-medium text-slate-700">{email}</span></p>
        <button
          onClick={() => { setReplyTo(undefined); setComposing(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <PenSquare size={14} />
          מייל חדש
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> טוען מיילים...
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
          <Mail size={28} />
          <p className="text-sm">אין התכתבות עם נתמך זה</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map(msg => (
            <div key={msg.id} className={`border rounded-xl overflow-hidden transition-colors ${selected?.id === msg.id ? 'border-indigo-300 shadow-sm' : 'border-slate-200'}`}>
              {/* Message header row */}
              <button
                className="w-full text-right px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                onClick={() => openMessage(msg)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${msg.fromEmail === email ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {msg.fromEmail === email ? name.charAt(0) : 'מ'}
                  </div>
                  <div className="min-w-0 flex-1 text-right">
                    <p className={`text-sm truncate ${!msg.isRead ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{msg.subject}</p>
                    <p className="text-xs text-slate-400 truncate">{msg.snippet}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-slate-400">{formatDate(msg.date)}</span>
                  {!msg.isRead && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
                </div>
              </button>

              {/* Expanded message body */}
              {selected?.id === msg.id && (
                <div className="border-t border-slate-100">
                  <div
                    className="px-4 py-4 text-sm text-slate-800 leading-relaxed overflow-auto max-h-96"
                    dangerouslySetInnerHTML={{ __html: msg.body || `<p>${msg.snippet}</p>` }}
                  />
                  <div className="px-4 pb-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <button
                      onClick={() => router.push(`/admin/mail`)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      <ExternalLink size={12} /> פתח בממשק המייל
                    </button>
                    <button
                      onClick={() => startReply(msg)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      <Reply size={13} /> השב
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Compose pane — shown below messages */}
      {composing && (
        <div id="compose-pane">
          <ComposePane
            toEmail={email}
            toName={name}
            replyTo={replyTo}
            onSent={() => { setComposing(false); setReplyTo(undefined); load() }}
            onCancel={() => { setComposing(false); setReplyTo(undefined) }}
          />
        </div>
      )}
    </div>
  )
}
