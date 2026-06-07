'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Inbox, Send, RefreshCw, PenSquare, Mail, Search, X,
  ChevronLeft, Loader2, Reply, User, Phone, MapPin,
  CheckCircle2, ExternalLink, Forward, Tag, Plus, Trash2, Settings,
} from 'lucide-react'
import { ParsedMessage } from '@/lib/gmail'
import { Beneficiary, ELIGIBILITY_LABELS, type Profile } from '@/types'

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
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
  } catch { return raw }
}

// ─── Compose Modal ────────────────────────────────────────────────────────────

function ComposeModal({ onClose, replyTo, initialTo }: { onClose: () => void; replyTo?: ParsedMessage; initialTo?: string }) {
  const [to, setTo] = useState(initialTo ?? (replyTo ? replyTo.fromEmail : ''))
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentInfo, setSentInfo] = useState<{ to: string; body: string } | null>(null)
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
      body: JSON.stringify({ to, subject, body: body.replace(/\n/g, '<br/>'), threadId: replyTo?.threadId }),
    })
    setSending(false)
    setSentInfo({ to, body })
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
            <p className="font-medium text-slate-800">{sentInfo.to}</p>
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
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-right hover:bg-indigo-50"
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

          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <span className="text-xs text-slate-400 w-10 flex-shrink-0">נושא:</span>
            <input className="flex-1 text-sm outline-none" value={subject} onChange={e => setSubject(e.target.value)} placeholder="נושא המייל..." />
          </div>

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
  const [tab, setTab] = useState<'labels' | 'emails'>('labels')

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
          {([['labels', 'תוויות מחלקות'], ['emails', 'מיילים פנימיים']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === k ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
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
                <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                  value={newEmailAddr} onChange={e => setNewEmailAddr(e.target.value)} placeholder="כתובת מייל..." type="email" />
                <button onClick={addEmail} disabled={!newEmailName.trim() || !newEmailAddr.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 self-start">
                  <Plus size={14} /> הוסף
                </button>
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

  const load = useCallback(async (f: string, q?: string) => {
    setLoading(true)
    setSelected(null)
    const res = await fetch(`/api/admin/gmail/messages?folder=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
    const data = await res.json()
    if (data.notConnected) { setNotConnected(true); setLoading(false); return }
    const msgs: ParsedMessage[] = data.messages ?? []
    setMessages(msgs)

    // batch resolve sender names
    const uniqueEmails = [...new Set(msgs.map(m => m.fromEmail).filter(Boolean))]
    if (uniqueEmails.length > 0) {
      const r = await fetch(`/api/admin/beneficiary-search?emails=${encodeURIComponent(uniqueEmails.join(','))}&limit=50`)
      const d = await r.json()
      const map: Record<string, { name: string; id: string }> = {}
      for (const b of d.results ?? []) if (b.email) map[b.email] = { name: b.name, id: b.id }
      setEmailToInfo(map)
    }

    setLoading(false)
  }, [])

  // Load labels on mount
  useEffect(() => {
    fetch('/api/admin/mail/labels').then(r => r.json()).then(d => {
      setLabels(d.labels ?? [])
      setAssignments(d.assignments ?? {})
      setInternalEmails(d.internalEmails ?? [])
    })
  }, [])

  useEffect(() => { load(folder) }, [folder, load])

  const openMessage = async (msg: ParsedMessage) => {
    setSelected(msg)
    setOpenLabelFor(null)
    if (!msg.isRead) {
      await fetch('/api/admin/gmail/mark-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msg.id }) })
      setMessages(ms => ms.map(m => m.id === msg.id ? { ...m, isRead: true } : m))
    }
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
      <div className="w-48 flex-shrink-0 bg-slate-50 border-l border-slate-200 flex flex-col">
        <div className="px-3 pt-3 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2 px-1 py-1.5 mb-2">
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Mail size={14} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">משרד ראשי</p>
              <p className="text-[10px] text-slate-400 truncate">office@chasamsofer.info</p>
            </div>
          </div>
          <button
            onClick={() => { setCompose(true); setReplyMsg(undefined) }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <PenSquare size={15} />
            מייל חדש
          </button>
        </div>
        <nav className="flex-1 px-2 py-2">
          {FOLDER_ITEMS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setFolder(key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-right ${folder === key ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon size={16} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>
        <div className="px-2 pb-2 border-t border-slate-200 pt-2">
          <button onClick={() => setShowManageLabels(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors">
            <Settings size={13} /> הגדרות מייל
          </button>
          {labels.length > 0 && (
            <div className="px-2 pt-2 flex flex-col gap-0.5">
              {labels.map(l => (
                <button key={l.id} className="flex items-center gap-1.5 py-0.5 text-xs text-slate-600 hover:text-slate-900 w-full text-right">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                  {l.name}
                </button>
              ))}
            </div>
          )}
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

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> טוען מיילים...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-400">
              <Mail size={24} /><span className="text-sm">אין הודעות</span>
            </div>
          ) : (
            messages.map(msg => {
              const msgLabels = (assignments[msg.id] ?? []).map(id => labels.find(l => l.id === id)).filter(Boolean) as MailLabel[]
              return (
                <div key={msg.id}
                  className={`relative border-b border-slate-100 hover:bg-slate-50 transition-colors ${selected?.id === msg.id ? 'bg-indigo-50 border-r-2 border-r-indigo-500' : ''}`}>
                  <button className="w-full text-right px-4 py-3" onClick={() => openMessage(msg)}>
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span className={`text-sm truncate leading-tight ${!msg.isRead ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                        {folder === 'SENT' ? msg.to : senderDisplay(msg)}
                      </span>
                      <span className="text-[11px] text-slate-400 flex-shrink-0">{formatDate(msg.date)}</span>
                    </div>
                    <p className={`text-xs truncate mb-0.5 ${!msg.isRead ? 'font-medium text-slate-700' : 'text-slate-500'}`}>{msg.subject}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {msgLabels.map(l => (
                        <span key={l.id} className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: l.color }}>{l.name}</span>
                      ))}
                      {msgLabels.length === 0 && <p className="text-xs text-slate-400 truncate">{msg.snippet}</p>}
                    </div>
                  </button>
                  <div className="absolute top-2 left-2">
                    <div className="relative">
                      <button
                        onClick={e => { e.stopPropagation(); setOpenLabelFor(openLabelFor === msg.id ? null : msg.id) }}
                        className="p-1 text-slate-300 hover:text-slate-600 rounded transition-colors"
                        title="תוויות">
                        <Tag size={12} />
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
          )}
        </div>
      </div>

      {/* Message View */}
      {selected && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900 text-base truncate">{selected.subject}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {emailToInfo[selected.fromEmail]
                  ? <><span className="font-medium text-slate-700">{emailToInfo[selected.fromEmail].name}</span> · {selected.fromEmail}</>
                  : selected.from
                } · {formatDate(selected.date)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setReplyMsg(selected); setCompose(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                <Reply size={14} /> השב
              </button>
              <button onClick={() => setForwardMsg(selected)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <Forward size={14} /> העבר
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
                  return <span key={id} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: l.color }}>{l.name}</span>
                })}
              </div>
            )}
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
      {forwardMsg && <ForwardModal msg={forwardMsg} internalEmails={internalEmails} onClose={() => setForwardMsg(null)} />}
      {showManageLabels && (
        <ManageLabelsModal
          labels={labels}
          internalEmails={internalEmails}
          onSaved={(l, e) => { setLabels(l); setInternalEmails(e) }}
          onClose={() => setShowManageLabels(false)}
        />
      )}
    </div>
  )
}
