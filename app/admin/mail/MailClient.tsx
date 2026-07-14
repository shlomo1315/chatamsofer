'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { sanitizeEmailHtml } from '@/lib/sanitizeEmailHtml'
import { createClient } from '@/lib/supabase/client'
import { docViewUrl, docDownloadUrl } from '@/lib/docUrl'
import DocThumb from '@/components/ui/DocThumb'
import {
  Inbox, Send, RefreshCw, PenSquare, Mail, Search, X,
  ChevronLeft, Loader2, Reply, User, Phone, MapPin,
  CheckCircle2, ExternalLink, Forward, Trash2, BarChart2,
  Paperclip, Download, FolderOpen, FileText, Bold, Italic, Underline, List, ListOrdered, Smile, Palette,
  Clock, Tag, Ban, Flag, Plus, ShieldCheck, Archive, UserPlus,
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
import { DEPARTMENTS, departmentByEmail, type DepartmentKey } from '@/lib/departments'
import NewMailToast, { type MailToast, playMailSound } from '@/components/ui/NewMailToast'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BeneficiarySuggestion { id: string; name: string; email: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FOLDER_ITEMS = [
  { key: 'INBOX', label: 'דואר נכנס', icon: Inbox },
  { key: 'SENT',  label: 'דואר יוצא', icon: Send },
  { key: 'SCHEDULED', label: 'מתוזמנים', icon: Clock },
  { key: 'SPAM',  label: 'ספאם', icon: Ban },
  { key: 'LEGACY', label: 'ארכיון מייל קודם', icon: Archive },
]

const STATUS_COLORS: Record<string, string> = {
  approved:     'bg-green-100 text-green-700',
  pending:      'bg-amber-100 text-amber-700',
  rejected:     'bg-red-100 text-red-700',
  docs_pending: 'bg-blue-100 text-blue-700',
}

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

function ComposeModal({ onClose, replyTo, initialTo, department }: { onClose: () => void; replyTo?: ParsedMessage; initialTo?: string; department?: string }) {
  const [query, setQuery]     = useState('')          // unified search (name / email / ID)
  const [searching, setSearching] = useState(false)

  // יעד התשובה = הצד החיצוני (הצאצא ששלח), אף פעם לא כתובת מחלקה פנימית.
  // אם השולח הוא מחלקה (למשל בתיקיית "נשלח" או במייל שהועבר) — משיבים לנמען המקורי.
  const replyTarget = replyTo
    ? (departmentByEmail(replyTo.fromEmail) ? replyTo.toEmail : replyTo.fromEmail)
    : ''
  const [to, setTo]           = useState(initialTo ?? replyTarget)
  const [toName, setToName]   = useState('')
  const [locked, setLocked]   = useState(!!(initialTo ?? replyTarget))
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
  const [scheduleAt, setScheduleAt] = useState('')   // datetime-local לתזמון שליחה
  const [showSchedule, setShowSchedule] = useState(false)
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

  const scheduledIso = scheduleAt ? new Date(scheduleAt).toISOString() : undefined
  const send = async () => {
    if (!to || !subject) return
    if (scheduledIso && new Date(scheduledIso).getTime() <= Date.now() + 30_000) { alert('יש לבחור מועד עתידי לתזמון'); return }
    setSending(true)
    const html = editorRef.current?.innerHTML ?? body
    await fetch('/api/admin/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to, subject, body: html, threadId: replyTo?.threadId,
        attachments,
        templateUrls: tplPicked.map(t => ({ url: t.url, filename: t.filename, mimeType: t.mimeType })),
        department,
        scheduledAt: scheduledIso,
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
          <h3 className="text-lg font-bold text-slate-900">{scheduleAt ? `המייל תוזמן ל-${new Date(scheduleAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'המייל נשלח בהצלחה'}</h3>
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
          <div className="flex flex-col gap-0.5">
            <h3 className="font-semibold text-slate-900">{replyTo ? 'השב למייל' : 'מייל חדש'}</h3>
            {department && DEPARTMENTS[department as DepartmentKey] && (
              <span className="text-xs text-slate-500">
                נשלח מטעם <span className="font-medium text-indigo-600">{DEPARTMENTS[department as DepartmentKey].label}</span>
                <span className="text-slate-400"> · תשובות אל {DEPARTMENTS[department as DepartmentKey].email}</span>
              </span>
            )}
          </div>
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

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-200">
          {/* תזמון שליחה */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowSchedule(s => !s)}
              title="תזמון שליחה"
              className={`flex items-center gap-1.5 px-2.5 py-2 text-sm rounded-lg border transition-colors ${scheduleAt ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              <Clock size={15} />
              {scheduleAt ? new Date(scheduleAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'תזמון'}
            </button>
            {(showSchedule || scheduleAt) && (
              <div className="flex items-center gap-1">
                <input type="datetime-local" value={scheduleAt} min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
                  onChange={e => setScheduleAt(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-400" />
                {scheduleAt && <button type="button" onClick={() => { setScheduleAt(''); setShowSchedule(false) }} className="text-slate-400 hover:text-red-500"><X size={14} /></button>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">ביטול</button>
            <button
              onClick={send}
              disabled={sending || !canSend}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : (scheduleAt ? <Clock size={15} /> : <Send size={15} />)}
              {scheduleAt ? 'תזמן שליחה' : 'שלח'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Forward Modal ─────────────────────────────────────────────────────────────

function ForwardModal({ msg, onClose }: { msg: ParsedMessage; onClose: () => void }) {
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  // הזהות שממנה יישלח המייל המועבר — התיבה שאליה הגיע המייל המקורי (או שולחה ממנה)
  const deptKey = departmentByEmail(msg.toEmail)?.key ?? departmentByEmail(msg.fromEmail)?.key ?? 'main'
  const fromDept = DEPARTMENTS[deptKey]
  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

  const forward = async () => {
    const recipient = to.trim()
    if (!isValidEmail(recipient)) { setError('נא להזין כתובת מייל תקינה'); return }
    setError(''); setSending(true)
    const noteHtml = note.trim()
      ? `<p style="white-space:pre-wrap;">${note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`
      : ''
    const quoted =
      `${noteHtml}<div style="border-right:3px solid #cbd5e1;padding-right:12px;margin-top:12px;">` +
      `<p style="font-size:12px;color:#94a3b8;margin:0 0 8px;">---------- הודעה שהועברה ----------<br>` +
      `מאת: ${msg.from}<br>תאריך: ${formatDate(msg.date)}<br>נושא: ${msg.subject}<br>אל: ${msg.toEmail}</p>` +
      `${msg.body || ''}</div>`
    const templateUrls = (msg.attachments ?? [])
      .filter(a => a.url)
      .map(a => ({ url: a.url, filename: a.filename, mimeType: a.mimeType }))
    try {
      const res = await fetch('/api/admin/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          subject: msg.subject?.toLowerCase().startsWith('fwd:') ? msg.subject : `Fwd: ${msg.subject}`,
          body: quoted,
          department: deptKey,
          templateUrls,
        }),
      })
      setSending(false)
      if (res.ok) { setDone(true); setTimeout(onClose, 1500) }
      else { const d = await res.json().catch(() => ({})); setError(d.error || 'שגיאה בהעברת המייל') }
    } catch {
      setSending(false); setError('שגיאת רשת. נסה שוב.')
    }
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
              <h3 className="font-semibold text-slate-900">העבר מייל</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
              <p className="font-medium text-slate-700 truncate">{msg.subject}</p>
              <p className="text-xs text-slate-400 mt-0.5">{msg.from}</p>
              {(msg.attachments ?? []).length > 0 && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Paperclip size={11} /> {(msg.attachments ?? []).length} צרופות יועברו</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">העבר אל כתובת מייל:</label>
              <input type="email" dir="ltr" value={to} onChange={e => { setTo(e.target.value); setError('') }}
                placeholder="name@example.com"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
              {/* מילוי מהיר של כתובות פנימיות */}
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.values(DEPARTMENTS).map(dep => (
                  <button key={dep.key} type="button" onClick={() => { setTo(dep.email); setError('') }}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                    title={dep.email}>
                    {dep.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">הערה (אופציונלי):</label>
              <textarea className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none" rows={2}
                value={note} onChange={e => setNote(e.target.value)} placeholder="הוסף הערה לפני ההודעה המועברת..." />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
            {fromDept && <p className="text-[11px] text-slate-400">יישלח מהכתובת {fromDept.email}</p>}

            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500">ביטול</button>
              <button onClick={forward} disabled={sending || !to.trim()}
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
          sourceUrl: attachment.url,
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
        {attachments.map((att, i) => {
          // קישור ההורדה/צפייה: מיילים נכנסים (Resend) נשמרים ב-Supabase storage עם url ישיר,
          // מיילים מ-Gmail נטענים דרך ה-API לפי attachmentId / inlineData
          const href = att.url
            ? docViewUrl(att.url)
            : att.inlineData
              ? `/api/admin/gmail/attachment?messageId=${messageId}&inlineData=${encodeURIComponent(att.inlineData)}&filename=${encodeURIComponent(att.filename)}&mimeType=${encodeURIComponent(att.mimeType)}`
              : `/api/admin/gmail/attachment?messageId=${messageId}&attachmentId=${att.attachmentId}&filename=${encodeURIComponent(att.filename)}&mimeType=${encodeURIComponent(att.mimeType)}`
          // הורדה ישירה למחשב: מסמכים בדלי 'documents' עוברים דרך docDownloadUrl (dl=1 → Content-Disposition
          // attachment), כי תכונת ה-download לבדה מתעלמת ב-redirect ל-signed URL חוצה-מקור. צרופות Gmail
          // מוגשות ממילא עם Content-Disposition: attachment דרך אותו endpoint.
          const downloadHref = att.url ? docDownloadUrl(att.url, att.filename) : href
          return (
            <div key={att.attachmentId || att.url || `${att.filename}-${i}`}
              className="flex flex-col gap-1.5 bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-700">
              <DocThumb href={href} rawUrl={att.url} name={att.filename} mimeType={att.mimeType} size={96} />
              <div className="flex items-center gap-1">
                <span className="truncate max-w-[96px]" title={att.filename}>{att.filename}</span>
                {att.size > 0 && <span className="text-slate-400 flex-shrink-0">{formatBytes(att.size)}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <a href={href} target="_blank" rel="noopener noreferrer"
                  className="p-0.5 text-slate-400 hover:text-indigo-600 transition-colors" title="צפה">
                  <ExternalLink size={13} />
                </a>
                <a href={downloadHref} download={att.filename}
                  className="p-0.5 text-slate-400 hover:text-emerald-600 transition-colors" title="הורדה למחשב">
                  <Download size={13} />
                </a>
                <button onClick={() => setAssigning(att)}
                  className="p-0.5 text-slate-400 hover:text-green-600 transition-colors" title="שייך לצאצא">
                  <FolderOpen size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {assigning && <AssignAttachmentModal attachment={assigning} messageId={messageId} senderEmail={senderEmail} onClose={() => setAssigning(null)} />}
    </div>
  )
}

// ─── Legacy archive: manual beneficiary assignment modal ──────────────────────

interface BeneficiarySearchResult { id: string; full_name: string; family_name?: string; email?: string; phone?: string; city?: string }

function AssignBeneficiaryModal({ messageId, onClose, onAssigned }: {
  messageId: string; onClose: () => void; onAssigned: () => void
}) {
  const toast = useToast()
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<BeneficiarySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving]   = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/beneficiary-search?q=${encodeURIComponent(q)}&limit=8`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  const handleQueryChange = (v: string) => {
    setQuery(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearch(v), 250)
  }

  useEffect(() => {
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [])

  const assign = async (beneficiaryId: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/mail/assign-beneficiary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, beneficiaryId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        toast.error(data.error || 'שגיאה בשיוך המייל')
        return
      }
      toast.success('שויך בהצלחה')
      onAssigned()
      onClose()
    } catch {
      toast.error('שגיאת רשת. נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="שייך מייל ללקוח" size="md">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-400">
            {searching
              ? <Loader2 size={14} className="animate-spin text-slate-400 flex-shrink-0" />
              : <Search size={14} className="text-slate-400 flex-shrink-0" />}
            <input
              className="flex-1 text-sm outline-none"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="שם, ת.ז. או טלפון..."
              autoFocus
              autoComplete="off"
            />
            {query && <button onClick={() => { setQuery(''); setResults([]) }} className="text-slate-300 hover:text-slate-600"><X size={13} /></button>}
          </div>
        </div>

        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {results.length === 0 && query.trim().length >= 2 && !searching && (
            <p className="text-xs text-slate-400 text-center py-3">לא נמצאו תוצאות</p>
          )}
          {results.map(r => (
            <button key={r.id} type="button" disabled={saving}
              onClick={() => assign(r.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-right rounded-lg border border-slate-100 hover:bg-indigo-50 hover:border-indigo-200 disabled:opacity-50">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                {(r.family_name || r.full_name || '?').charAt(0)}
              </div>
              <div className="min-w-0 text-right flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{[r.family_name, r.full_name].filter(Boolean).join(' ')}</p>
                <p className="text-xs text-slate-400 truncate">
                  {[r.phone, r.city].filter(Boolean).join(' · ') || r.email || ''}
                </p>
              </div>
              {saving && <Loader2 size={14} className="animate-spin text-indigo-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function BeneficiaryCard({ email }: { email: string }) {
  const [ben, setBen] = useState<Beneficiary | null>(null)
  const [loading, setLoading] = useState(true)
  const [cardOpen, setCardOpen] = useState(false)

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
        <button type="button" onClick={() => setCardOpen(true)}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
          פתח כרטיס <ExternalLink size={11} />
        </button>
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

      {/* כרטיס הצאצא — פופאפ באותו חלון (במקום כרטיסייה חדשה) */}
      {cardOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl"
          onClick={() => setCardOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
              <h2 className="font-bold text-slate-900 text-sm">כרטיס צאצא — {name}</h2>
              <div className="flex items-center gap-3">
                <Link href={`/admin/beneficiaries/${ben.id}`} target="_blank"
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                  פתח בעמוד מלא <ExternalLink size={11} />
                </Link>
                <button type="button" onClick={() => setCardOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
            </div>
            <iframe src={`/admin/beneficiaries/${ben.id}`} title="כרטיס צאצא" className="flex-1 w-full border-0" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Labels & per-message actions ───────────────────────────────────────────────

type LabelDef = { id: string; name: string; color: string }

function LabelChips({ ids, defs }: { ids?: string[]; defs: LabelDef[] }) {
  if (!ids?.length) return null
  return (
    <>
      {ids.map(id => {
        const l = defs.find(d => d.id === id)
        if (!l) return null
        return (
          <span key={id} className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${l.color}22`, color: l.color }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />{l.name}
          </span>
        )
      })}
    </>
  )
}

function MailExtraActions({ msg, folder, labelDefs, onToggleLabel, onCreateLabel, onSetSpam, onSetFollowUp }: {
  msg: ParsedMessage
  folder: string
  labelDefs: LabelDef[]
  onToggleLabel: (msg: ParsedMessage, labelId: string) => void
  onCreateLabel: (name: string) => Promise<string | null>
  onSetSpam: (msg: ParsedMessage, isSpam: boolean) => void
  onSetFollowUp: (msg: ParsedMessage, at: string | null) => void
}) {
  const [menu, setMenu] = useState<null | 'label' | 'follow'>(null)
  const [newLabel, setNewLabel] = useState('')
  const assigned = new Set(msg.labelIds ?? [])
  const isInbound = folder !== 'SENT' && folder !== 'SCHEDULED'

  const quick = () => {
    const now = new Date()
    const todayEve = new Date(now); todayEve.setHours(18, 0, 0, 0)
    if (todayEve.getTime() <= now.getTime()) todayEve.setDate(todayEve.getDate() + 1)
    const tomMorning = new Date(now); tomMorning.setDate(now.getDate() + 1); tomMorning.setHours(9, 0, 0, 0)
    const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7)
    return [
      { label: 'היום 18:00', iso: todayEve.toISOString() },
      { label: 'מחר 09:00', iso: tomMorning.toISOString() },
      { label: 'בעוד שבוע', iso: nextWeek.toISOString() },
    ]
  }

  return (
    <>
      {/* תוויות */}
      <div className="relative">
        <button onClick={() => setMenu(menu === 'label' ? null : 'label')} title="תוויות"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          <Tag size={14} /> תוויות
        </button>
        {menu === 'label' && (
          <div className="absolute z-30 left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-2 max-h-72 overflow-y-auto">
            {labelDefs.length === 0 && <p className="text-xs text-slate-400 text-center py-2">אין תוויות עדיין</p>}
            {labelDefs.map(l => (
              <button key={l.id} onClick={() => onToggleLabel(msg, l.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-right">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-sm text-slate-700 flex-1 truncate">{l.name}</span>
                {assigned.has(l.id) && <CheckCircle2 size={14} className="text-green-600" />}
              </button>
            ))}
            <div className="flex items-center gap-1 mt-1 pt-2 border-t border-slate-100">
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="תווית חדשה..."
                onKeyDown={async e => { if (e.key === 'Enter') { const id = await onCreateLabel(newLabel); if (id) { onToggleLabel(msg, id); setNewLabel('') } } }}
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={async () => { const id = await onCreateLabel(newLabel); if (id) { onToggleLabel(msg, id); setNewLabel('') } }}
                title="צור תווית" className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus size={13} /></button>
            </div>
          </div>
        )}
      </div>

      {/* סימון לטיפול — רק לדואר נכנס */}
      {isInbound && (
        <div className="relative">
          <button onClick={() => setMenu(menu === 'follow' ? null : 'follow')} title="סמן לטיפול בהמשך"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg ${msg.followUpAt ? 'text-amber-700 border-amber-300 bg-amber-50' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            <Flag size={14} /> לטיפול
          </button>
          {menu === 'follow' && (
            <div className="absolute z-30 left-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-2">
              {quick().map(o => (
                <button key={o.label} onClick={() => { onSetFollowUp(msg, o.iso); setMenu(null) }}
                  className="w-full text-right px-2 py-1.5 rounded-lg hover:bg-slate-50 text-sm text-slate-700">{o.label}</button>
              ))}
              <div className="flex items-center gap-1 mt-1 pt-2 border-t border-slate-100">
                <input type="datetime-local" min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
                  onChange={e => { if (e.target.value) { onSetFollowUp(msg, new Date(e.target.value).toISOString()); setMenu(null) } }}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none" />
              </div>
              {msg.followUpAt && (
                <button onClick={() => { onSetFollowUp(msg, null); setMenu(null) }}
                  className="w-full text-right px-2 py-1.5 mt-1 rounded-lg hover:bg-red-50 text-sm text-red-600">בטל סימון לטיפול</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ספאם */}
      {folder === 'SPAM' ? (
        <button onClick={() => onSetSpam(msg, false)} title="הוצא מספאם"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-700 border border-green-200 rounded-lg hover:bg-green-50">
          <ShieldCheck size={14} /> לא ספאם
        </button>
      ) : isInbound ? (
        <button onClick={() => onSetSpam(msg, true)} title="סמן כספאם"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-amber-50 hover:text-amber-700">
          <Ban size={14} /> ספאם
        </button>
      ) : null}
    </>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function MailClient() {
  const [folder, setFolder] = useState('INBOX')
  const [legacySub, setLegacySub] = useState<'unassigned' | 'assigned'>('unassigned')
  const legacySubRef = useRef(legacySub)
  useEffect(() => { legacySubRef.current = legacySub }, [legacySub])
  const [assigningMsgId, setAssigningMsgId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ParsedMessage[]>([])
  const [selected, setSelected] = useState<ParsedMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [compose, setCompose] = useState(false)
  const [replyMsg, setReplyMsg] = useState<ParsedMessage | undefined>()
  const [search, setSearch] = useState('')
  const searchRef = useRef('')
  useEffect(() => { searchRef.current = search }, [search])
  const searchParams = useSearchParams()
  const [activeDepartment, setActiveDepartment] = useState<string | null>(searchParams.get('department'))
  const activeDepartmentRef = useRef<string | null>(searchParams.get('department'))

  // ספירת מיילים שלא נקראו לפי מחלקה
  const [unreadCounts, setUnreadCounts] = useState<{ byDepartment: Record<string, number>; total: number }>({ byDepartment: {}, total: 0 })

  // Beneficiary name lookup
  const [emailToInfo, setEmailToInfo] = useState<Record<string, { name: string; id: string }>>({})

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

  // Labels — קטלוג התוויות (app_settings)
  const [labelDefs, setLabelDefs] = useState<{ id: string; name: string; color: string }[]>([])
  const loadLabels = useCallback(async () => {
    try { const d = await (await fetch('/api/admin/mail/labels')).json(); setLabelDefs(d.labels ?? []) } catch { /* silent */ }
  }, [])
  useEffect(() => { loadLabels() }, [loadLabels])

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
          label_ids: [],
          from_email: msg.fromEmail,
          subject: msg.subject,
        }),
      })
    } catch { /* silent */ }
  }, [])

  // Current user profile — kept in a ref so load() stays stable
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

  const loadUnreadCounts = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/mail/unread-counts')
      const d = await r.json()
      if (!d.error) {
        const counts = { byDepartment: d.byDepartment ?? {}, total: d.total ?? 0 }
        setUnreadCounts(counts)
        // עדכון מיידי של תג ה"לא נקראו" בתפריט הצד (Sidebar) — בלי להמתין לרענון התקופתי
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mail-unread-refresh', { detail: counts }))
      }
    } catch { /* silent */ }
  }, [])

  const load = useCallback(async (f: string, q?: string, silent = false) => {
    // רענון רקע (silent) — לא מציג "טוען מיילים" ולא סוגר את ההודעה הפתוחה
    if (!silent) {
      setLoading(true)
      setLoadError(null)
      setSelected(null)
    }
    // התיבה שנבחרה (מהתפריט/URL) גוברת תמיד — כדי שלא נהיה תלויים בטעינת הפרופיל.
    // אם לא נבחרה תיבה — נופלים לתיבת המשתמש. השרת ממילא אוכף אילו תיבות מותרות למשתמש.
    const dept = activeDepartmentRef.current ?? (myProfileRef.current?.department ?? null)
    const sub = f === 'LEGACY' ? `&sub=${legacySubRef.current}` : ''
    const res = await fetch(`/api/admin/mail/messages?folder=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}${dept ? `&department=${dept}` : ''}${sub}`)
    const data = await res.json()
    if (data.error && !data.messages) {
      setLoadError(data.error)
      setMessages([])
      setLoading(false)
      return
    }
    const msgs: ParsedMessage[] = data.messages ?? []

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
      // רענון תג ה"לא נקראו" (כולל בתפריט הצד) בכל טעינת תיבת דואר — תופס מיילים חדשים
      loadUnreadCounts()
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
  }, [myProfile, loadUnreadCounts])

  // Load unread counts on mount
  useEffect(() => {
    loadUnreadCounts()
  }, [loadUnreadCounts])

  useEffect(() => { load(folder) }, [folder, load])

  // רענון כשמחליפים בין משויכים/לא-משויכים בתוך ארכיון המייל הקודם
  useEffect(() => {
    if (folder === 'LEGACY') load(folder, searchRef.current || undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacySub])

  // Reload when activeDepartment changes
  useEffect(() => {
    activeDepartmentRef.current = activeDepartment
    load(folder)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDepartment])

  // סנכרון לפי פרמטר ה-URL (לחיצה על מחלקה בתפריט הצד)
  useEffect(() => {
    setActiveDepartment(searchParams.get('department'))
  }, [searchParams])

  // רענון מיידי לכל מייל בנפרד — Supabase Realtime: כל הוספה/שינוי בטבלת המיילים
  // (נכנס/יוצא) דוחף עדכון חי למסך. רענון נוסף בחזרה לחלון. אין פולינג — Realtime מספיק.
  useEffect(() => {
    const refresh = () => load(folder, searchRef.current || undefined, true)
    const supabase = createClient()
    // Realtime עלול לפרוץ במקבצים (כולל כתיבות של האפליקציה עצמה — סימון נקרא/ספאם/מעקב) —
    // דוחסים אותם לרענון אחד עם debounce קצר במקום שרשרת רענונים מלאים.
    let t: ReturnType<typeof setTimeout> | null = null
    const debouncedRefresh = () => { if (t) clearTimeout(t); t = setTimeout(refresh, 800) }
    const ch = supabase
      .channel('mail-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbound_emails' }, () => debouncedRefresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sent_emails' }, () => debouncedRefresh())
      .subscribe()
    const onFocus = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      supabase.removeChannel(ch)
      if (t) clearTimeout(t)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [folder, load])

  const openMessage = async (msg: ParsedMessage) => {
    setSelected(msg)
    if (!msg.isRead) {
      await fetch('/api/admin/mail/mark-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msg.id }) })
      setMessages(ms => ms.map(m => m.id === msg.id ? { ...m, isRead: true } : m))
      loadUnreadCounts()
    }
    recordEvent(msg, 'read')
  }

  /** סימון כלא-נקרא — כדי לחזור אליו מאוחר יותר, כמו ב-Gmail. */
  const markUnread = async (msg: ParsedMessage) => {
    await fetch('/api/admin/mail/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: msg.id, read: false }),
    })
    setMessages(ms => ms.map(m => m.id === msg.id ? { ...m, isRead: false } : m))
    setSelected(null)          // סוגרים — אחרת הפתיחה תסמן אותו כנקרא שוב
    loadUnreadCounts()
  }

  const markHandled = (msg: ParsedMessage) => {
    setHandledIds(prev => new Set([...prev, msg.id]))
    recordEvent(msg, 'handled')
  }

  const trashMessage = async (id: string) => {
    await fetch('/api/admin/mail/trash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setMessages(ms => ms.filter(m => m.id !== id))
    if (selected?.id === id) setSelected(null)
    loadUnreadCounts()
  }

  // עדכון מקומי של מייל ברשימה ובתצוגה
  const patchMsg = (id: string, patch: Partial<ParsedMessage>) => {
    setMessages(ms => ms.map(m => m.id === id ? { ...m, ...patch } : m))
    setSelected(s => (s && s.id === id ? { ...s, ...patch } : s))
  }

  // תוויות: הוספה/הסרה למייל
  const toggleLabel = async (msg: ParsedMessage, labelId: string) => {
    const has = (msg.labelIds ?? []).includes(labelId)
    const next = has ? (msg.labelIds ?? []).filter(l => l !== labelId) : [...(msg.labelIds ?? []), labelId]
    patchMsg(msg.id, { labelIds: next })
    try {
      await fetch('/api/admin/mail/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: has ? 'unassign' : 'assign', messageId: msg.id, labelId }) })
    } catch { /* silent */ }
  }

  // יצירת תווית חדשה ידנית; מחזיר את ה-id שנוצר
  const createLabel = async (name: string): Promise<string | null> => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const palette = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#14b8a6']
    const color = palette[labelDefs.length % palette.length]
    try {
      const res = await fetch('/api/admin/mail/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_label', name: trimmed, color }) })
      const d = await res.json()
      if (d.label) { setLabelDefs(defs => [...defs, d.label]); return d.label.id as string }
    } catch { /* silent */ }
    return null
  }

  // ספאם: סימון/ביטול — המייל עובר תיקייה ולכן יוצא מהרשימה הנוכחית
  const setSpam = async (msg: ParsedMessage, isSpam: boolean) => {
    setMessages(ms => ms.filter(m => m.id !== msg.id))
    if (selected?.id === msg.id) setSelected(null)
    try {
      await fetch('/api/admin/mail/spam', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id, isSpam }) })
    } catch { /* silent */ }
    loadUnreadCounts()
  }

  // סימון לטיפול-בהמשך (followUpAt=null לביטול)
  const setFollowUp = async (msg: ParsedMessage, followUpAt: string | null) => {
    patchMsg(msg.id, { followUpAt })
    try {
      await fetch('/api/admin/mail/follow-up', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id, followUpAt }) })
    } catch { /* silent */ }
  }

  const senderDisplay = (msg: ParsedMessage) => {
    const info = emailToInfo[msg.fromEmail]
    if (info) return `${info.name} · ${msg.fromEmail}`
    return msg.from.replace(/<.*>/, '').trim() || msg.fromEmail
  }

  // המחלקה הפעילה להצגה בכותרת: למנהל — לפי הבחירה (activeDepartment),
  // למשתמש רגיל — המחלקה שלו. כש"כל המחלקות" נבחר אצל מנהל — תצוגה מאוחדת.
  const headerDeptKey = myProfile?.role === 'admin'
    ? activeDepartment
    : (myProfile?.department ?? null)
  const headerDept = headerDeptKey ? DEPARTMENTS[headerDeptKey as DepartmentKey] : null
  const headerLabel = headerDept ? headerDept.label : (myProfile?.role === 'admin' ? 'כל המחלקות' : 'משרד ראשי')
  const headerEmail = headerDept ? headerDept.email : (myProfile?.role === 'admin' ? 'כל הכתובות' : 'office@chasamsofer.info')

  // תיבות מורשות למשתמש (לבורר התיבות בתוך המייל). null = ללא הגבלה (מנהל).
  const myAllowedKeys: string[] | null = myProfile?.role === 'admin'
    ? null
    : (myProfile?.allowed_mailboxes && myProfile.allowed_mailboxes.length > 0
        ? myProfile.allowed_mailboxes
        : (myProfile?.department ? [myProfile.department] : null))
  const filterableDepts = myAllowedKeys === null
    ? Object.values(DEPARTMENTS)
    : Object.values(DEPARTMENTS).filter(d => myAllowedKeys.includes(d.key))
  // מציגים בורר תיבות למנהל, או למשתמש מוגבל עם יותר מתיבה אחת
  const showDeptFilter = myProfile?.role === 'admin' || filterableDepts.length > 1

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 bg-slate-50 border-l border-slate-200 hidden md:flex flex-col">

        {/* Account header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Mail size={16} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 truncate leading-tight">{headerLabel}</p>
              <p className="text-[11px] text-indigo-500 truncate font-medium">{headerEmail}</p>
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
            <button key={key} onClick={() => { setFolder(key); setSelected(null) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-right ${folder === key ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon size={16} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Departments filter — admins: כל המחלקות; משתמש מוגבל עם כמה תיבות: התיבות שלו */}
        {showDeptFilter && (
          <nav className="px-2 py-2 border-b border-slate-100">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2 pb-1.5">{myProfile?.role === 'admin' ? 'מחלקות' : 'התיבות שלי'}</p>
            <button onClick={() => setActiveDepartment(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-right mb-0.5
                ${!activeDepartment ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
              <span className="flex-1 truncate">{myProfile?.role === 'admin' ? 'כל המחלקות' : 'כל התיבות שלי'}</span>
              {unreadCounts.total > 0 && (
                <span className="text-[10px] font-bold bg-indigo-600 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center flex-shrink-0">
                  {unreadCounts.total}
                </span>
              )}
            </button>
            {filterableDepts.map(d => {
              const cnt = unreadCounts.byDepartment[d.key] ?? 0
              return (
                <button key={d.key} onClick={() => setActiveDepartment(d.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-right
                    ${activeDepartment === d.key ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <span className="truncate flex-1">{d.label}</span>
                  {cnt > 0 && (
                    <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center flex-shrink-0 text-white"
                      style={{ backgroundColor: d.color }}>
                      {cnt}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        )}

        {/* מרווח גמיש (התוויות הוסרו — ההפניה למחלקות מחליפה אותן) */}
        <div className="flex-1 overflow-y-auto px-2 py-2" />

        <div className="px-2 pb-2 border-t border-slate-200 pt-2 flex flex-col gap-0.5">
          <Link href="/admin/mail/stats"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors">
            <BarChart2 size={13} /> ניטור וסטטיסטיקות
          </Link>
        </div>
      </div>

      {/* Message List */}
      {/* במובייל: רשימה במסך מלא; כשנבחרה הודעה — תצוגת ההודעה תופסת את כל המסך (חזרה ב-X) */}
      <div className={`flex-col border-l border-slate-200 ${selected ? 'hidden md:flex md:w-72 md:flex-shrink-0' : 'flex flex-1'}`}>
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

        {folder === 'LEGACY' && (
          <div className="flex gap-3 px-4 py-2 border-b border-slate-100 text-sm">
            <button type="button" onClick={() => setLegacySub('unassigned')}
              className={legacySub === 'unassigned' ? 'font-bold text-indigo-600' : 'text-slate-500 hover:text-slate-700'}>לא משויכים</button>
            <button type="button" onClick={() => setLegacySub('assigned')}
              className={legacySub === 'assigned' ? 'font-bold text-indigo-600' : 'text-slate-500 hover:text-slate-700'}>משויכים</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> טוען מיילים...
            </div>
          ) : (
            (() => {
              const filtered = messages
              if (loadError) return (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-6">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <Mail size={18} className="text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-600">שגיאה בטעינת המיילים</p>
                    <p className="text-xs text-slate-400 mt-1">ייתכן שטבלאות המייל לא הוגדרו עדיין ב-Supabase. הרץ את migration ב-SQL Editor.</p>
                  </div>
                </div>
              )
              return filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-400">
                  <Mail size={24} /><span className="text-sm">אין הודעות</span>
                </div>
              ) : filtered.map(msg => {
                // המחלקה של ההודעה: נכנס לפי כתובת היעד, יוצא לפי כתובת השולח
                const msgDept = departmentByEmail(folder === 'SENT' ? msg.fromEmail : msg.toEmail)
                return (
                  <div key={msg.id}
                    className={`group flex items-stretch border-b border-slate-100 transition-colors
                      ${selected?.id === msg.id ? 'bg-indigo-50 border-r-2 border-r-indigo-500'
                        : !msg.isRead ? 'bg-indigo-50/40 hover:bg-indigo-50/70'
                        : 'hover:bg-slate-50'}`}>
                    <button className="flex-1 min-w-0 text-right px-4 py-3" onClick={() => openMessage(msg)}>
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span className="flex items-center gap-2 min-w-0">
                          {!msg.isRead && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" title="לא נקרא" />}
                          <span className={`text-sm truncate leading-tight ${!msg.isRead ? 'font-bold text-slate-900' : 'font-normal text-slate-500'}`}>
                            {folder === 'SENT'
                              ? (emailToInfo[msg.toEmail]
                                  ? `${emailToInfo[msg.toEmail].name} · ${msg.toEmail}`
                                  : msg.to)
                              : senderDisplay(msg)}
                          </span>
                        </span>
                        <span className={`text-sm flex-shrink-0 tabular-nums ${!msg.isRead ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}>{formatDate(msg.date)}</span>
                      </div>
                      <p className={`text-xs truncate mb-0.5 ${!msg.isRead ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>{msg.subject}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {/* תווית מחלקה — מוצגת בתצוגת "כל המחלקות" */}
                        {!activeDepartment && msgDept && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                            style={{ backgroundColor: msgDept.color }} title={msgDept.email}>
                            {msgDept.label}
                          </span>
                        )}
                        {/* סימון לטיפול */}
                        {msg.followUpAt && (
                          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${msg.followUpAt <= new Date().toISOString() ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`} title="לטיפול">
                            <Flag size={10} /> {formatDate(msg.followUpAt)}
                          </span>
                        )}
                        {/* מועד תזמון */}
                        {folder === 'SCHEDULED' && msg.scheduledAt && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0" title="יישלח במועד">
                            <Clock size={10} /> {formatDate(msg.scheduledAt)}
                          </span>
                        )}
                        {/* תוויות */}
                        <LabelChips ids={msg.labelIds} defs={labelDefs} />
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
                        <p className={`text-xs truncate ${!msg.isRead ? 'text-slate-600' : 'text-slate-400'}`}>{msg.snippet}</p>
                      </div>
                    </button>
                    {/* עמודת פעולות נפרדת — אינה חופפת את התוכן */}
                    <div className="flex flex-col items-center justify-center gap-1 w-9 flex-shrink-0 border-r border-slate-100 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
                      {folder === 'LEGACY' && !msg.beneficiaryId && (
                        <button
                          onClick={e => { e.stopPropagation(); setAssigningMsgId(msg.id) }}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                          title="שייך ללקוח">
                          <UserPlus size={14} />
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); trashMessage(msg.id) }}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                        title="מחק">
                        <Trash2 size={14} />
                      </button>
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
              <h2 className="font-semibold text-slate-900 text-base break-words whitespace-pre-wrap" title={selected.subject}>{selected.subject}</h2>
              {(selected.labelIds ?? []).length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mt-1"><LabelChips ids={selected.labelIds} defs={labelDefs} /></div>
              )}
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
            <div className="flex items-center gap-2 flex-wrap justify-end">
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
              {/* סימון כלא-נקרא — כמו ב-Gmail, כדי לחזור אליו אחר כך */}
              <button onClick={() => markUnread(selected)}
                title="סמן כלא נקרא"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <Mail size={14} /> סמן כלא נקרא
              </button>
              <button onClick={() => setForwardMsg(selected)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <Forward size={14} /> העבר
              </button>
              {folder === 'LEGACY' && !selected.beneficiaryId && (
                <button onClick={() => setAssigningMsgId(selected.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                  <UserPlus size={14} /> שייך ללקוח
                </button>
              )}
              <MailExtraActions msg={selected} folder={folder} labelDefs={labelDefs}
                onToggleLabel={toggleLabel} onCreateLabel={createLabel} onSetSpam={setSpam} onSetFollowUp={setFollowUp} />
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
            {(() => {
              const safe = sanitizeEmailHtml(selected.body || '')
              if (safe.replace(/<[^>]*>/g, '').trim()) {
                return <div className="px-6 py-5 text-sm text-slate-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: safe }} />
              }
              // נפילה-לאחור: אם ה-HTML ריק לאחר סניטציה — מציגים את גוף הטקסט הגולמי
              const fallback = (selected.bodyText || selected.snippet || '').trim()
              return fallback
                ? <div className="px-6 py-5 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{fallback}</div>
                : <div className="px-6 py-10 text-sm text-slate-400 text-center">לא נמצא תוכן בגוף ההודעה.</div>
            })()}
            <AttachmentBar attachments={selected.attachments ?? []} messageId={selected.id} senderEmail={selected.fromEmail} />
            {folder === 'INBOX' && <BeneficiaryCard email={selected.fromEmail} />}
          </div>
        </div>
      )}


      {compose && <ComposeModal
        onClose={() => setCompose(false)}
        replyTo={replyMsg}
        department={
          // בתשובה: שולחים מהמחלקה שאליה הגיע המייל המקורי.
          // בחיבור חדש: מהמחלקה שעליה עומדים כעת (מנהל) או ממחלקת המשתמש.
          (replyMsg && Object.values(DEPARTMENTS).find(d => d.email === replyMsg.toEmail)?.key)
          ?? activeDepartment
          ?? myProfile?.department
          ?? undefined
        }
      />}
      {forwardMsg && <ForwardModal msg={forwardMsg} onClose={() => setForwardMsg(null)} />}
      {assigningMsgId && (
        <AssignBeneficiaryModal
          messageId={assigningMsgId}
          onClose={() => setAssigningMsgId(null)}
          onAssigned={() => load(folder, search)}
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
