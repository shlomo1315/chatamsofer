'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Copy, Ban, Loader2, Plus, KeyRound } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ניהול קישורי מעקב אשראי לנדיב (דף ציבורי לקריאה בלבד: /donor-report/<טוקן>).
interface DonorLinkRow {
  id: string; token: string; label: string; recovery_home: string | null
  created_at: string; revoked_at: string | null; last_used_at: string | null
  has_password: boolean; locked_until: string | null
}

export default function DonorLinksPage() {
  const toast = useToast()
  const [links, setLinks] = useState<DonorLinkRow[]>([])
  const [homes, setHomes] = useState<string[]>([])
  const [label, setLabel] = useState('')
  const [home, setHome] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/maternity/donor-links', { cache: 'no-store' })
    if (res.ok) { const j = await res.json(); setLinks(j.links); setHomes(j.homes) }
    else toast.error('טעינת הקישורים נכשלה')
    setLoading(false)
  }, [toast])
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  const urlOf = (t: string) => `${window.location.origin}/donor-report/${t}`

  async function create() {
    if (!label.trim()) { toast.error('יש להזין שם לקישור'); return }
    if (password.length < 6) { toast.error('הסיסמה חייבת להכיל לפחות 6 תווים'); return }
    setSaving(true)
    const res = await fetch('/api/admin/maternity/donor-links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, recovery_home: home || null, password }),
    })
    setSaving(false)
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'היצירה נכשלה'); return }
    setLabel(''); setHome(''); setPassword('')
    await load()
  }

  async function revoke(id: string) {
    if (!confirm('לבטל את הקישור? מי שמחזיק בו לא יוכל לצפות יותר.')) return
    const res = await fetch('/api/admin/maternity/donor-links', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    if (!res.ok) { toast.error('הביטול נכשל'); return }
    await load()
  }

  async function changePassword(id: string) {
    const pw = prompt('סיסמה חדשה לקישור (לפחות 6 תווים):')
    if (pw === null) return
    if (pw.length < 6) { toast.error('הסיסמה חייבת להכיל לפחות 6 תווים'); return }
    const res = await fetch('/api/admin/maternity/donor-links', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password: pw }),
    })
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'שמירת הסיסמה נכשלה'); return }
    toast.success('הסיסמה עודכנה')
    await load()
  }

  async function copy(t: string) {
    try { await navigator.clipboard.writeText(urlOf(t)); toast.success('הקישור הועתק') }
    catch { toast.error('ההעתקה נכשלה') }
  }

  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm'
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/maternity" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-navy-dark">
          <ArrowRight size={14} /> יולדות
        </Link>
        <h1 className="mt-2 text-xl font-bold text-navy-dark">קישורי נדיב – מעקב אשראי</h1>
        <p className="text-sm text-slate-500">קישור לקריאה בלבד: יולדות שאושרו לפי בית החלמה, תאריכים וסכומים. אפשר לנעול לבית החלמה אחד ולבטל בכל רגע. לכל קישור סיסמה משלו, שאפשר לשנות כאן (נעילה זמנית אחרי 5 ניסיונות כושלים).</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-bold text-slate-600">שם הקישור (למשל: שם הנדיב)
          <input value={label} onChange={e => setLabel(e.target.value)} maxLength={120} className={`${field} mt-1 block w-64`} />
        </label>
        <label className="text-xs font-bold text-slate-600">נעילה לבית החלמה
          <select value={home} onChange={e => setHome(e.target.value)} className={`${field} mt-1 block w-52`}>
            <option value="">כל בתי ההחלמה</option>
            {homes.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">סיסמה לנדיב
          <input type="text" value={password} onChange={e => setPassword(e.target.value)} maxLength={100} autoComplete="off" className={`${field} mt-1 block w-44`} />
        </label>
        <button onClick={create} disabled={saving}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-navy px-4 text-sm font-bold text-white disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} יצירת קישור
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <table className="w-full table-fixed text-right text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr><th className="px-4 py-3">שם</th><th className="px-4 py-3">בית החלמה</th><th className="px-4 py-3">נוצר</th><th className="px-4 py-3">שימוש אחרון</th><th className="px-4 py-3">סיסמה</th><th className="px-4 py-3">מצב</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">טוען…</td></tr>}
            {!loading && links.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">אין קישורים עדיין</td></tr>}
            {links.map(l => (
              <tr key={l.id} className={l.revoked_at ? 'text-slate-400' : ''}>
                <td className="px-4 py-3 font-medium">{l.label}</td>
                <td className="px-4 py-3">{l.recovery_home ?? 'כולם'}</td>
                <td className="px-4 py-3">{new Date(l.created_at).toLocaleDateString('he-IL')}</td>
                <td className="px-4 py-3">{l.last_used_at ? new Date(l.last_used_at).toLocaleDateString('he-IL') : '—'}</td>
                <td className="px-4 py-3">{l.has_password ? 'מוגדרת' : 'חסרה'}</td>
                <td className="px-4 py-3">{l.revoked_at ? 'בוטל' : l.locked_until && new Date(l.locked_until) > new Date() ? 'נעול זמנית' : 'פעיל'}</td>
                <td className="px-4 py-3">
                  {!l.revoked_at && (
                    <span className="flex gap-2">
                      <button onClick={() => copy(l.token)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-navy-dark"><Copy size={13} /> העתקה</button>
                      <button onClick={() => changePassword(l.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-navy-dark"><KeyRound size={13} /> סיסמה</button>
                      <button onClick={() => revoke(l.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-600"><Ban size={13} /> ביטול</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
