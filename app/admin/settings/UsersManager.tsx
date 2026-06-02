'use client'

import { useState } from 'react'
import { Users, Trash2, MoreVertical } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { Profile, ROLE_LABELS, UserRole } from '@/types'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'מנהל' },
  { value: 'secretary', label: 'מזכירות' },
  { value: 'reviewer', label: 'בודק' },
  { value: 'collections', label: 'גבייה' },
]

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-50 text-purple-700',
  secretary: 'bg-blue-50 text-blue-700',
  reviewer: 'bg-green-50 text-green-700',
  collections: 'bg-orange-50 text-orange-700',
}

interface Props {
  initialProfiles: Profile[]
  isConfigured: boolean
}

export default function UsersManager({ initialProfiles, isConfigured }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
  const [showAdd, setShowAdd] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const [form, setForm] = useState({ email: '', full_name: '', role: 'secretary' as UserRole })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'שגיאה לא ידועה'); return }

      // Optimistically add a placeholder; page reload will sync from DB
      const newProfile: Profile = {
        id: crypto.randomUUID(),
        email: form.email.toLowerCase().trim(),
        full_name: form.full_name.trim(),
        role: form.role,
        is_active: true,
        created_at: new Date().toISOString(),
      }
      setProfiles(prev => [...prev, newProfile])
      setShowAdd(false)
      setForm({ email: '', full_name: '', role: 'secretary' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(profile: Profile) {
    const updated = { ...profile, is_active: !profile.is_active }
    setProfiles(prev => prev.map(p => p.id === profile.id ? updated : p))
    setOpenMenuId(null)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: profile.id, is_active: !profile.is_active }),
    })
    if (!res.ok) {
      // Revert on failure
      setProfiles(prev => prev.map(p => p.id === profile.id ? profile : p))
    }
  }

  async function handleChangeRole(profile: Profile, role: UserRole) {
    const updated = { ...profile, role }
    setProfiles(prev => prev.map(p => p.id === profile.id ? updated : p))
    setOpenMenuId(null)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: profile.id, role }),
    })
    if (!res.ok) {
      setProfiles(prev => prev.map(p => p.id === profile.id ? profile : p))
    }
  }

  async function handleDelete(profile: Profile) {
    if (!confirm(`למחוק את ${profile.full_name}?`)) return
    setProfiles(prev => prev.filter(p => p.id !== profile.id))
    setOpenMenuId(null)
    const res = await fetch(`/api/admin/users?id=${profile.id}`, { method: 'DELETE' })
    if (!res.ok) {
      setProfiles(prev => [...prev, profile])
    }
  }

  return (
    <>
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-700">משתמשי מערכת</h2>
          <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{profiles.length}</span>
        </div>
        {isConfigured && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
          >
            + הוסף משתמש
          </button>
        )}
      </div>

      {profiles.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">
          {isConfigured ? 'לא נמצאו משתמשים' : 'חיבור Supabase נדרש לצפייה במשתמשים'}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {profiles.map((p) => (
            <div key={p.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${p.is_active ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                  {p.full_name.charAt(0)}
                </div>
                <div>
                  <p className={`text-sm font-medium ${p.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{p.full_name}</p>
                  <p className="text-xs text-slate-400 ltr-num">{p.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${ROLE_COLORS[p.role]}`}>
                  {ROLE_LABELS[p.role]}
                </span>
                <div className={`w-2 h-2 rounded-full ${p.is_active ? 'bg-green-500' : 'bg-slate-300'}`} />
                <div className="relative">
                  <button
                    onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                    className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <MoreVertical size={14} />
                  </button>
                  {openMenuId === p.id && (
                    <div className="absolute left-0 top-7 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                      <div className="px-3 py-1.5 text-xs text-slate-400 font-medium border-b border-slate-100">שנה תפקיד</div>
                      {ROLE_OPTIONS.filter(r => r.value !== p.role).map(r => (
                        <button
                          key={r.value}
                          onClick={() => handleChangeRole(p, r.value as UserRole)}
                          className="w-full text-right px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {r.label}
                        </button>
                      ))}
                      <div className="border-t border-slate-100 mt-1">
                        <button
                          onClick={() => handleToggleActive(p)}
                          className="w-full text-right px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {p.is_active ? 'השהה משתמש' : 'הפעל משתמש'}
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="w-full text-right px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 size={12} />
                          מחק משתמש
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Backdrop for closing open menus */}
      {openMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}

      <Modal
        open={showAdd}
        onClose={() => { setShowAdd(false); setError('') }}
        title="הוסף משתמש חדש"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowAdd(false); setError('') }}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium"
            >
              ביטול
            </button>
            <button
              form="add-user-form"
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {submitting ? 'שולח הזמנה...' : 'שלח הזמנה'}
            </button>
          </div>
        }
      >
        <form id="add-user-form" onSubmit={handleAdd} className="flex flex-col gap-4">
          <Input
            label="כתובת אימייל"
            type="email"
            required
            placeholder="user@example.com"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            dir="ltr"
          />
          <Input
            label="שם מלא"
            required
            placeholder="ישראל ישראלי"
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
          />
          <Select
            label="תפקיד"
            required
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
            options={ROLE_OPTIONS}
          />
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <p className="text-xs text-slate-500">המשתמש יקבל אימייל עם קישור להגדרת סיסמה</p>
        </form>
      </Modal>
    </>
  )
}
