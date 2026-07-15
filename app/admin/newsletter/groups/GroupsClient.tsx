'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users, Plus, Trash2, Pencil, Loader2, X, Check, Upload, ChevronLeft,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

interface Group {
  id: string
  name: string
  count: number
  created_at: string
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL')
}

export default function GroupsClient() {
  const router = useRouter()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()

  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  // עריכת שם בתוך השורה
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/newsletter/contacts')
      const d = await res.json()
      setGroups(d.lists ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  async function rename(id: string) {
    const name = editName.trim()
    if (!name) return
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/newsletter/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שינוי השם נכשל')
      setGroups(gs => gs.map(g => (g.id === id ? { ...g, name } : g)))
      setEditId(null)
      toast.success('השם עודכן')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally { setBusy(null) }
  }

  async function remove(g: Group) {
    if (!(await confirm({
      title: 'מחיקת קבוצה',
      message: `למחוק את הקבוצה "${g.name}"?\nכל ${g.count.toLocaleString('he-IL')} החברים בה יימחקו. הפעולה אינה הפיכה.`,
      danger: true,
      confirmLabel: 'מחק',
    }))) return

    setBusy(g.id)
    try {
      const res = await fetch(`/api/admin/newsletter/contacts/${g.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'המחיקה נכשלה')
      setGroups(gs => gs.filter(x => x.id !== g.id))
      toast.success('הקבוצה נמחקה')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally { setBusy(null) }
  }

  return (
    <div>
      {confirmDialog}

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5
                     text-sm font-bold text-white transition hover:bg-indigo-700"
        >
          <Plus size={16} /> קבוצה חדשה
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-14 text-slate-400">
          <Loader2 size={18} className="animate-spin" /> טוען…
        </div>
      ) : !groups.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center">
          <Users size={26} className="mx-auto mb-3 text-slate-300" />
          <p className="mb-1 font-semibold text-slate-600">אין עדיין קבוצות</p>
          <p className="mb-5 text-sm text-slate-400">צרו קבוצה ראשונה כדי לנהל רשימת תפוצה</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5
                       text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            <Plus size={16} /> קבוצה חדשה
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr className="text-right text-xs text-slate-500">
                <th className="px-4 py-3 font-semibold">שם הקבוצה</th>
                <th className="px-4 py-3 font-semibold">חברים</th>
                <th className="px-4 py-3 font-semibold">נוצרה</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map(g => {
                const isBusy = busy === g.id
                const editing = editId === g.id
                return (
                  <tr
                    key={g.id}
                    className={`transition hover:bg-slate-50 ${isBusy ? 'opacity-50' : ''} ${editing ? '' : 'cursor-pointer'}`}
                    onClick={() => !editing && !isBusy && router.push(`/admin/newsletter/groups/${g.id}`)}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {editing ? (
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') rename(g.id)
                              if (e.key === 'Escape') setEditId(null)
                            }}
                            className="w-56 rounded-lg border border-indigo-300 px-2.5 py-1.5 text-sm
                                       focus:border-indigo-500 focus:outline-none"
                          />
                          <button type="button" onClick={() => rename(g.id)}
                            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" title="שמור">
                            <Check size={16} />
                          </button>
                          <button type="button" onClick={() => setEditId(null)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title="ביטול">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Users size={15} className="text-slate-400" />
                          {g.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{g.count.toLocaleString('he-IL')}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{fmt(g.created_at)}</td>
                    <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                      {!editing && (
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            onClick={() => { setEditId(g.id); setEditName(g.name) }}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            title="שינוי שם"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(g)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="מחיקה"
                          >
                            <Trash2 size={15} />
                          </button>
                          <ChevronLeft size={16} className="text-slate-300" />
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={async (id) => {
            setShowCreate(false)
            await load()
            router.push(`/admin/newsletter/groups/${id}`)
          }}
        />
      )}
    </div>
  )
}

// ── מודל יצירת קבוצה — ריקה (שם בלבד) או מקובץ CSV ──
function CreateGroupModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (id: string) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) { setError('יש לתת שם לקבוצה'); return }
    setSaving(true)
    setError('')
    try {
      let res: Response
      if (file) {
        const form = new FormData()
        form.append('file', file)
        form.append('name', trimmed)
        res = await fetch('/api/admin/newsletter/contacts', { method: 'POST', body: form })
      } else {
        res = await fetch('/api/admin/newsletter/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed, recipients: [], allowEmpty: true }),
        })
      }
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'יצירת הקבוצה נכשלה')
      await onCreated(d.listId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">קבוצה חדשה</h3>
            <p className="mt-0.5 text-xs text-slate-500">צרו קבוצה ריקה, או העלו קובץ עם החברים</p>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="סגירה">
            <X size={17} />
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-slate-500">שם הקבוצה</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !file && create()}
          placeholder="לדוגמה: תורמים · ירושלים"
          className="mb-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                     focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />

        <div className="mb-4 rounded-xl border border-dashed border-slate-300 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* קישור להורדת תבנית CSV מ-route handler (לא עמוד) */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/admin/newsletter/contacts?template=1"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white
                         px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              קובץ דוגמה
            </a>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white
                         px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
              <Upload size={14} /> העלאת CSV (לא חובה)
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setError('') }} />
          </div>
          {file && (
            <p className="mt-2 truncate text-xs text-slate-500">נבחר: <strong>{file.name}</strong></p>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            בלי קובץ — תיווצר קבוצה ריקה, ותוסיפו חברים ידנית מתוך הקבוצה.
          </p>
        </div>

        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-start gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={create} disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5
                       text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {saving ? 'יוצר…' : 'צור קבוצה'}
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
