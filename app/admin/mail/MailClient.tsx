'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Inbox, Send, RefreshCw, PenSquare, Mail, Search, X,
  ChevronLeft, ChevronDown, Loader2, Reply, User, Phone, MapPin,
  CheckCircle2, ExternalLink, Forward, Tag, Plus, Trash2, Settings, BarChart2,
  Paperclip, Download, FolderOpen, FileText, Bold, Italic, Underline, List, ListOrdered, Smile, Palette,
} from 'lucide-react'

const EMOJIS = ['😊','🙏','👍','🙌','❤️','✨','🎉','✅','📌','📞','📧','📅','⏰','💡','🔔','⚠️','😇','🤝','💪','🌟','📝','📎','🏠','👶','💳','🕯️','✡️','🍀','😀','🙂','👏','🎊']

function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={onClick}
      className="p-1.5 rounded hover:bg-slate-100 text-slate-600 flex items-center">
      {children}
    </button>
  )
}
import { ParsedMessage, type Attachment } from '@/lib/gmail'
import { useDocTypes } from '@/lib/useDocTypes'
import { Beneficiary, ELIGIBILITY_LABELS, type Profile } from '@/types'
import EmailInput from '@/components/ui/EmailInput'
import NewMailToast, { type MailToast, playMailSound } from '@/components/ui/NewMailToast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BeneficiarySuggestion { id: string; name: string; email: string }
interface MailLabel { id: string; name: string; color: string }
interface InternalEmail { name: string; email: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FOLDER_ITEMS = [
  { key: 'INBOX', label: 'דואר נכנס', icon: Inbox },
  { key: 'SENT',  label: 'דואר יוצא', icon: Send },
]

const STATUS_COLORS: Record<string, string> = {
  approved:     'bg-green-100 text-green-700',
  pending:      'bg-amber-100 text-amber-700',
  rejected:     'bg-red-100 text-red-700',
  docs_pending: 'bg-blue-100 text-blue-700',
}

const LABEL_COLORS = [
  { hex: '#ef4444', name: 'אדום' },
  { hex: '#f97316', name: 'כתום' },
  { hex: '#eab308', name: 'צהוב' },
  { hex: '#22c55e', name: 'ירוק' },
  { hex: '#3b82f6', name: 'כחול' },
  { hex: '#8b5cf6', name: 'סגול' },
  { hex: '#ec4899', name: 'ורוד' },
  { hex: '#6b7280', name: 'אפור' },
]

function formatDate(raw: string) {
  try {
    const d = new Date(raw)
    const now = new Date()
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
    if (dayDiff === 0) return time                       // היום → רק שעה
    if (dayDiff === 1) return `אתמול ${time}`            // אתמול
    if (dayDiff < 7) {                                   // השבוע → יום בשבוע
      const day = d.toLocaleDateString('he-IL', { weekday: 'long' })
      return `${day} ${time}`
    }
    if (d.getFullYear() === now.getFullYear())           // השנה → יום/חודש + שעה
      return `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} ${time}`
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return raw }
}

// ─── Compose Modal ────────────────────────────────────────────────────────────

interface FoundBeneficiary { id: string; name: string; email: string; matchedAs?: 'husband' | 'wife' }

function ComposeModal({ onClose, replyTo, initialTo }: { onClose: () => void; replyTo?: ParsedMessage; initialTo?: string }) {
  const [query, setQuery]     = useState('')          // unified search (name / email / ID)
  const [searching, setSearching] = useState(false)

  const [to, setTo]           = useState(initialTo ?? (replyTo ? replyTo.fromEmail : ''))
  const [toName, setToName]   = useState('')
  const [locked, setLocked]   = useState(!!(initialTo ?? replyTo?.fromEmail))
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '')
  const [body, setBody]       = useState('')
  const [sending, setSending] = useState(false)
  const [sentInfo, setSentInfo] = useState<{ to: string; toName: string; body: string } | null>(null)

  // עורך עשיר + צרופות
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<{ filename: string; mimeType: string; contentB64: string }[]>([])
  const [tplPicked, setTplPicked] = useState<{ url: string; filename: string; mimeType: string }[]>([])
  const [templates, setTemplates] = useState<{ id: string; name: string; file_url: string; file_name: string; mime_type: string }[]>([])
  const [showTpl, setShowTpl] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  useEffect(() => { fetch('/api/admin/email-templates').then(r => r.json()).then(d => setTemplates(d.templates ?? [])).catch(() => {}) }, [])

  const syncBody = () => setBody(editorRef.current?.innerHTML ?? '')
  const exec = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); editorRef.current?.focus(); syncBody() }
  const insertEmoji = (e: string) => { editorRef.current?.focus(); document.execCommand('insertText', false, e); setShowEmoji(false); syncBody() }

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      if (f.size > 15 * 1024 * 1024) { alert(`הקובץ ${f.name} גדול מ-15MB`); continue }
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result).split(',')[1] ?? '')
        r.onerror = rej
        r.readAsDataURL(f)
      })
      setAttachments(prev => [...prev, { filename: f.name, mimeType: f.type || 'application/octet-stream', contentB64: b64 }])
    }
  }
  const [suggestions, setSuggestions] = useState<BeneficiarySuggestion[]>([])
  const [showSug, setShowSug] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  const canSend = !locked
    ? (isValidEmail(to) && !!subject)
    : (!!to && !!subject)

  // Unified search: detect digits-only → search by ID, else by name/email
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return }
    setSearching(true)
    const isId = /^\d+$/.test(q)
    const url = isId
      ? `/api/admin/beneficiary-search?id_number=${encodeURIComponent(q)}&limit=5`
      : `/api/admin/beneficiary-search?q=${encodeURIComponent(q)}&limit=6`
    const res = await fetch(url)
    const data = await res.json()
    setSuggestions(data.results ?? [])
    setSearching(false)
  }, [])

  const handleQueryChange = (v: string) => {
    setQuery(v)
    setTo(v)          // allow typing a raw email address too
    setShowSug(true)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearch(v), 250)
  }

  const selectBeneficiary = (name: string, email: string) => {
    setTo(email); setToName(name); setLocked(true)
    setSuggestions([]); setShowSug(false); setQuery('')
  }

  const clearRecipient = () => {
    setTo(''); setToName(''); setLocked(false); setQuery('')
  }

  const send = async () => {
    if (!to || !subject) return
    setSending(true)
    const html = editorRef.current?.innerHTML ?? body
    await fetch('/api/admin/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to, subject, body: html, threadId: replyTo?.threadId,
        attachments,
        templateUrls: tplPicked.map(t => ({ url: t.url, filename: t.filename, mimeType: t.mimeType })),
      }),
    })
    setSending(false)
    setSentInfo({ to, toName, body: (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() })
    setTimeout(onClose, 2000)
  }

  if (sentInfo) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col items-center gap-4 px-8 py-10">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">המייל נשלח בהצלחה</h3>
          <div className="w-full bg-slate-50 rounded-xl p-4 flex flex-col gap-2 text-sm text-right">
            <p className="text-slate-500 text-xs font-medium uppercase">אל:</p>
            <p className="font-medium text-slate-800">{sentInfo.toName || sentInfo.to}</p>
            <p className="text-xs text-slate-400">{sentInfo.toName ? sentInfo.to : ''}</p>
            {sentInfo.body && (
              <>
                <p className="text-slate-500 text-xs font-medium uppercase mt-2">תוכן:</p>
                <p className="text-slate-600 line-clamp-4 whitespace-pre-wrap">{sentInfo.body}</p>
              </>
            )}
          </div>
          <p className="text-xs text-slate-400">חלון זה ייסגר אוטומטית</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">{replyTo ? 'השב למייל' : 'מייל חדש'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-0 flex-1 overflow-hidden">

          {/* ── Recipient section ── */}
          <div className="border-b border-slate-100 px-5 py-3 flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-500">אל:</span>

            {locked && to ? (
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                  {(toName || to).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  {toName && <p className="text-sm font-medium text-slate-800">{toName}</p>}
                  <p className="text-xs text-slate-500">{to}</p>
                </div>
                <button onClick={clearRecipient} className="text-slate-400 hover:text-red-500 flex-shrink-0"><X size={14} /></button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-400">
                  {searching
                    ? <Loader2 size={14} className="animate-spin text-slate-400 flex-shrink-0" />
                    : <Search size={14} className="text-slate-400 flex-shrink-0" />}
                  <input
                    className="flex-1 text-sm outline-none"
                    value={query}
                    onChange={e => handleQueryChange(e.target.value)}
                    onFocus={() => query.length >= 2 && setShowSug(true)}
                    placeholder="שם, מייל או ת.ז. (בעל / אשה)..."
                    autoFocus
                    autoComplete="off"
                  />
                  {query && <button onClick={() => { setQuery(''); setTo(''); setSuggestions([]) }} className="text-slate-300 hover:text-slate-600"><X size={13} /></button>}
                </div>

                {showSug && suggestions.length > 0 && (
                  <div className="absolute z-10 top-full right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {suggestions.map(s => (
                      <button key={s.id} type="button"
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-right hover:bg-indigo-50"
                        onMouseDown={e => { e.preventDefault(); selectBeneficiary(s.name, s.email) }}
                      >
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                          {s.name.charAt(0)}
                        </div>
                        <div className="min-w-0 text-right flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                          <p className="text-xs text-slate-400 truncate">{s.email || 'אין מייל'}</p>
                        </div>
                        {!s.email && <span className="text-xs text-red-400 flex-shrink-0">אין מייל</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Show validation hint only when no suggestions */}
                {to && !isValidEmail(to) && suggestions.length === 0 && query.length > 3 && !searching && (
                  <p className="text-xs text-amber-600 px-1 pt-1">לא נמצא במערכת — ניתן להזין כתובת מייל ישירות</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <span className="text-xs text-slate-400 w-10 flex-shrink-0">נושא:</span>
            <input className="flex-1 text-sm outline-none" value={subject} onChange={e => setSubject(e.target.value)} placeholder="נושא המייל..." />
          </div>

          {/* סרגל עיצוב */}
          <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-slate-100 flex-wrap relative">
            <ToolBtn title="מודגש" onClick={() => exec('bold')}><Bold size={15} /></ToolBtn>
            <ToolBtn title="נטוי" onClick={() => exec('italic')}><Italic size={15} /></ToolBtn>
            <ToolBtn title="קו תחתי" onClick={() => exec('underline')}><Underline size={15} /></ToolBtn>
            <span className="w-px h-5 bg-slate-200 mx-1" />
            <ToolBtn title="רשימת תבליטים" onClick={() => exec('insertUnorderedList')}><List size={15} /></ToolBtn>
            <ToolBtn title="רשימה ממוספרת" onClick={() => exec('insertOrderedList')}><ListOrdered size={15} /></ToolBtn>
            <span className="w-px h-5 bg-slate-200 mx-1" />
            <label className="p-1.5 rounded hover:bg-slate-100 cursor-pointer text-slate-600 flex items-center" title="צבע טקסט">
              <Palette size={15} />
              <input type="color" className="w-0 h-0 opacity-0 absolute" onChange={e => exec('foreColor', e.target.value)} />
            </label>
            <ToolBtn title="אימוג'י" onClick={() => setShowEmoji(s => !s)}><Smile size={15} /></ToolBtn>
            <span className="w-px h-5 bg-slate-200 mx-1" />
            <ToolBtn title="צרף קובץ" onClick={() => fileInputRef.current?.click()}><Paperclip size={15} /></ToolBtn>
            <div className="relative">
              <ToolBtn title="צרף מהטמפלטים" onClick={() => setShowTpl(s => !s)}><FileText size={15} /></ToolBtn>
              {showTpl && (
                <div className="absolute z-20 top-full right-0 mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                  {templates.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">אין טמפלטים. ניתן להעלות בהגדרות.</p>
                  ) : templates.map(t => (
                    <button key={t.id} type="button" onMouseDown={e => { e.preventDefault(); setTplPicked(prev => prev.some(p => p.url === t.file_url) ? prev : [...prev, { url: t.file_url, filename: t.file_name, mimeType: t.mime_type }]); setShowTpl(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm hover:bg-indigo-50">
                      <FileText size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { onPickFiles(e.target.files); e.target.value = '' }} />

            {showEmoji && (
              <div className="absolute z-20 top-full right-2 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-2 grid grid-cols-8 gap-0.5 w-64">
                {EMOJIS.map(e => (
                  <button key={e} type="button" onMouseDown={ev => { ev.preventDefault(); insertEmoji(e) }} className="text-lg hover:bg-slate-100 rounded p-0.5">{e}</button>
                ))}
              </div>
            )}
          </div>

          {/* גוף ההודעה — עורך עשיר */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            dir="rtl"
            onInput={syncBody}
            data-placeholder="כתוב את ההודעה כאן..."
            className="mail-editor flex-1 px-5 py-4 text-sm text-slate-800 outline-none overflow-y-auto min-h-[180px]"
          />

          {/* צרופות שנבחרו */}
          {(attachments.length > 0 || tplPicked.length > 0) && (
            <div className="px-5 py-2 border-t border-slate-100 flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <span key={`a${i}`} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 rounded-lg px-2.5 py-1 text-xs">
                  <Paperclip size={12} /> <span className="truncate max-w-[140px]">{a.filename}</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500"><X size={12} /></button>
                </span>
              ))}
              {tplPicked.map((t, i) => (
                <span key={`t${i}`} className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 rounded-lg px-2.5 py-1 text-xs">
                  <FileText size={12} /> <span className="truncate max-w-[140px]">{t.filename}</span>
                  <button onClick={() => setTplPicked(prev => prev.filter((_, j) => j !== i))} className="text-indigo-400 hover:text-red-500"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">ביטול</button>
          <button
            onClick={send}
            disabled={sending || !canSend}
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

// ─── Forward Modal ─────────────────────────────────────────────────────────────

function ForwardModal({ msg, internalEmails, onClose }: { msg: ParsedMessage; internalEmails: InternalEmail[]; onClose: () => void }) {
  const [target, setTarget] = useState(internalEmails[0]?.email ?? '')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  const forward = async () => {
    if (!target) return
    setSending(true)
    const forwardBody = `${note ? `${note}\n\n---\n` : ''}הועבר: ${msg.from}<br/>${msg.body || msg.snippet}`
    await fetch('/api/admin/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: target, subject: `Fwd: ${msg.subject}`, body: forwardBody }),
    })
    setSending(false)
    setDone(true)
    setTimeout(onClose, 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-4 p-6">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 size={32} className="text-green-600" />
            <p className="font-semibold text-slate-800">המייל הועבר בהצלחה</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">העבר מייל למחלקה</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
              <p className="font-medium text-slate-700 truncate">{msg.subject}</p>
              <p className="text-xs text-slate-400 mt-0.5">{msg.from}</p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">העבר אל:</label>
              {internalEmails.length === 0 ? (
                <p className="text-xs text-slate-400">אין מיילים פנימיים מוגדרים. הוסף בהגדרות.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {internalEmails.map(ie => (
                    <label key={ie.email} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input type="radio" name="target" value={ie.email} checked={target === ie.email} onChange={() => setTarget(ie.email)} />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{ie.name}</p>
                        <p className="text-xs text-slate-400">{ie.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">הערה (אופציונלי):</label>
              <textarea className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none" rows={2}
                value={note} onChange={e => setNote(e.target.value)} placeholder="הוסף הערה..." />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500">ביטול</button>
              <button onClick={forward} disabled={sending || !target || internalEmails.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Forward size={14} />}
                העבר
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Label Tag Dropdown ────────────────────────────────────────────────────────

function LabelDropdown({ messageId, labels, assigned, onAssign, onClose }: {
  messageId: string; labels: MailLabel[]; assigned: string[];
  onAssign: (labelId: string, add: boolean) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="absolute z-20 top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1 overflow-hidden">
      <p className="text-[10px] font-semibold text-slate-400 uppercase px-3 pt-1 pb-1.5">תוויות</p>
      {labels.map(l => {
        const active = assigned.includes(l.id)
        return (
          <button key={l.id} type="button"
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-right text-sm transition-colors"
            onClick={() => onAssign(l.id, !active)}
          >
            <span className="w-3 h-3 rounded-full flex-shrink-0 border-2" style={{ backgroundColor: active ? l.color : 'transparent', borderColor: l.color }} />
            <span className={active ? 'font-medium text-slate-800' : 'text-slate-600'}>{l.name}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Manage Labels Modal ───────────────────────────────────────────────────────

function ManageLabelsModal({ labels, internalEmails, onSaved, onClose }: {
  labels: MailLabel[]; internalEmails: InternalEmail[];
  onSaved: (labels: MailLabel[], internalEmails: InternalEmail[]) => void; onClose: () => void;
}) {
  const [localLabels, setLocalLabels] = useState<MailLabel[]>(labels)
  const [localEmails, setLocalEmails] = useState<InternalEmail[]>(internalEmails)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [newEmailName, setNewEmailName] = useState('')
  const [newEmailAddr, setNewEmailAddr] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'labels' | 'emails' | 'accounts'>('labels')
  const [domainAccounts, setDomainAccounts] = useState<{ name: string; email: string; isMain: boolean }[]>([])

  useEffect(() => {
    fetch('/api/admin/mail/accounts')
      .then(r => r.json())
      .then(d => setDomainAccounts(d.accounts ?? []))
      .catch(() => {})
  }, [])

  const addLabel = () => {
    if (!newName.trim()) return
    setLocalLabels(prev => [...prev, { id: crypto.randomUUID(), name: newName.trim(), color: newColor }])
    setNewName('')
  }

  const removeLabel = (id: string) => setLocalLabels(prev => prev.filter(l => l.id !== id))

  const addEmail = () => {
    if (!newEmailName.trim() || !newEmailAddr.trim()) return
    setLocalEmails(prev => [...prev, { name: newEmailName.trim(), email: newEmailAddr.trim() }])
    setNewEmailName(''); setNewEmailAddr('')
  }

  const removeEmail = (email: string) => setLocalEmails(prev => prev.filter(e => e.email !== email))

  const save = async () => {
    setSaving(true)
    await Promise.all([
      fetch('/api/admin/mail/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_internal_emails', emails: localEmails }) }),
      // save labels by clearing + re-adding — simplified: just save defs as a whole
      fetch('/api/admin/mail/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: '_set_label_defs', labels: localLabels }) }),
    ])
    setSaving(false)
    onSaved(localLabels, localEmails)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">הגדרות מייל</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="flex border-b border-slate-100">
          {([['labels', 'תוויות'], ['emails', 'מיילים פנימיים'], ['accounts', 'חשבונות מייל']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === k ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {tab === 'labels' ? (
            <>
              <div className="flex flex-col gap-1">
                {localLabels.map(l => (
                  <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100">
                    <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                    <span className="flex-1 text-sm text-slate-700">{l.name}</span>
                    <button onClick={() => removeLabel(l.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500">הוסף תווית:</p>
                <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                  value={newName} onChange={e => setNewName(e.target.value)} placeholder="שם התווית..." />
                <div className="flex flex-wrap gap-1.5">
                  {LABEL_COLORS.map(c => (
                    <button key={c.hex} type="button" onClick={() => setNewColor(c.hex)}
                      className={`w-6 h-6 rounded-full transition-transform ${newColor === c.hex ? 'ring-2 ring-offset-1 ring-slate-500 scale-110' : ''}`}
                      style={{ backgroundColor: c.hex }} title={c.name} />
                  ))}
                </div>
                <button onClick={addLabel} disabled={!newName.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 self-start">
                  <Plus size={14} /> הוסף
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                {localEmails.length === 0 && <p className="text-sm text-slate-400 text-center py-4">לא הוגדרו מיילים פנימיים</p>}
                {localEmails.map(e => (
                  <div key={e.email} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">{e.name}</p>
                      <p className="text-xs text-slate-400 truncate">{e.email}</p>
                    </div>
                    <button onClick={() => removeEmail(e.email)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500">הוסף מייל פנימי:</p>
                <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                  value={newEmailName} onChange={e => setNewEmailName(e.target.value)} placeholder="שם המחלקה..." />
                <EmailInput value={newEmailAddr} onChange={setNewEmailAddr} placeholder="כתובת מייל..."
                  inputClassName="border-slate-200 outline-none" />
                <button onClick={addEmail} disabled={!newEmailName.trim() || !newEmailAddr.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 self-start">
                  <Plus size={14} /> הוסף
                </button>
              </div>
            </>
          )}

          {tab === 'accounts' && (
            <>
              <p className="text-xs text-slate-500 mb-3">כל חשבונות המייל שזוהו אוטומטית ממשתמשי המערכת עם דומיין הארגון.</p>
              <div className="flex flex-col gap-2">
                {domainAccounts.map(acc => (
                  <div key={acc.email} className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                      ${acc.isMain ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                      {acc.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{acc.name}</p>
                      <p className="text-xs text-slate-400 truncate">{acc.email}</p>
                    </div>
                    {acc.isMain ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium flex-shrink-0">מחובר</span>
                    ) : (
                      <a href="/api/auth/gmail" className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors flex-shrink-0 font-medium">
                        חבר
                      </a>
                    )}
                  </div>
                ))}
                {domainAccounts.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">לא נמצאו חשבונות מייל בדומיין הארגון</p>
                )}
              </div>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                <p className="font-semibold mb-1">כיצד להוסיף חשבון?</p>
                <p>הוסף משתמש מערכת עם כתובת מייל מהדומיין (למשל: name@chasamsofer.info) — החשבון יופיע כאן אוטומטית.</p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500">ביטול</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            שמור
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Beneficiary Card ──────────────────────────────────────────────────────────

const MARITAL_STATUS_LABELS: Record<string, string> = {
  married: 'נשוי/נשואה', single: 'רווק/רווקה', divorced: 'גרוש/גרושה',
  widowed: 'אלמן/אלמנה', other: 'אחר',
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AssignAttachmentModal({ attachment, messageId, senderEmail, onClose }: {
  attachment: Attachment; messageId: string; senderEmail?: string; onClose: () => void
}) {
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<{ id: string; full_name: string }[]>([])
  const [selected, setSelected]     = useState<{ id: string; full_name: string } | null>(null)
  const [docType, setDocType]       = useState('id_husband')
  const [saving, setSaving]         = useState(false)
  const [done, setDone]             = useState(false)
  const [autoMatched, setAutoMatched] = useState(false)   // צאצא זוהה אוטומטית לפי מייל השולח
  const [lookingUp, setLookingUp]   = useState(!!senderEmail?.trim())
  const [maritalStatus, setMaritalStatus] = useState<string | null>(null)
  const { docTypes: allDocTypes } = useDocTypes()

  // רק המסמכים הנדרשים לפי הרכב המשפחה בכרטסת. כשהצאצא לא מזוהה — מציגים הכל.
  const docTypes = (() => {
    if (!autoMatched) return allDocTypes
    const married = !!maritalStatus && /נשוי|נשוא/.test(maritalStatus)
    const allowed = married
      ? ['id_husband', 'id_wife', 'id_child', 'other']
      : ['id_husband', 'id_child', 'other']
    return allDocTypes.filter(t => allowed.includes(t.value))
  })()

  // זיהוי אוטומטי של הצאצא לפי כתובת המייל של השולח
  useEffect(() => {
    const email = senderEmail?.trim()
    if (!email) { setLookingUp(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/beneficiary-search?email=${encodeURIComponent(email)}&exact=1`)
        const data = await res.json()
        const match = data.beneficiaries?.[0]
        if (!cancelled && match) {
          setSelected({ id: match.id, full_name: match.full_name })
          setMaritalStatus(match.marital_status ?? null)
          setAutoMatched(true)
        }
      } catch { /* נתעלם — ניפול לחיפוש ידני */ }
      finally { if (!cancelled) setLookingUp(false) }
    })()
    return () => { cancelled = true }
  }, [senderEmail])

  // יישור סוג המסמך לאופציה חוקית כשהרשימה מסתננת
  useEffect(() => {
    if (!docTypes.some(t => t.value === docType)) setDocType(docTypes[0]?.value ?? 'other')
  }, [docTypes, docType])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/beneficiary-search?q=${encodeURIComponent(query)}&limit=6`)
      const data = await res.json()
      setResults(data.beneficiaries ?? [])
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await fetch('/api/admin/assign-attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          attachmentId: attachment.attachmentId,
          inlineData: attachment.inlineData,
          beneficiaryId: selected.id,
          docType,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
        }),
      })
      setDone(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        {done ? (
          <div className="text-center py-4">
            <CheckCircle2 size={40} className="mx-auto text-green-500 mb-3" />
            <p className="font-bold text-slate-900">הקובץ שויך בהצלחה!</p>
            <p className="text-sm text-slate-500 mt-1">הקובץ נשמר בתיקיית המסמכים של הצאצא.</p>
            <button onClick={onClose} className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium">סגור</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <FolderOpen size={18} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">שייך קובץ לצאצא</h2>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{attachment.filename}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">סוג מסמך</label>
                <select value={docType} onChange={e => setDocType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {docTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {lookingUp ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                  <Loader2 size={15} className="animate-spin" /> מזהה את הצאצא לפי כתובת המייל...
                </div>
              ) : autoMatched && selected ? (
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">צאצא</label>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-800 truncate">{selected.full_name}</span>
                      <span className="text-[11px] text-green-700 bg-green-100 rounded-full px-2 py-0.5 flex-shrink-0">זוהה לפי המייל</span>
                    </div>
                    <button onClick={() => { setAutoMatched(false); setSelected(null) }}
                      className="text-xs text-slate-500 hover:text-indigo-600 flex-shrink-0">שנה</button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <label className="text-xs font-semibold text-slate-600 block mb-1">חפש צאצא</label>
                  <input value={selected ? selected.full_name : query}
                    onChange={e => { setSelected(null); setQuery(e.target.value) }}
                    placeholder="שם, ת.ז. או מייל..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  {results.length > 0 && !selected && (
                    <ul className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                      {results.map(r => (
                        <li key={r.id} onClick={() => { setSelected(r); setResults([]); setQuery('') }}
                          className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 text-slate-800">
                          {r.full_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">ביטול</button>
              <button disabled={!selected || saving} onClick={save}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                {saving && <Loader2 size={13} className="animate-spin" />}
                שמור
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AttachmentBar({ attachments, messageId, senderEmail }: { attachments: Attachment[]; messageId: string; senderEmail?: string }) {
  const [assigning, setAssigning] = useState<Attachment | null>(null)
  if (!attachments.length) return null

  return (
    <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60">
      <div className="flex items-center gap-1.5 mb-2">
        <Paperclip size={13} className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-500">{attachments.length} קבצים מצורפים</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {attachments.map(att => (
          <div key={att.attachmentId}
            className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700">
            <FileText size={13} className="text-slate-400 flex-shrink-0" />
            <span className="truncate max-w-[140px]">{att.filename}</span>
            <span className="text-slate-400">{formatBytes(att.size)}</span>
            <a href={att.inlineData
                ? `/api/admin/gmail/attachment?messageId=${messageId}&inlineData=${encodeURIComponent(att.inlineData)}&filename=${encodeURIComponent(att.filename)}&mimeType=${encodeURIComponent(att.mimeType)}`
                : `/api/admin/gmail/attachment?messageId=${messageId}&attachmentId=${att.attachmentId}&filename=${encodeURIComponent(att.filename)}&mimeType=${encodeURIComponent(att.mimeType)}`
              }
              download={att.filename}
              className="p-0.5 text-slate-400 hover:text-indigo-600 transition-colors" title="הורד">
              <Download size={13} />
            </a>
            <button onClick={() => setAssigning(att)}
              className="p-0.5 text-slate-400 hover:text-green-600 transition-colors" title="שייך לצאצא">
              <FolderOpen size={13} />
            </button>
          </div>
        ))}
      </div>
      {assigning && <AssignAttachmentModal attachment={assigning} messageId={messageId} senderEmail={senderEmail} onClose={() => setAssigning(null)} />}
    </div>
  )
}

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

  if (loading) return <div className="p-4 flex items-center gap-2 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" />מחפש צאצא...</div>
  if (!ben) return null

  const name = [ben.family_name, ben.full_name].filter(Boolean).join(' ')
  const statusColor = STATUS_COLORS[ben.eligibility_status] ?? 'bg-slate-100 text-slate-600'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = ben as any

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">צאצא מזוהה</span>
        <Link href={`/admin/beneficiaries/${ben.id}`} target="_blank"
          className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
          פתח כרטיס <ExternalLink size={11} />
        </Link>
      </div>

      {/* Name + avatar */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-base flex-shrink-0">
          {name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-slate-800 text-sm">{name}</p>
          {b.id_number && <p className="text-[11px] text-slate-400">ת.ז. {b.id_number}</p>}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
            {ELIGIBILITY_LABELS[ben.eligibility_status]}
          </span>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-600">
        {ben.phone && (
          <span className="flex items-center gap-1.5 col-span-1">
            <Phone size={11} className="text-slate-400 flex-shrink-0" />{ben.phone}
          </span>
        )}
        {(b.city || b.address) && (
          <span className="flex items-center gap-1.5 col-span-1 truncate">
            <MapPin size={11} className="text-slate-400 flex-shrink-0" />
            {[b.address, b.city].filter(Boolean).join(', ')}
          </span>
        )}
        {ben.children_count > 0 && (
          <span className="flex items-center gap-1.5">
            <User size={11} className="text-slate-400 flex-shrink-0" />{ben.children_count} ילדים
          </span>
        )}
        {b.marital_status && (
          <span className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[10px]">♦</span>
            {MARITAL_STATUS_LABELS[b.marital_status] ?? b.marital_status}
          </span>
        )}
      </div>

      {/* Spouse */}
      {b.spouse_name && (
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <div className="w-6 h-6 rounded-full bg-pink-100 flex items-center justify-center text-[10px] font-bold text-pink-600 flex-shrink-0">
            {b.spouse_name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400">בן/בת זוג</p>
            <p className="text-xs font-medium text-slate-700">{b.spouse_name}</p>
          </div>
        </div>
      )}

      {/* Lineage */}
      {Array.isArray(b.lineage_manual) && b.lineage_manual.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">ייחוס</p>
          <div className="flex flex-wrap gap-1">
            {(b.lineage_manual as string[]).map((node, i) => (
              <span key={i} className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{node}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function MailClient() {
  const [folder, setFolder] = useState('INBOX')
  const [messages, setMessages] = useState<ParsedMessage[]>([])
  const [selected, setSelected] = useState<ParsedMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [compose, setCompose] = useState(false)
  const [replyMsg, setReplyMsg] = useState<ParsedMessage | undefined>()
  const [search, setSearch] = useState('')
  const [activeLabel, setActiveLabel] = useState<string | null>(null) // label filter
  const [dragLabelId, setDragLabelId] = useState<string | null>(null) // currently dragged label
  const [dragOverMsgId, setDragOverMsgId] = useState<string | null>(null) // message being dragged over
  const [pendingDrop, setPendingDrop] = useState<{ msgId: string; labelId: string } | null>(null) // waiting for add/replace decision

  // Beneficiary name lookup
  const [emailToInfo, setEmailToInfo] = useState<Record<string, { name: string; id: string }>>({})

  // Labels
  const [labels, setLabels] = useState<MailLabel[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [internalEmails, setInternalEmails] = useState<InternalEmail[]>([])
  const [openLabelFor, setOpenLabelFor] = useState<string | null>(null)
  const [showManageLabels, setShowManageLabels] = useState(false)

  // Forward
  const [forwardMsg, setForwardMsg] = useState<ParsedMessage | null>(null)

  // Thread view
  const [threadMsgs, setThreadMsgs] = useState<ParsedMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)

  // Email open tracking (SENT folder)
  const [trackingStatus, setTrackingStatus] = useState<Record<string, { opened: boolean; openedAt: string | null; openCount: number }>>({})

  // New mail toast notifications
  const [mailToasts, setMailToasts] = useState<MailToast[]>([])
  const knownMsgIdsRef = useRef<Set<string>>(new Set())
  const isFirstMailLoad = useRef(true)

  // Handled messages (in-session tracking)
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())

  const recordEvent = useCallback(async (
    msg: ParsedMessage,
    eventType: 'read' | 'handled' | 'replied',
  ) => {
    try {
      await fetch('/api/admin/mail/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: msg.id,
          thread_id: msg.threadId,
          event_type: eventType,
          user_id: myProfileRef.current?.id ?? null,
          label_ids: assignments[msg.id] ?? [],
          from_email: msg.fromEmail,
          subject: msg.subject,
        }),
      })
    } catch { /* silent */ }
  }, [assignments])

  // Current user profile (for label-based filtering) — kept in a ref so load() stays stable
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const myProfileRef = useRef<Profile | null>(null)

  // Fetch current user profile on mount
  useEffect(() => {
    fetch('/api/admin/me')
      .then(r => r.json())
      .then(d => {
        const p = d.profile ?? null
        setMyProfile(p)
        myProfileRef.current = p
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async (f: string, q?: string) => {
    setLoading(true)
    setSelected(null)
    const res = await fetch(`/api/admin/gmail/messages?folder=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
    const data = await res.json()
    if (data.notConnected) { setNotConnected(true); setLoading(false); return }
    let msgs: ParsedMessage[] = data.messages ?? []

    // Filter messages by assigned label IDs for non-admin users
    if (myProfile && myProfile.role !== 'admin' && myProfile.mail_label_ids && myProfile.mail_label_ids.length > 0) {
      // We need the assignments to filter — fetch them first (they're loaded separately via labels endpoint)
      // Use a local fetch to get current assignments at load time
      const labelsRes = await fetch('/api/admin/mail/labels')
      const labelsData = await labelsRes.json()
      const currentAssignments: Record<string, string[]> = labelsData.assignments ?? {}
      msgs = msgs.filter(msg =>
        (currentAssignments[msg.id] ?? []).some(labelId => myProfile.mail_label_ids!.includes(labelId))
      )
    }

    setMessages(msgs)

    // Detect new INBOX messages for toast notifications
    if (f === 'INBOX') {
      const newMsgs = msgs.filter(m => !knownMsgIdsRef.current.has(m.id))
      msgs.forEach(m => knownMsgIdsRef.current.add(m.id))
      if (!isFirstMailLoad.current && newMsgs.length > 0) {
        playMailSound()
        setMailToasts(prev => [
          ...prev,
          ...newMsgs.map(m => ({ id: m.id, from: m.from, subject: m.subject, snippet: m.snippet })),
        ])
      }
      if (isFirstMailLoad.current) isFirstMailLoad.current = false
    }

    // Fetch open-tracking status for SENT messages
    if (f === 'SENT' && msgs.length > 0) {
      const ids = msgs.map(m => m.id).join(',')
      fetch(`/api/admin/mail/tracking-status?messageIds=${encodeURIComponent(ids)}`)
        .then(r => r.json())
        .then(d => setTrackingStatus(d))
        .catch(() => {})
    }

    // batch resolve sender + recipient names
    const uniqueEmails = [...new Set([
      ...msgs.map(m => m.fromEmail),
      ...msgs.map(m => m.toEmail),
    ].filter(Boolean))]
    if (uniqueEmails.length > 0) {
      const r = await fetch(`/api/admin/beneficiary-search?emails=${encodeURIComponent(uniqueEmails.join(','))}&limit=100`)
      const d = await r.json()
      const map: Record<string, { name: string; id: string }> = {}
      for (const b of d.results ?? []) if (b.email) map[b.email] = { name: b.name, id: b.id }
      setEmailToInfo(map)
    }

    setLoading(false)
  }, [myProfile])

  // Load labels on mount
  useEffect(() => {
    fetch('/api/admin/mail/labels').then(r => r.json()).then(d => {
      setLabels(d.labels ?? [])
      setAssignments(d.assignments ?? {})
      setInternalEmails(d.internalEmails ?? [])
    })
  }, [])

  useEffect(() => { load(folder) }, [folder, load])

  // Background poll every 60s for new INBOX mail (for toast notifications)
  useEffect(() => {
    const interval = setInterval(() => {
      if (folder === 'INBOX') load('INBOX')
    }, 60_000)
    return () => clearInterval(interval)
  }, [folder, load])

  const openMessage = async (msg: ParsedMessage) => {
    setSelected(msg)
    setOpenLabelFor(null)
    if (!msg.isRead) {
      await fetch('/api/admin/gmail/mark-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msg.id }) })
      setMessages(ms => ms.map(m => m.id === msg.id ? { ...m, isRead: true } : m))
    }
    recordEvent(msg, 'read')
  }

  const markHandled = (msg: ParsedMessage) => {
    setHandledIds(prev => new Set([...prev, msg.id]))
    recordEvent(msg, 'handled')
  }

  const trashMessage = async (id: string) => {
    await fetch('/api/admin/gmail/trash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setMessages(ms => ms.filter(m => m.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const toggleLabel = async (messageId: string, labelId: string, add: boolean) => {
    const action = add ? 'assign' : 'unassign'
    await fetch('/api/admin/mail/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, messageId, labelId }) })
    setAssignments(prev => {
      const cur = prev[messageId] ?? []
      return { ...prev, [messageId]: add ? [...new Set([...cur, labelId])] : cur.filter(id => id !== labelId) }
    })
  }

  const senderDisplay = (msg: ParsedMessage) => {
    const info = emailToInfo[msg.fromEmail]
    if (info) return `${info.name} · ${msg.fromEmail}`
    return msg.from.replace(/<.*>/, '').trim() || msg.fromEmail
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
      <div className="w-56 flex-shrink-0 bg-slate-50 border-l border-slate-200 flex flex-col">

        {/* Account header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Mail size={16} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              {myProfile && myProfile.role !== 'admin' && myProfile.mail_account ? (
                <>
                  <p className="text-sm font-bold text-slate-800 truncate leading-tight">
                    {internalEmails.find(ie => ie.email === myProfile.mail_account)?.name ?? myProfile.mail_account}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{myProfile.mail_account}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-800 truncate leading-tight">משרד ראשי</p>
                  <p className="text-[11px] text-indigo-500 truncate font-medium">office@chasamsofer.info</p>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => { setCompose(true); setReplyMsg(undefined) }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <PenSquare size={15} />
            מייל חדש
          </button>
        </div>

        {/* Folders */}
        <nav className="px-2 py-2 border-b border-slate-100">
          {FOLDER_ITEMS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => { setFolder(key); setSelected(null); setActiveLabel(null) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-right ${folder === key && !activeLabel ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon size={16} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Labels section */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {labels.length > 0 && (
            <>
              <div className="flex items-center justify-between px-2 pt-1 pb-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">תוויות</p>
                <button onClick={() => setShowManageLabels(true)}
                  className="text-slate-300 hover:text-indigo-500 transition-colors" title="נהל תוויות">
                  <Settings size={13} />
                </button>
              </div>
              <div className="flex flex-col gap-0.5">
                {labels.map(l => {
                  const labelMsgs = messages.filter(m => (assignments[m.id] ?? []).includes(l.id))
                  const count = Object.values(assignments).filter(ids => ids.includes(l.id)).length
                  const isOpen = activeLabel === l.id
                  return (
                    <div key={l.id}>
                      <button
                        draggable
                        onDragStart={() => setDragLabelId(l.id)}
                        onDragEnd={() => setDragLabelId(null)}
                        onClick={() => { setActiveLabel(isOpen ? null : l.id); setSelected(null) }}
                        className={`group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-right cursor-pointer
                          ${isOpen ? 'font-semibold' : 'text-slate-600 hover:bg-slate-100 font-medium'}`}
                        style={isOpen ? { backgroundColor: l.color + '14', color: l.color } : {}}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                        <span className="truncate flex-1">{l.name}</span>
                        {count > 0 && (
                          <span className={`text-[11px] font-semibold flex-shrink-0 ${isOpen ? '' : 'text-slate-400'}`}>
                            {count}
                          </span>
                        )}
                        <ChevronDown size={13} className={`flex-shrink-0 transition-transform ${isOpen ? 'rotate-180 opacity-70' : 'opacity-0 group-hover:opacity-40'}`} />
                      </button>

                      {/* Accordion: list of message subjects under this label */}
                      {isOpen && labelMsgs.length > 0 && (
                        <div className="mr-4 ml-1 mt-0.5 mb-1 border-r-2 pr-2" style={{ borderColor: l.color + '40' }}>
                          {labelMsgs.map(msg => (
                            <button
                              key={msg.id}
                              onClick={() => openMessage(msg)}
                              className={`w-full text-right px-2 py-1.5 rounded-md text-xs hover:bg-slate-50 transition-colors
                                ${selected?.id === msg.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}
                            >
                              <p className={`truncate ${!msg.isRead ? 'font-semibold text-slate-800' : ''}`}>{msg.subject || '(ללא נושא)'}</p>
                              <p className="text-[10px] text-slate-400 truncate">{formatDate(msg.date)}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {isOpen && labelMsgs.length === 0 && (
                        <p className="text-[11px] text-slate-400 text-center py-1.5">אין מיילים טעונים עם תווית זו</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-2 pb-2 border-t border-slate-200 pt-2 flex flex-col gap-0.5">
          <Link href="/admin/mail/stats"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors">
            <BarChart2 size={13} /> ניטור וסטטיסטיקות
          </Link>
          <button onClick={() => setShowManageLabels(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors">
            <Settings size={13} /> הגדרות מייל
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className={`flex flex-col border-l border-slate-200 ${selected ? 'w-72 flex-shrink-0' : 'flex-1'}`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input className="flex-1 text-sm bg-transparent outline-none" placeholder="חפש מיילים..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load(folder, search)} />
          </div>
          <button onClick={() => load(folder, search)} className="p-1.5 text-slate-400 hover:text-slate-700">
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Active label filter banner */}
        {activeLabel && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50">
            {(() => { const l = labels.find(x => x.id === activeLabel); return l ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-xs font-medium text-slate-700 flex-1">מסונן: {l.name}</span>
                <button onClick={() => setActiveLabel(null)} className="text-xs text-slate-400 hover:text-slate-700">נקה</button>
              </>
            ) : null })()}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> טוען מיילים...
            </div>
          ) : (
            (() => {
              const filtered = activeLabel
                ? messages.filter(m => (assignments[m.id] ?? []).includes(activeLabel))
                : messages.filter(m => !(assignments[m.id] ?? []).includes('label-decision'))
              return filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-400">
                  <Mail size={24} /><span className="text-sm">{activeLabel ? 'אין מיילים עם תווית זו' : 'אין הודעות'}</span>
                </div>
              ) : filtered.map(msg => {
                const msgLabels = (assignments[msg.id] ?? []).map(id => labels.find(l => l.id === id)).filter(Boolean) as MailLabel[]
                const isDragTarget = dragOverMsgId === msg.id && dragLabelId
                return (
                  <div key={msg.id}
                    onDragOver={e => { if (dragLabelId) { e.preventDefault(); setDragOverMsgId(msg.id) } }}
                    onDragLeave={() => setDragOverMsgId(null)}
                    onDrop={e => {
                      e.preventDefault()
                      if (dragLabelId) {
                        const existing = assignments[msg.id] ?? []
                        setDragOverMsgId(null)
                        if (existing.length > 0 && !existing.includes(dragLabelId)) {
                          // Ask: add alongside existing or replace?
                          setPendingDrop({ msgId: msg.id, labelId: dragLabelId })
                        } else {
                          toggleLabel(msg.id, dragLabelId, true)
                        }
                      }
                    }}
                    className={`group relative border-b border-slate-100 transition-colors
                      ${selected?.id === msg.id ? 'bg-indigo-50 border-r-2 border-r-indigo-500' : 'hover:bg-slate-50'}
                      ${isDragTarget ? 'bg-amber-50 border-amber-300' : ''}`}>
                    <button className="w-full text-right px-4 py-3" onClick={() => openMessage(msg)}>
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span className={`text-sm truncate leading-tight ${!msg.isRead ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                          {folder === 'SENT'
                            ? (emailToInfo[msg.toEmail]
                                ? `${emailToInfo[msg.toEmail].name} · ${msg.toEmail}`
                                : msg.to)
                            : senderDisplay(msg)}
                        </span>
                        <span className="text-sm text-slate-500 font-medium flex-shrink-0 tabular-nums transition-opacity group-hover:opacity-0">{formatDate(msg.date)}</span>
                      </div>
                      <p className={`text-xs truncate mb-0.5 ${!msg.isRead ? 'font-medium text-slate-700' : 'text-slate-500'}`}>{msg.subject}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {folder === 'SENT' && trackingStatus[msg.id] && (
                          trackingStatus[msg.id].opened ? (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                              <CheckCircle2 size={10} /> נפתח{trackingStatus[msg.id].openedAt ? ` · ${formatDate(trackingStatus[msg.id].openedAt as string)}` : ''}
                              {trackingStatus[msg.id].openCount > 1 ? ` (${trackingStatus[msg.id].openCount})` : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              טרם נפתח
                            </span>
                          )
                        )}
                        {msgLabels.map(l => (
                          <span key={l.id} className="inline-flex items-center gap-0.5 text-[11px] font-medium pl-1.5 pr-1.5 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: l.color }}>
                            {l.name}
                            <button
                              onClick={e => { e.stopPropagation(); toggleLabel(msg.id, l.id, false) }}
                              className="opacity-70 hover:opacity-100 leading-none"
                              title="הסר תווית"
                            >
                              <X size={9} />
                            </button>
                          </span>
                        ))}
                        {msgLabels.length === 0 && <p className="text-xs text-slate-400 truncate">{msg.snippet}</p>}
                      </div>
                    </button>
                    <div className="absolute top-2 left-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 rounded-lg shadow-sm border border-slate-100 px-0.5">
                      <button
                        onClick={e => { e.stopPropagation(); trashMessage(msg.id) }}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                        title="מחק">
                        <Trash2 size={13} />
                      </button>
                      <div className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); setOpenLabelFor(openLabelFor === msg.id ? null : msg.id) }}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                          title="תוויות">
                          <Tag size={13} />
                        </button>
                        {openLabelFor === msg.id && (
                          <LabelDropdown
                            messageId={msg.id}
                            labels={labels}
                            assigned={assignments[msg.id] ?? []}
                            onAssign={(labelId, add) => toggleLabel(msg.id, labelId, add)}
                            onClose={() => setOpenLabelFor(null)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            })()
          )}
        </div>
      </div>

      {/* Message View */}
      {selected && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900 text-base truncate">{selected.subject}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {emailToInfo[selected.fromEmail] ? (
                  <>
                    <Link href={`/admin/beneficiaries/${emailToInfo[selected.fromEmail].id}`} target="_blank"
                      className="text-sm font-semibold text-indigo-700 hover:underline">
                      {emailToInfo[selected.fromEmail].name}
                    </Link>
                    <span className="text-xs text-slate-400">{selected.fromEmail}</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-500">{selected.from}</span>
                )}
                <span className="text-xs text-slate-400">· {formatDate(selected.date)}</span>
                {folder === 'SENT' && trackingStatus[selected.id] && (
                  trackingStatus[selected.id].opened ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      <CheckCircle2 size={11} /> נפתח{trackingStatus[selected.id].openedAt ? ` · ${formatDate(trackingStatus[selected.id].openedAt as string)}` : ''}
                      {trackingStatus[selected.id].openCount > 1 ? ` · ${trackingStatus[selected.id].openCount} פתיחות` : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      טרם נפתח
                    </span>
                  )
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Handled toggle */}
              {handledIds.has(selected.id) ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg font-semibold">
                  <CheckCircle2 size={14} className="text-green-500" /> טופל
                </span>
              ) : (
                <button onClick={() => markHandled(selected)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition-colors font-semibold">
                  <CheckCircle2 size={14} /> סמן כטופל
                </button>
              )}
              <button onClick={() => { setReplyMsg(selected); setCompose(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                <Reply size={14} /> השב
              </button>
              <button onClick={() => setForwardMsg(selected)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <Forward size={14} /> העבר
              </button>
              <button onClick={() => trashMessage(selected.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                title="העבר לאשפה">
                <Trash2 size={14} /> מחק
              </button>
              <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:text-slate-700">
                <ChevronLeft size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Label chips on selected message */}
            {(assignments[selected.id] ?? []).length > 0 && (
              <div className="flex items-center gap-1.5 px-6 pt-3 flex-wrap">
                {(assignments[selected.id] ?? []).map(id => {
                  const l = labels.find(x => x.id === id)
                  if (!l) return null
                  return (
                    <span key={id} className="inline-flex items-center gap-1 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full text-white" style={{ backgroundColor: l.color }}>
                      {l.name}
                      <button onClick={() => toggleLabel(selected.id, id, false)} className="opacity-70 hover:opacity-100 ml-0.5">
                        <X size={10} />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
            <div className="px-6 py-5 text-sm text-slate-800 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: selected.body || selected.snippet }} />
            <AttachmentBar attachments={selected.attachments ?? []} messageId={selected.id} senderEmail={selected.fromEmail} />
            {folder === 'INBOX' && <BeneficiaryCard email={selected.fromEmail} />}
          </div>
        </div>
      )}


      {compose && <ComposeModal onClose={() => setCompose(false)} replyTo={replyMsg} />}
      {forwardMsg && <ForwardModal msg={forwardMsg} internalEmails={internalEmails} onClose={() => setForwardMsg(null)} />}

      {/* Add-or-Replace label popup */}
      {pendingDrop && (() => {
        const newLabel = labels.find(l => l.id === pendingDrop.labelId)
        const existingLabels = (assignments[pendingDrop.msgId] ?? []).map(id => labels.find(l => l.id === id)).filter(Boolean) as MailLabel[]
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-slate-900 text-center">הוסף תווית</h3>
              <p className="text-sm text-slate-600 text-center">
                להודעה כבר משויכת תווית{existingLabels.length > 1 ? 'ות' : ''}{' '}
                <span className="font-medium">{existingLabels.map(l => l.name).join(', ')}</span>.<br/>
                מה לעשות עם התווית{' '}
                {newLabel && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-medium" style={{ backgroundColor: newLabel.color }}>{newLabel.name}</span>}?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    await toggleLabel(pendingDrop.msgId, pendingDrop.labelId, true)
                    setPendingDrop(null)
                  }}
                  className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  הוסף לצד הקיים
                </button>
                <button
                  onClick={async () => {
                    // Remove all existing labels then add new one
                    for (const l of existingLabels) {
                      await toggleLabel(pendingDrop.msgId, l.id, false)
                    }
                    await toggleLabel(pendingDrop.msgId, pendingDrop.labelId, true)
                    setPendingDrop(null)
                  }}
                  className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors"
                >
                  החלף את {existingLabels.length > 1 ? 'כל התוויות' : 'התווית'}
                </button>
                <button onClick={() => setPendingDrop(null)} className="text-xs text-slate-400 hover:text-slate-600 text-center py-1">
                  ביטול
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      {showManageLabels && (
        <ManageLabelsModal
          labels={labels}
          internalEmails={internalEmails}
          onSaved={(l, e) => { setLabels(l); setInternalEmails(e) }}
          onClose={() => setShowManageLabels(false)}
        />
      )}

      {/* New mail toast notifications — bottom-left */}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
        {mailToasts.map(t => (
          <NewMailToast
            key={t.id}
            toast={t}
            onClick={() => {
              const msg = messages.find(m => m.id === t.id)
              if (msg) { setFolder('INBOX'); openMessage(msg) }
              setMailToasts(p => p.filter(x => x.id !== t.id))
            }}
            onClose={() => setMailToasts(p => p.filter(x => x.id !== t.id))}
          />
        ))}
      </div>
    </div>
  )
}
