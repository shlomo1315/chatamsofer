'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, UserPlus, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { ROLE_LABELS, type UserRole, type SectionKey, type PermissionLevel, type UserPermissions } from '@/types'

const ROLES: UserRole[] = ['admin', 'secretary']

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'beneficiaries', label: 'נתמכים' },
  { key: 'maternity',     label: 'יולדות' },
  { key: 'loans',         label: 'הלוואות' },
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

export default function AddUserButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('secretary')
  const [permissions, setPermissions] = useState<UserPermissions>(defaultPerms())

  const setSection = (key: SectionKey, level: PermissionLevel) =>
    setPermissions(p => ({ ...p, [key]: level }))

  const setAllSections = (level: PermissionLevel) =>
    setPermissions(Object.fromEntries(SECTIONS.map(s => [s.key, level])) as UserPermissions)

  const isAdmin = role === 'admin'

  const reset = () => {
    setFullName(''); setEmail(''); setPhone(''); setPassword(''); setRole('secretary')
    setPermissions(defaultPerms())
    setError(''); setDone(false); setShowPw(false)
  }

  const close = () => { if (!saving) { setOpen(false); reset() } }

  const submit = async () => {
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, phone, password, role, permissions: isAdmin ? {} : permissions }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה ביצירת המשתמש'); setSaving(false); return }
      setDone(true)
      setSaving(false)
      router.refresh()
      setTimeout(() => { setOpen(false); reset() }, 1500)
    } catch {
      setError('שגיאת רשת — נסה שוב')
      setSaving(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
        <UserPlus size={14} /> הוסף משתמש
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={close}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><UserPlus size={16} className="text-indigo-500" /> הוסף משתמש חדש למערכת</h3>
              <button onClick={close} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            {done ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3"><Check size={26} /></div>
                <p className="text-sm font-medium text-slate-800">המשתמש נוצר בהצלחה</p>
              </div>
            ) : (
              <div className="p-5 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">שם מלא <span className="text-red-500">*</span></label>
                  <input value={fullName} onChange={e => setFullName(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">אימייל <span className="text-red-500">*</span></label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">טלפון <span className="text-red-500">*</span></label>
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="05X-XXXXXXX" dir="ltr"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">סיסמה <span className="text-red-500">*</span> <span className="font-normal text-slate-400">(לפחות 6 תווים)</span></label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} dir="ltr"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
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

                {error && (
                  <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {error}
                  </div>
                )}

                <div className="flex gap-2 justify-end mt-1">
                  <button onClick={close} disabled={saving} className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">ביטול</button>
                  <button onClick={submit} disabled={saving || !fullName.trim() || !email.trim() || !phone.trim() || password.length < 6}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} צור משתמש
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
