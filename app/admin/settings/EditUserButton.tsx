'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Check, AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { ROLE_LABELS, type UserRole, type Profile, type SectionKey, type PermissionLevel, type UserPermissions } from '@/types'
import { DEPARTMENTS } from '@/lib/departments'

const ROLES: UserRole[] = ['admin', 'secretary']

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'beneficiaries', label: 'צאצאים' },
  { key: 'maternity',     label: 'עזר יולדות' },
  { key: 'maternity_cards', label: 'כרטיסי מזון יולדות' },
  { key: 'loans',         label: 'הלוואות' },
  { key: 'financial_aid', label: 'סיוע רפואי' },
  { key: 'distributions', label: 'חלוקות' },
  { key: 'reports',       label: 'דוחות' },
  { key: 'lineage',       label: 'עץ הדורות' },
]

const LEVELS: { value: PermissionLevel; label: string; color: string }[] = [
  { value: 'none', label: 'ללא',    color: 'bg-red-100 text-red-600 border-red-300' },
  { value: 'view', label: 'צפייה', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'edit', label: 'עריכה', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'add',  label: 'הוספה', color: 'bg-green-100 text-green-700 border-green-200' },
]

const defaultPerms = (): UserPermissions =>
  Object.fromEntries(SECTIONS.map(s => [s.key, 'view' as PermissionLevel])) as UserPermissions

export default function EditUserButton({ profile }: { profile: Profile }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [fullName, setFullName] = useState(profile.full_name)
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [role, setRole] = useState<UserRole>(profile.role)
  const [isActive, setIsActive] = useState(profile.is_active)
  const [permissions, setPermissions] = useState<UserPermissions>(
    profile.permissions && Object.keys(profile.permissions).length > 0
      ? profile.permissions
      : defaultPerms()
  )

  // Department state
  const [department, setDepartment] = useState<string>(profile.department ?? '')

  const setSection = (key: SectionKey, level: PermissionLevel) =>
    setPermissions(p => ({ ...p, [key]: level }))

  const setAllSections = (level: PermissionLevel) =>
    setPermissions(Object.fromEntries(SECTIONS.map(s => [s.key, level])) as UserPermissions)

  const isAdmin = role === 'admin'

  const close = () => {
    if (saving) return
    setOpen(false)
    setError('')
    setDone(false)
    setFullName(profile.full_name)
    setPhone(profile.phone ?? '')
    setRole(profile.role)
    setIsActive(profile.is_active)
    setPermissions(profile.permissions && Object.keys(profile.permissions).length > 0
      ? profile.permissions : defaultPerms())
    setDepartment(profile.department ?? '')
  }

  const submit = async () => {
    if (!fullName.trim()) { setError('שם מלא חובה'); return }
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: profile.id, full_name: fullName, phone, role, is_active: isActive,
          permissions: isAdmin ? {} : permissions,
          department: department || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה בעדכון'); setSaving(false); return }
      setDone(true)
      setSaving(false)
      router.refresh()
      setTimeout(() => { setOpen(false); setDone(false) }, 1200)
    } catch {
      setError('שגיאת רשת — נסה שוב')
      setSaving(false)
    }
  }

  const deleteUser = async () => {
    setDeleting(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: profile.id }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה במחיקה'); setDeleting(false); setConfirmDelete(false); return }
      setOpen(false)
      router.refresh()
    } catch {
      setError('שגיאת רשת — נסה שוב')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
        title="עריכת משתמש">
        <Pencil size={14} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={close}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white z-10">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Pencil size={15} className="text-indigo-500" /> עריכת משתמש
              </h3>
              <button onClick={close} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            {done ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3">
                  <Check size={26} />
                </div>
                <p className="text-sm font-medium text-slate-800">הפרטים עודכנו בהצלחה</p>
              </div>
            ) : (
              <div className="p-5 flex flex-col gap-4">
                {/* Email */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">אימייל</label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 ltr-num text-left">
                    {profile.email}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">שם מלא <span className="text-red-500">*</span></label>
                  <input value={fullName} onChange={e => setFullName(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">טלפון</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="05X-XXXXXXX" dir="ltr"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                {/* Role */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">תפקיד <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map(r => (
                      <button key={r} type="button" onClick={() => setRole(r)}
                        className={`py-2 rounded-lg border text-sm font-medium transition-colors ${role === r ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Permissions — hidden for admin (full access) */}
                {!isAdmin && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">הרשאות גישה למחלקות</label>
                      <div className="flex gap-1.5 text-xs">
                        {LEVELS.map(l => (
                          <button key={l.value} type="button" onClick={() => setAllSections(l.value)}
                            title={`סמן הכל — ${l.label}`}
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-medium transition-opacity hover:opacity-70 ${l.color}`}>{l.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      {SECTIONS.map((section, idx) => {
                        const current = permissions[section.key] ?? 'view'
                        return (
                          <div key={section.key} className={`flex items-center justify-between px-4 py-2.5 ${idx < SECTIONS.length - 1 ? 'border-b border-slate-100' : ''}`}>
                            <span className="text-sm font-medium text-slate-700">{section.label}</span>
                            <div className="flex gap-1">
                              {LEVELS.map(level => (
                                <button key={level.value} type="button"
                                  onClick={() => setSection(section.key, level.value)}
                                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                                    current === level.value
                                      ? level.color + ' shadow-sm'
                                      : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                                  }`}>
                                  {level.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-slate-400">
                      צפייה — קריאה בלבד · עריכה — שינוי נתונים קיימים · הוספה — כולל הוספת רשומות חדשות
                    </p>
                  </div>
                )}

                {isAdmin && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-700">
                    מנהל מערכת — גישה מלאה לכל המחלקות ללא הגבלה
                  </div>
                )}

                {/* Department */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-700">מחלקה</label>
                  <select
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">ללא שיוך</option>
                    {Object.values(DEPARTMENTS).filter(d => !d.mailboxOnly).map(d => (
                      <option key={d.key} value={d.key}>{d.label} — {d.email}</option>
                    ))}
                  </select>
                  {department && (
                    <p className="text-xs text-slate-400">מיילים ייצאו עם כתובת תשובה: {DEPARTMENTS[department as keyof typeof DEPARTMENTS]?.email}</p>
                  )}
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between py-2 border border-slate-200 rounded-lg px-3">
                  <span className="text-sm text-slate-700">משתמש פעיל</span>
                  <button type="button" onClick={() => setIsActive(v => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${isActive ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {error}
                  </div>
                )}

                {confirmDelete ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex flex-col gap-2">
                    <p className="text-xs text-red-700 font-medium">האם למחוק את המשתמש לצמיתות? פעולה זו אינה ניתנת לביטול.</p>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        ביטול
                      </button>
                      <button onClick={deleteUser} disabled={deleting}
                        className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        מחק לצמיתות
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 justify-between">
                    <button onClick={() => setConfirmDelete(true)} disabled={saving}
                      className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      <Trash2 size={13} /> מחק משתמש
                    </button>
                    <div className="flex gap-2">
                      <button onClick={close} disabled={saving}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        ביטול
                      </button>
                      <button onClick={submit} disabled={saving || !fullName.trim()}
                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                        שמור שינויים
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
