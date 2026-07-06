'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Check, Building2, Lock, Eye, EyeOff, Loader2, Trash2, Plus, X, LogIn, Mail, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'

interface Portal { home_name: string; updated_at: string }

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

const AVAIL_OPTIONS = [
  { value: 'regular', label: 'לכלל היולדות' },
  { value: 'silent', label: 'רק לידה שקטה' },
  { value: 'both', label: 'גם וגם' },
] as const

export default function RecoveryHomeLinks({ homes }: { homes: { name: string; availability: string; report_email?: string | null }[] }) {
  const router = useRouter()
  const supabase = createClient()
  const { confirm, confirmDialog } = useConfirm()
  const [portals, setPortals] = useState<Portal[]>([])

  // כתובת מייל לכל בית החלמה — לשליחת דיווחים / סיכום חודשי
  const [emailMap, setEmailMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(homes.map(h => [h.name, h.report_email ?? ''])))
  const [emailSaved, setEmailSaved] = useState<string | null>(null)
  const [emailErr, setEmailErr] = useState<string | null>(null)
  const [emailSaving, setEmailSaving] = useState<string | null>(null)

  // שליחת פרטי הכניסה לפורטל בית ההחלמה במייל
  const [sendHome, setSendHome] = useState<string | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [sendPw, setSendPw] = useState('')
  const [sendShowPw, setSendShowPw] = useState(false)
  const [sendSaving, setSendSaving] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [sendDone, setSendDone] = useState(false)
  const openSend = (home: string) => {
    setSendHome(home); setSendEmail(emailMap[home] ?? ''); setSendPw(''); setSendErr(''); setSendDone(false)
  }
  const submitSend = async () => {
    if (!sendHome) return
    setSendErr('')
    if (!isValidEmail(sendEmail)) { setSendErr('כתובת מייל לא תקינה'); return }
    if (sendPw.length < 10) { setSendErr('הסיסמה חייבת להכיל לפחות 10 תווים'); return }
    setSendSaving(true)
    try {
      const res = await fetch('/api/admin/maternity/send-portal-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home: sendHome, email: sendEmail.trim(), password: sendPw }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setSendErr(data.error || 'השליחה נכשלה'); setSendSaving(false); return }
      // עדכון מקומי — הסיסמה הוגדרה והמייל נשמר
      setPortals(prev => prev.find(p => p.home_name === sendHome) ? prev : [...prev, { home_name: sendHome, updated_at: new Date().toISOString() }])
      setEmailMap(m => ({ ...m, [sendHome]: sendEmail.trim() }))
      setSendDone(true)
      setTimeout(() => { setSendHome(null); setSendDone(false) }, 1600)
    } catch {
      setSendErr('שגיאת רשת — נסו שוב')
    } finally {
      setSendSaving(false)
    }
  }
  const saveEmail = async (name: string) => {
    const email = (emailMap[name] ?? '').trim()
    if (email && !isValidEmail(email)) { setEmailErr(name); return }
    setEmailErr(null); setEmailSaving(name)
    try {
      await supabase.from('recovery_homes').upsert({ name, report_email: email || null }, { onConflict: 'name' })
      setEmailSaved(name); setTimeout(() => setEmailSaved(null), 2000)
    } catch { /* silent */ } finally { setEmailSaving(null) }
  }
  const [adding, setAdding] = useState(false)
  const [newHome, setNewHome] = useState('')
  const [newAvail, setNewAvail] = useState('regular')
  const [addingSaving, setAddingSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // זמינות בית החלמה: regular = לכלל היולדות · silent = רק לידה שקטה · both = גם וגם
  const [availMap, setAvailMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(homes.map(h => [h.name, h.availability || 'regular'])))
  const saveAvailability = async (name: string, value: string) => {
    setAvailMap(m => ({ ...m, [name]: value }))
    try { await supabase.from('recovery_homes').upsert({ name, availability: value }, { onConflict: 'name' }) } catch { /* silent */ }
  }

  const addHome = async () => {
    const name = newHome.trim()
    if (!name) return
    if (homes.some(h => h.name === name)) { setAddError('בית החלמה זה כבר קיים ברשימה'); return }
    setAddingSaving(true); setAddError('')
    try {
      const { error } = await supabase.from('recovery_homes').insert({ name, availability: newAvail })
      if (error) throw error
      setNewHome(''); setNewAvail('regular'); setAdding(false)
      router.refresh()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'שגיאה בהוספה')
    } finally {
      setAddingSaving(false)
    }
  }
  const [copied, setCopied] = useState<string | null>(null)
  const [editingHome, setEditingHome] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedHome, setSavedHome] = useState<string | null>(null)

  const hasPassword = (home: string) => portals.some(p => p.home_name === home)

  useEffect(() => {
    fetch('/api/portal/password')
      .then(r => r.json())
      .then(d => setPortals(d.portals ?? []))
      .catch(() => {})
  }, [])

  const copyLink = (home: string) => {
    const url = `${window.location.origin}/portal/maternity/${encodeURIComponent(home)}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(home)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const openEdit = (home: string) => {
    setEditingHome(home)
    setPw('')
    setShowPw(false)
    setError('')
  }

  const savePassword = async (home: string) => {
    if (!pw || pw.length < 10) { setError('סיסמה חייבת להיות לפחות 10 תווים'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/portal/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_name: home, password: pw }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה'); setSaving(false); return }
      setPortals(prev => {
        const exists = prev.find(p => p.home_name === home)
        if (exists) return prev.map(p => p.home_name === home ? { ...p, updated_at: new Date().toISOString() } : p)
        return [...prev, { home_name: home, updated_at: new Date().toISOString() }]
      })
      setSavedHome(home)
      setTimeout(() => setSavedHome(null), 2000)
      setEditingHome(null)
    } catch {
      setError('שגיאת רשת')
    } finally {
      setSaving(false)
    }
  }

  const removePassword = async (home: string) => {
    if (!(await confirm({ title: 'הסרת גישה לפורטל', message: `להסיר גישה לפורטל עבור "${home}"?`, confirmLabel: 'הסר', danger: true }))) return
    await fetch('/api/portal/password', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home_name: home }),
    })
    setPortals(prev => prev.filter(p => p.home_name !== home))
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-700">פורטל בתי החלמה</h2>
        </div>
        <button onClick={() => { setAdding(a => !a); setAddError('') }}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
          <Plus size={14} /> הוסף בית החלמה
        </button>
      </div>

      {adding && (
        <div className="px-5 py-3 border-b border-slate-100 bg-indigo-50/40 flex items-center gap-2 flex-wrap">
          <input
            value={newHome}
            onChange={e => { setNewHome(e.target.value); setAddError('') }}
            onKeyDown={e => e.key === 'Enter' && addHome()}
            placeholder="שם בית החלמה חדש"
            className="flex-1 min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <select value={newAvail} onChange={e => setNewAvail(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="זמינות בית ההחלמה">
            {AVAIL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={addHome} disabled={addingSaving || !newHome.trim()}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
            {addingSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} שמור
          </button>
          <button onClick={() => { setAdding(false); setNewHome(''); setAddError('') }}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={14} /></button>
          {addError && <span className="text-xs text-red-600 w-full">{addError}</span>}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {homes.map(h => { const home = h.name; return (
          <div key={home} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <Building2 size={15} className="text-slate-400 flex-shrink-0" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{home}</span>
                  {/* זמינות — לכלל / שקטה / גם וגם */}
                  <select value={availMap[home] ?? 'regular'} onChange={e => saveAvailability(home, e.target.value)}
                    className="text-[11px] rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    title="זמינות בית ההחלמה">
                    {AVAIL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {hasPassword(home) ? (
                    <span className="mr-2 text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                      <Lock size={10} /> סיסמה מוגדרת
                    </span>
                  ) : (
                    <span className="mr-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      ללא סיסמה
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* כניסה מהירה לפורטל — לצוות המחובר, ללא סיסמה (מתנתק עם התנתקות מהמערכת) */}
                <a href={`/api/admin/maternity/portal-login?home=${encodeURIComponent(home)}`} target="_blank" rel="noopener noreferrer"
                  title="כניסה מהירה לפורטל בית ההחלמה (ללא סיסמה)"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                  <LogIn size={13} /> כניסה מהירה
                </a>

                {/* Copy link — only if password set */}
                {hasPassword(home) && (
                  <button onClick={() => copyLink(home)}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                      copied === home
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                    }`}>
                    {copied === home ? <><Check size={13} /> הועתק!</> : <><Link2 size={13} /> העתק קישור</>}
                  </button>
                )}

                {/* Set/change password */}
                <button onClick={() => editingHome === home ? setEditingHome(null) : openEdit(home)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  {savedHome === home ? <><Check size={13} className="text-green-600" /> נשמר!</> : hasPassword(home) ? <><Lock size={13} /> שנה סיסמה</> : <><Plus size={13} /> הגדר סיסמה</>}
                </button>

                {/* Remove access */}
                {hasPassword(home) && (
                  <button onClick={() => removePassword(home)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                    title="הסר גישה">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Password input inline */}
            {editingHome === home && (
              <div className="mt-3 flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={pw}
                    onChange={e => setPw(e.target.value)}
                    placeholder="הכנס סיסמה (לפחות 10 תווים)"
                    dir="ltr"
                    name="recovery-portal-password"
                    autoComplete="new-password"
                    autoCorrect="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={e => e.key === 'Enter' && savePassword(home)}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button onClick={() => savePassword(home)} disabled={saving || !pw}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  שמור
                </button>
                {error && <span className="text-xs text-red-600">{error}</span>}
              </div>
            )}

            {/* כתובת מייל לבית ההחלמה — לשליחת דיווחים / סיכום חודשי */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Mail size={14} className="text-slate-400 flex-shrink-0" />
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <input
                  type="email"
                  value={emailMap[home] ?? ''}
                  onChange={e => { setEmailMap(m => ({ ...m, [home]: e.target.value })); if (emailErr === home) setEmailErr(null) }}
                  onKeyDown={e => e.key === 'Enter' && saveEmail(home)}
                  placeholder="כתובת מייל לדיווחים (לא חובה)"
                  dir="ltr"
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 ${emailErr === home ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`}
                />
              </div>
              <button onClick={() => saveEmail(home)} disabled={emailSaving === home}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                {emailSaving === home ? <Loader2 size={13} className="animate-spin" /> : emailSaved === home ? <><Check size={13} className="text-green-600" /> נשמר!</> : <><Check size={13} /> שמור מייל</>}
              </button>
              <button onClick={() => openSend(home)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                title="שליחת קישור וסיסמה לפורטל במייל">
                <Send size={13} /> שלח פורטל למייל
              </button>
              {emailErr === home && <span className="text-xs text-red-600">כתובת מייל לא תקינה</span>}
            </div>
          </div>
        ) })}
      </div>

      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          הגדר סיסמה לכל בית החלמה — לאחר מכן העתק את הקישור ושלח להם. הם יצטרכו להזין סיסמה לפני הצפייה ברשימה.
          <br />
          <strong className="text-emerald-600">כניסה מהירה</strong> — כניסה ישירה לפורטל ללא סיסמה (לצוות המחובר בלבד); הגישה מתנתקת אוטומטית עם היציאה מהמערכת.
          ניתן גם להזין <strong>כתובת מייל</strong> לכל בית החלמה למשלוח דיווחים וסיכומים.
        </p>
      </div>
      {confirmDialog}

      {/* שליחת פרטי כניסה לפורטל בית ההחלמה במייל */}
      <Modal open={!!sendHome} onClose={() => setSendHome(null)} title={`שליחת פורטל למייל — ${sendHome ?? ''}`} size="md">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            הזינו את כתובת המייל של בית ההחלמה ואת הסיסמה שתוגדר לפורטל. יישלח מייל מעוצב עם קישור, סיסמה והסבר כניסה.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">כתובת מייל לשליחה</label>
            <input type="email" value={sendEmail} onChange={e => { setSendEmail(e.target.value); setSendErr('') }}
              placeholder="name@example.com" dir="ltr"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">סיסמה לפורטל (לפחות 10 תווים)</label>
            <div className="relative">
              <input type={sendShowPw ? 'text' : 'password'} value={sendPw} onChange={e => { setSendPw(e.target.value); setSendErr('') }}
                placeholder="הסיסמה שתוגדר" dir="ltr" autoComplete="new-password" data-1p-ignore data-lpignore="true"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button type="button" onClick={() => setSendShowPw(v => !v)}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {sendShowPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          {sendErr && <p className="text-sm text-red-600">{sendErr}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={() => setSendHome(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">ביטול</button>
            <button onClick={submitSend} disabled={sendSaving || sendDone}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg px-5 py-2 transition-colors">
              {sendSaving ? <Loader2 size={15} className="animate-spin" /> : sendDone ? <Check size={15} /> : <Send size={15} />}
              {sendDone ? 'נשלח!' : 'שלח את הפורטל'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
