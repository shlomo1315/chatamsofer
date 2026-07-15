'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Users, History, Plus, Trash2, Pencil, Loader2, X, Search, Mail, Check,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

interface Member {
  id: string
  email: string
  family_name: string
  full_name: string
  city: string
  phone: string
}

interface Campaign {
  id: string
  name: string
  subject: string
  status: string
  total_count: number
  sent_count: number
  failed_count: number
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:     { label: 'טיוטה',   color: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'מתוזמן',  color: 'bg-sky-100 text-sky-700' },
  sending:   { label: 'בשליחה',  color: 'bg-amber-100 text-amber-700' },
  paused:    { label: 'מושהה',   color: 'bg-orange-100 text-orange-700' },
  sent:      { label: 'נשלח',    color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'בוטל',    color: 'bg-slate-100 text-slate-400' },
  failed:    { label: 'נכשל',    color: 'bg-rose-100 text-rose-700' },
}

const PAGE = 50

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL')
}

export default function GroupDetail({ groupId, initialName }: { groupId: string; initialName: string }) {
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()

  const name = initialName
  const [tab, setTab] = useState<'members' | 'history'>('members')

  // ── חברים ──
  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)   // חבר בעריכה
  const [adding, setAdding] = useState(false)
  const reqId = useRef(0)

  // ── היסטוריה ──
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadMembers = useCallback(async (search: string, offset: number) => {
    const id = ++reqId.current
    if (offset === 0) setLoadingMembers(true); else setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/admin/newsletter/contacts/${groupId}/members?q=${encodeURIComponent(search)}&limit=${PAGE}&offset=${offset}`,
      )
      const d = await res.json()
      if (id !== reqId.current) return
      setTotal(d.total ?? 0)
      setMembers(prev => (offset === 0 ? (d.members ?? []) : [...prev, ...(d.members ?? [])]))
    } catch { /* ignore */ }
    finally {
      if (id === reqId.current) { setLoadingMembers(false); setLoadingMore(false) }
    }
  }, [groupId])

  // חיפוש עם debounce
  useEffect(() => {
    const t = setTimeout(() => { void loadMembers(q, 0) }, 300)
    return () => clearTimeout(t)
  }, [q, loadMembers])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/admin/newsletter/contacts/${groupId}/history`)
      const d = await res.json()
      setCampaigns(d.campaigns ?? [])
    } catch { setCampaigns([]) }
    finally { setLoadingHistory(false) }
  }, [groupId])

  useEffect(() => {
    if (tab !== 'history' || campaigns !== null) return
    const t = setTimeout(() => { void loadHistory() }, 0)
    return () => clearTimeout(t)
  }, [tab, campaigns, loadHistory])

  async function removeMember(m: Member) {
    if (!(await confirm({
      title: 'הסרת חבר',
      message: `להסיר את ${m.email} מהקבוצה?`,
      danger: true,
      confirmLabel: 'הסר',
    }))) return
    try {
      const res = await fetch(`/api/admin/newsletter/contacts/${groupId}/members/${m.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'ההסרה נכשלה')
      setMembers(ms => ms.filter(x => x.id !== m.id))
      setTotal(t => Math.max(0, t - 1))
      toast.success('החבר הוסר')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    }
  }

  const displayName = (m: Member) =>
    [m.family_name, m.full_name].filter(Boolean).join(' ') || '—'

  return (
    <div>
      {confirmDialog}

      {/* כותרת */}
      <div className="mb-5 flex items-center gap-2.5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <Users size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{name}</h1>
          <p className="text-sm text-slate-500">{total.toLocaleString('he-IL')} חברים בקבוצה</p>
        </div>
      </div>

      {/* טאבים */}
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        <TabButton active={tab === 'members'} onClick={() => setTab('members')} icon={<Users size={15} />} label="חברים" />
        <TabButton active={tab === 'history'} onClick={() => setTab('history')} icon={<History size={15} />} label="היסטוריית שליחות" />
      </div>

      {tab === 'members' ? (
        <div>
          {/* סרגל פעולות */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-56">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="חיפוש לפי שם, מייל, עיר או טלפון…"
                className="w-full rounded-xl border border-slate-300 py-2 pr-9 pl-3 text-sm
                           focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2
                         text-sm font-bold text-white transition hover:bg-indigo-700"
            >
              <Plus size={15} /> הוספת חבר
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {loadingMembers ? (
              <div className="flex items-center justify-center gap-2 p-12 text-slate-400">
                <Loader2 size={18} className="animate-spin" /> טוען…
              </div>
            ) : !members.length ? (
              <div className="p-12 text-center text-sm text-slate-400">
                {q ? 'לא נמצאו חברים תואמים' : 'אין עדיין חברים בקבוצה — הוסיפו את הראשון'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr className="text-right text-xs text-slate-500">
                    <th className="px-4 py-3 font-semibold">שם</th>
                    <th className="px-4 py-3 font-semibold">מייל</th>
                    <th className="px-4 py-3 font-semibold">עיר</th>
                    <th className="px-4 py-3 font-semibold">טלפון</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{displayName(m)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{m.email}</td>
                      <td className="px-4 py-2.5 text-slate-500">{m.city || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{m.phone || '—'}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <button type="button" onClick={() => setEditing(m)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="עריכה">
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => removeMember(m)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="הסרה">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {members.length < total && (
              <div className="border-t border-slate-100 p-3 text-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => loadMembers(q, members.length)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2
                             text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                  טען עוד ({(total - members.length).toLocaleString('he-IL')} נותרו)
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {loadingHistory ? (
            <div className="flex items-center justify-center gap-2 p-12 text-slate-400">
              <Loader2 size={18} className="animate-spin" /> טוען…
            </div>
          ) : !campaigns?.length ? (
            <div className="p-12 text-center">
              <Mail size={24} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">לא נשלחו עדיין מיילים לקבוצה הזו</p>
              <p className="mt-1 text-xs text-slate-400">כל דיוור שתשלחו לקבוצה יופיע כאן</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr className="text-right text-xs text-slate-500">
                  <th className="px-4 py-3 font-semibold">תאריך</th>
                  <th className="px-4 py-3 font-semibold">שם הדיוור</th>
                  <th className="px-4 py-3 font-semibold">נושא</th>
                  <th className="px-4 py-3 font-semibold">סטטוס</th>
                  <th className="px-4 py-3 font-semibold">נשלחו</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map(c => {
                  const meta = STATUS_META[c.status] ?? STATUS_META.draft
                  const when = c.completed_at ?? c.started_at ?? c.scheduled_at ?? c.created_at
                  return (
                    <tr key={c.id} className="cursor-pointer transition hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <Link href={`/admin/newsletter/${c.id}`} className="block">{fmtDate(when)}</Link>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        <Link href={`/admin/newsletter/${c.id}`} className="block">{c.name}</Link>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-500">
                        <Link href={`/admin/newsletter/${c.id}`} className="line-clamp-1 block">{c.subject}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {['sent', 'sending', 'paused'].includes(c.status) ? (
                          <span>
                            <strong className="text-slate-800">{c.sent_count.toLocaleString('he-IL')}</strong>
                            <span className="text-slate-400"> / {c.total_count.toLocaleString('he-IL')}</span>
                            {c.failed_count > 0 && (
                              <span className="mr-1.5 text-xs text-rose-600">({c.failed_count} נכשלו)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(adding || editing) && (
        <MemberModal
          groupId={groupId}
          member={editing}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={(saved, isNew) => {
            setAdding(false); setEditing(null)
            if (isNew) {
              setMembers(ms => [saved, ...ms])
              setTotal(t => t + 1)
            } else {
              setMembers(ms => ms.map(x => (x.id === saved.id ? saved : x)))
            }
          }}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? 'border-indigo-600 text-indigo-700'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon} {label}
    </button>
  )
}

// ── מודל הוספה / עריכה של חבר ──
function MemberModal({ groupId, member, onClose, onSaved }: {
  groupId: string
  member: Member | null
  onClose: () => void
  onSaved: (m: Member, isNew: boolean) => void
}) {
  const isNew = !member
  const [email, setEmail] = useState(member?.email ?? '')
  const [familyName, setFamilyName] = useState(member?.family_name ?? '')
  const [fullName, setFullName] = useState(member?.full_name ?? '')
  const [city, setCity] = useState(member?.city ?? '')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    const e = email.trim().toLowerCase()
    if (!e.includes('@') || !e.includes('.')) { setError('כתובת מייל לא תקינה'); return }
    setSaving(true)
    setError('')
    try {
      const url = isNew
        ? `/api/admin/newsletter/contacts/${groupId}/members`
        : `/api/admin/newsletter/contacts/${groupId}/members/${member!.id}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: e, family_name: familyName, full_name: fullName, city, phone,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'השמירה נכשלה')
      const saved: Member = d.member ?? {
        id: member!.id, email: e, family_name: familyName, full_name: fullName, city, phone,
      }
      onSaved(saved, isNew)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-slate-800">{isNew ? 'הוספת חבר' : 'עריכת חבר'}</h3>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="סגירה">
            <X size={17} />
          </button>
        </div>

        <div className="grid gap-3">
          <Field label="מייל" value={email} onChange={setEmail} type="email" autoFocus placeholder="name@example.com" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="שם משפחה" value={familyName} onChange={setFamilyName} />
            <Field label="שם פרטי" value={fullName} onChange={setFullName} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="עיר" value={city} onChange={setCity} />
            <Field label="טלפון" value={phone} onChange={setPhone} />
          </div>
        </div>

        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="mt-5 flex justify-start gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={save} disabled={saving || !email.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5
                       text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {isNew ? 'הוספה' : 'שמירה'}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold
                       text-slate-600 transition hover:bg-slate-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', autoFocus, placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; autoFocus?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      <input
        type={type}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                   focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  )
}
