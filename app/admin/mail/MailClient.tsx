'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Inbox, Send, RefreshCw, PenSquare, Mail, Search, X,
  ChevronLeft, Loader2, Reply, User, Phone, MapPin,
  CheckCircle2, Clock, ExternalLink,
} from 'lucide-react'
import { ParsedMessage } from '@/lib/gmail'
import { Beneficiary, ELIGIBILITY_LABELS } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BeneficiarySuggestion { id: string; name: string; email: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FOLDER_ITEMS = [
  { key: 'INBOX', label: 'דואר נכנס', icon: Inbox },
  { key: 'SENT',  label: 'דואר יוצא', icon: Send },
]

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  pending:  'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  docs_pending: 'bg-blue-100 text-blue-700',
}

function formatDate(raw: string) {
  try {
    const d = new Date(raw)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
  } catch { return raw }
}

// ─── Compose Modal ────────────────────────────────────────────────────────────

function ComposeModal({ onClose, replyTo }: { onClose: () => void; replyTo?: ParsedMessage }) {
  const [to, setTo] = useState(replyTo ? replyTo.fromEmail : '')
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [suggestions, setSuggestions] = useState<BeneficiarySuggestion[]>([])
  const [showSug, setShowSug] = useState(false)

  const searchBeneficiary = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return }
    const res = await fetch(`/api/admin/beneficiary-search?q=${encodeURIComponent(q)}&limit=6`)
    const data = await res.json()
    setSuggestions(data.results ?? [])
  }, [])

  const send = async () => {
    if (!to || !subject) return
    setSending(true)
    await fetch('/api/admin/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject,
        body: body.replace(/\n/g, '<br/>'),
        threadId: replyTo?.threadId,
      }),
    })
    setSending(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">{replyTo ? 'השב למייל' : 'מייל חדש'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-0 flex-1 overflow-hidden">
          {/* To field */}
          <div className="relative border-b border-slate-100">
            <div className="flex items-center gap-2 px-5 py-3">
              <span className="text-xs text-slate-400 w-10 flex-shrink-0">אל:</span>
              <input
                className="flex-1 text-sm outline-none"
                value={to}
                onChange={e => { setTo(e.target.value); searchBeneficiary(e.target.value); setShowSug(true) }}
                onFocus={() => setShowSug(true)}
                placeholder="שם נתמך או כתובת מייל..."
                autoComplete="off"
              />
            </div>
            {showSug && suggestions.length > 0 && (
              <div className="absolute z-10 top-full right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                {suggestions.map(s => (
                  <button key={s.id} type="button"
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-right hover:bg-indigo-50 transition-colors"
                    onMouseDown={e => { e.preventDefault(); setTo(s.email); setSuggestions([]); setShowSug(false) }}
                  >
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                      {s.name.charAt(0)}
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                      <p className="text-xs text-slate-400 truncate">{s.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Subject */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <span className="text-xs text-slate-400 w-10 flex-shrink-0">נושא:</span>
            <input className="flex-1 text-sm outline-none" value={subject} onChange={e => setSubject(e.target.value)} placeholder="נושא המייל..." />
          </div>

          {/* Body */}
          <textarea
            className="flex-1 px-5 py-4 text-sm text-slate-800 outline-none resize-none min-h-[200px]"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="כתוב את ההודעה כאן..."
          />
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">ביטול</button>
          <button
            onClick={send}
            disabled={sending || !to || !subject}
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

// ─── Beneficiary Card ─────────────────────────────────────────────────────────

function BeneficiaryCard({ email }: { email: string }) {
  const [ben, setBen] = useState<Beneficiary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!email) return
    setLoading(true)
    fetch(`/api/admin/beneficiary-search?email=${encodeURIComponent(email)}&exact=1`)
      .then(r => r.json())
      .then(d => setBen(d.results?.[0] ?? null))
      .finally(() => setLoading(false))
  }, [email])

  if (loading) return <div className="p-4 flex items-center gap-2 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" />מחפש נתמך...</div>
  if (!ben) return null

  const name = [ben.family_name, ben.full_name].filter(Boolean).join(' ')
  const statusColor = STATUS_COLORS[ben.eligibility_status] ?? 'bg-slate-100 text-slate-600'

  return (
    <div className="border-t border-slate-100 bg-slate-50 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">נתמך מזוהה</span>
        <Link href={`/admin/beneficiaries/${ben.id}`} target="_blank"
          className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
          פתח כרטיס <ExternalLink size={11} />
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 flex-shrink-0">
          {name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">{name}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
            {ELIGIBILITY_LABELS[ben.eligibility_status]}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
        {ben.phone && <span className="flex items-center gap-1"><Phone size={11} className="text-slate-400" />{ben.phone}</span>}
        {ben.city  && <span className="flex items-center gap-1"><MapPin size={11} className="text-slate-400" />{ben.city}</span>}
        {ben.children_count > 0 && <span className="flex items-center gap-1"><User size={11} className="text-slate-400" />{ben.children_count} ילדים</span>}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MailClient() {
  const [folder, setFolder] = useState('INBOX')
  const [messages, setMessages] = useState<ParsedMessage[]>([])
  const [selected, setSelected] = useState<ParsedMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [compose, setCompose] = useState(false)
  const [replyMsg, setReplyMsg] = useState<ParsedMessage | undefined>()
  const [search, setSearch] = useState('')

  const load = useCallback(async (f: string, q?: string) => {
    setLoading(true)
    setSelected(null)
    const res = await fetch(`/api/admin/gmail/messages?folder=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
    const data = await res.json()
    if (data.notConnected) { setNotConnected(true); setLoading(false); return }
    setMessages(data.messages ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load(folder) }, [folder, load])

  const openMessage = async (msg: ParsedMessage) => {
    setSelected(msg)
    if (!msg.isRead) {
      await fetch('/api/admin/gmail/mark-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msg.id }) })
      setMessages(ms => ms.map(m => m.id === msg.id ? { ...m, isRead: true } : m))
    }
  }

  if (notConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Mail size={48} className="text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-700">Gmail לא מחובר</h2>
        <p className="text-sm text-slate-500">יש לאשר גישה לחשבון הגוגל כדי להשתמש בממשק המייל</p>
        <a href="/api/auth/gmail" className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
          חבר Gmail
        </a>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

      {/* Sidebar */}
      <div className="w-48 flex-shrink-0 bg-slate-50 border-l border-slate-200 flex flex-col">
        <div className="p-3">
          <button
            onClick={() => { setCompose(true); setReplyMsg(undefined) }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <PenSquare size={15} />
            מייל חדש
          </button>
        </div>
        <nav className="flex-1 px-2 pb-2">
          {FOLDER_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setFolder(key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-right ${folder === key ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Icon size={16} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Message List */}
      <div className={`flex flex-col border-l border-slate-200 ${selected ? 'w-72 flex-shrink-0' : 'flex-1'}`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input
              className="flex-1 text-sm bg-transparent outline-none"
              placeholder="חפש מיילים..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load(folder, search)}
            />
          </div>
          <button onClick={() => load(folder, search)} className="p-1.5 text-slate-400 hover:text-slate-700">
            <RefreshCw size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> טוען מיילים...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-400">
              <Mail size={24} />
              <span className="text-sm">אין הודעות</span>
            </div>
          ) : (
            messages.map(msg => (
              <button
                key={msg.id}
                onClick={() => openMessage(msg)}
                className={`w-full text-right px-4 py-3 border-b border-slate-100 transition-colors hover:bg-slate-50 ${selected?.id === msg.id ? 'bg-indigo-50 border-r-2 border-r-indigo-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className={`text-sm truncate ${!msg.isRead ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                    {folder === 'SENT' ? msg.to : msg.from.replace(/<.*>/, '').trim() || msg.fromEmail}
                  </span>
                  <span className="text-[11px] text-slate-400 flex-shrink-0">{formatDate(msg.date)}</span>
                </div>
                <p className={`text-xs truncate mb-0.5 ${!msg.isRead ? 'font-medium text-slate-700' : 'text-slate-500'}`}>{msg.subject}</p>
                <p className="text-xs text-slate-400 truncate">{msg.snippet}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message View */}
      {selected && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900 text-base truncate">{selected.subject}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{selected.from} · {formatDate(selected.date)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setReplyMsg(selected); setCompose(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Reply size={14} /> השב
              </button>
              <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <ChevronLeft size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-5 text-sm text-slate-800 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: selected.body || selected.snippet }} />
            {folder === 'INBOX' && <BeneficiaryCard email={selected.fromEmail} />}
          </div>
        </div>
      )}

      {!selected && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
          <Mail size={40} className="text-slate-300" />
          <p className="text-sm">בחר מייל לצפייה</p>
        </div>
      )}

      {compose && <ComposeModal onClose={() => setCompose(false)} replyTo={replyMsg} />}
    </div>
  )
}
