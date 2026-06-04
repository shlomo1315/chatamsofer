'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Mail, Inbox, Send, FileText, Plus, Search, RefreshCw,
  Reply, Forward, Trash2, Paperclip, Clock, AlertTriangle, ChevronRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { MailMessage, MailFolder, MAIL_FOLDER_LABELS } from '@/types'
import Button from '@/components/ui/Button'
import ComposeModal, { ComposeInit } from './ComposeModal'

function fmtShort(d?: string): string {
  if (!d) return ''
  try { return format(new Date(d), 'd/MM HH:mm') } catch { return '' }
}
function fmtFull(d?: string): string {
  if (!d) return ''
  try { return format(new Date(d), 'EEEE, d בMMMM yyyy, HH:mm', { locale: he }) } catch { return '' }
}

const FOLDER_ICON: Record<MailFolder, typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
}

export default function MailboxClient({
  initialMessages,
  configured = true,
}: {
  initialMessages: MailMessage[]
  configured?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState<MailMessage[]>(initialMessages)
  const [folder, setFolder] = useState<MailFolder>('inbox')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [compose, setCompose] = useState<ComposeInit | null>(null)

  // קבלת מייל נכנס בזמן אמת
  useEffect(() => {
    if (!configured) return
    const channel = supabase
      .channel('mail_messages_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mail_messages' },
        (payload) => {
          const m = payload.new as MailMessage
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, configured])

  const refresh = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    const { data } = await supabase
      .from('mail_messages')
      .select('*, attachments:mail_attachments(*)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (data) setMessages(data as MailMessage[])
    setLoading(false)
  }, [supabase, configured])

  const markRead = useCallback(async (id: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, is_read: true } : m)))
    await supabase.from('mail_messages').update({ is_read: true }).eq('id', id)
  }, [supabase])

  const removeMessage = useCallback(async (id: string) => {
    if (!window.confirm('למחוק את ההודעה לצמיתות?')) return
    setMessages((prev) => prev.filter((m) => m.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
    await supabase.from('mail_messages').delete().eq('id', id)
  }, [supabase])

  const openMessage = useCallback((m: MailMessage) => {
    setSelectedId(m.id)
    if (m.direction === 'inbound' && !m.is_read) markRead(m.id)
  }, [markRead])

  const counts = useMemo(() => ({
    inbox: messages.filter((m) => m.direction === 'inbound').length,
    sent: messages.filter((m) => m.direction === 'outbound' && m.status !== 'draft').length,
    drafts: messages.filter((m) => m.status === 'draft').length,
  }), [messages])

  const unread = useMemo(
    () => messages.filter((m) => m.direction === 'inbound' && !m.is_read).length,
    [messages]
  )

  const folderMessages = useMemo(() => {
    let list: MailMessage[]
    if (folder === 'inbox') list = messages.filter((m) => m.direction === 'inbound')
    else if (folder === 'sent') list = messages.filter((m) => m.direction === 'outbound' && m.status !== 'draft')
    else list = messages.filter((m) => m.status === 'draft')

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((m) =>
        (m.subject ?? '').toLowerCase().includes(q) ||
        (m.from_email ?? '').toLowerCase().includes(q) ||
        (m.from_name ?? '').toLowerCase().includes(q) ||
        (m.body_text ?? '').toLowerCase().includes(q) ||
        (m.to_emails ?? []).join(' ').toLowerCase().includes(q)
      )
    }
    return list
  }, [messages, folder, search])

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId]
  )

  const replyTo = (m: MailMessage) => {
    setCompose({
      to: m.from_email,
      subject: m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject ?? ''}`,
      in_reply_to: m.provider_id ?? undefined,
      thread_id: m.thread_id ?? undefined,
      body: `\n\n--- בתאריך ${fmtFull(m.created_at)}, ${m.from_name ?? m.from_email} כתב/ה: ---\n${m.body_text ?? ''}`,
    })
  }
  const forward = (m: MailMessage) => {
    setCompose({
      subject: m.subject?.startsWith('Fwd:') ? m.subject : `Fwd: ${m.subject ?? ''}`,
      body: `\n\n--- הודעה שהועברה ---\nמאת: ${m.from_name ?? m.from_email}\nאל: ${(m.to_emails ?? []).join(', ')}\nנושא: ${m.subject ?? ''}\n\n${m.body_text ?? ''}`,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Mail size={22} className="text-indigo-600" />
            תיבת דואר
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ניהול תקשורת המייל של העמותה {unread > 0 && <span className="text-indigo-600 font-medium">· {unread} לא נקראו</span>}
          </p>
        </div>
        <Button onClick={() => setCompose({})}>
          <Plus size={16} />
          כתוב הודעה
        </Button>
      </div>

      {!configured && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-800">חיבור Supabase נדרש לשימוש בתיבת הדואר.</p>
        </div>
      )}

      {/* תיקיות + חיפוש */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1">
          {(Object.keys(MAIL_FOLDER_LABELS) as MailFolder[]).map((key) => {
            const Icon = FOLDER_ICON[key]
            const active = folder === key
            const showUnread = key === 'inbox' && unread > 0
            return (
              <button
                key={key}
                onClick={() => { setFolder(key); setSelectedId(null) }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={15} />
                {MAIL_FOLDER_LABELS[key]}
                <span className={`text-xs rounded-full px-1.5 py-0.5 ltr-num ${
                  active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'
                }`}>
                  {counts[key]}
                </span>
                {showUnread && !active && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                )}
              </button>
            )
          })}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש בהודעות…"
            className="w-full rounded-lg border border-slate-300 pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={refresh}
          disabled={loading}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          title="רענון"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* שתי חלוניות: רשימה + קריאה */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] bg-white border border-slate-200 rounded-xl overflow-hidden h-[70vh] min-h-[520px]">
        {/* רשימת ההודעות */}
        <div className="border-b lg:border-b-0 lg:border-l border-slate-200 overflow-y-auto">
          {folderMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <Mail size={36} className="text-slate-300 mb-3" />
              <p className="text-slate-400 text-sm">
                {folder === 'inbox' && 'אין הודעות בדואר הנכנס'}
                {folder === 'sent' && 'לא נשלחו הודעות'}
                {folder === 'drafts' && 'אין טיוטות'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {folderMessages.map((m) => {
                const isSel = m.id === selectedId
                const unreadItem = m.direction === 'inbound' && !m.is_read
                const who = folder === 'inbox'
                  ? (m.from_name || m.from_email)
                  : ((m.to_emails ?? [])[0] ?? '—')
                return (
                  <button
                    key={m.id}
                    onClick={() => openMessage(m)}
                    className={`w-full text-right px-4 py-3 transition-colors ${
                      isSel ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${unreadItem ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                        {who}
                      </p>
                      <span className="text-xs text-slate-400 flex-shrink-0 ltr-num">{fmtShort(m.created_at)}</span>
                    </div>
                    <p className={`text-sm truncate mt-0.5 ${unreadItem ? 'text-slate-800 font-medium' : 'text-slate-600'}`}>
                      {m.subject || '(ללא נושא)'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {unreadItem && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />}
                      {m.has_attachments && <Paperclip size={12} className="text-slate-400 flex-shrink-0" />}
                      <p className="text-xs text-slate-400 truncate">{(m.body_text ?? '').slice(0, 80)}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* חלונית קריאה */}
        <div className="overflow-y-auto flex flex-col">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <ChevronRight size={36} className="text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">בחר הודעה כדי לקרוא אותה</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-900">{selected.subject || '(ללא נושא)'}</h2>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {selected.direction === 'inbound' && (
                      <button onClick={() => replyTo(selected)} title="השב"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                        <Reply size={16} />
                      </button>
                    )}
                    <button onClick={() => forward(selected)} title="העבר"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                      <Forward size={16} />
                    </button>
                    <button onClick={() => removeMessage(selected.id)} title="מחק"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-600 space-y-0.5">
                  <p>
                    <span className="text-slate-400">מאת: </span>
                    <span className="font-medium ltr-num">{selected.from_name ? `${selected.from_name} <${selected.from_email}>` : selected.from_email}</span>
                  </p>
                  <p>
                    <span className="text-slate-400">אל: </span>
                    <span className="ltr-num">{(selected.to_emails ?? []).join(', ')}</span>
                  </p>
                  {selected.cc_emails && selected.cc_emails.length > 0 && (
                    <p>
                      <span className="text-slate-400">עותק: </span>
                      <span className="ltr-num">{selected.cc_emails.join(', ')}</span>
                    </p>
                  )}
                  <p className="flex items-center gap-1 text-xs text-slate-400 pt-1">
                    <Clock size={12} /> {fmtFull(selected.created_at)}
                  </p>
                  {selected.status === 'failed' && (
                    <p className="text-xs text-red-600 pt-1">⚠ השליחה נכשלה{selected.error ? `: ${selected.error}` : ''}</p>
                  )}
                </div>
              </div>

              <div className="flex-1 px-5 py-4">
                {selected.body_html ? (
                  <iframe
                    // sandbox ריק = ללא הרצת סקריפטים — הגנה מפני XSS בתוכן מייל לא מהימן
                    sandbox=""
                    srcDoc={selected.body_html}
                    title="תוכן ההודעה"
                    className="w-full h-full min-h-[280px] border-0 bg-white"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-800">
                    {selected.body_text || '(ההודעה ריקה)'}
                  </pre>
                )}
              </div>

              {selected.attachments && selected.attachments.length > 0 && (
                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
                  <p className="text-xs font-medium text-slate-500 mb-2">קבצים מצורפים</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 hover:border-indigo-300 transition-colors"
                      >
                        <Paperclip size={12} className="text-slate-400" />
                        {a.file_name || 'קובץ'}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {compose && (
        <ComposeModal
          init={compose}
          onClose={() => setCompose(null)}
          onSent={() => { setCompose(null); setFolder('sent'); refresh() }}
        />
      )}
    </div>
  )
}
