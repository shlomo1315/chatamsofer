'use client'
import { useState, useEffect } from 'react'
import { LayoutDashboard, Loader2, Check, Copy, ExternalLink } from 'lucide-react'
import { ilDate } from '@/lib/israelTime'
import { useConfirm } from '@/components/ui/ConfirmDialog'

// לוח המנהל של היריד — קישור נפרד בסיסמה.
//
// 🔴 הסיסמה נשמרת כ-HMAC — אי אפשר להציג אותה שוב, רק להחליף.
// החלפה מנתקת את כל מי שמחובר עם הסיסמה הקודמת.

type Info = { configured: boolean; enabled: boolean; updatedAt: string | null; lastLoginAt: string | null }

export default function DashboardAccess({ canEdit }: { canEdit: boolean }) {
  const { confirm, confirmDialog } = useConfirm()
  const [info, setInfo] = useState<Info | null>(null)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) setOrigin(window.location.origin) }, 0)
    fetch('/api/admin/book-fair/dashboard', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (alive && typeof d.configured === 'boolean') setInfo(d) })
      .catch(() => { if (alive) setError('הטעינה נכשלה') })
    return () => { alive = false; clearTimeout(t) }
  }, [])

  const link = `${origin}/yerid/dashboard`

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setError(''); setMsg(''); setBusy(action)
    try {
      const res = await fetch('/api/admin/book-fair/dashboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'הפעולה נכשלה'); return false }
      setInfo(i => ({ ...(i ?? { lastLoginAt: null }), configured: d.configured, enabled: d.enabled, updatedAt: d.updatedAt ?? i?.updatedAt ?? null }))
      return true
    } catch {
      setError('הפעולה נכשלה — בדקו את החיבור'); return false
    } finally {
      setBusy(null)
    }
  }

  async function savePassword() {
    if (pw.length < 8) return setError('הסיסמה חייבת להיות באורך 8 תווים לפחות')
    if (pw !== pw2) return setError('הסיסמאות אינן תואמות')
    if (await act('password', { password: pw })) {
      setPw(''); setPw2('')
      setMsg(info?.configured ? 'הסיסמה הוחלפה — כל המחוברים נותקו' : 'הסיסמה נשמרה והלוח הופעל')
    }
  }

  async function revoke() {
    const ok = await confirm({ title: 'לנתק את כל המחוברים?', message: 'כל מי שמחובר ללוח יצטרך להזין את הסיסמה שוב.', confirmLabel: 'ניתוק', danger: true })
    if (ok && await act('revoke')) setMsg('כל המחוברים נותקו')
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      {confirmDialog}
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <LayoutDashboard size={17} /> לוח המנהל — קישור צפייה
        </h2>
        {info?.configured && (
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={info.enabled} disabled={!canEdit || !!busy}
              onChange={e => void act('enable', { enabled: e.target.checked })} className="h-5 w-5" />
            פעיל
          </label>
        )}
      </div>
      <p className="mb-4 text-sm text-slate-500">
        דף נפרד עם גרפים של כל ההזמנות — אתר, טלפון ודוכן — מתעדכן חי. מספרים בלבד, בלי פרטי לקוחות.
      </p>

      {!info ? (
        error ? <p className="text-sm text-red-600">{error}</p> : <Loader2 size={18} className="animate-spin text-slate-400" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">הקישור</span>
            <div className="flex flex-wrap gap-2">
              <span dir="ltr" className="flex min-h-[44px] min-w-0 flex-1 items-center truncate rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">{link}</span>
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 px-4 text-sm font-semibold">
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'הועתק' : 'העתקה'}
              </button>
              <a href="/yerid/dashboard" target="_blank" rel="noopener"
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 px-4 text-sm font-semibold">
                <ExternalLink size={15} /> פתיחה
              </a>
            </div>
          </div>

          <p className={`inline-flex w-fit rounded-lg px-2.5 py-1.5 text-xs ${
            info.configured && info.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {!info.configured ? '🔴 טרם הוגדרה סיסמה — הלוח סגור'
              : !info.enabled ? 'הלוח כבוי — הקישור אינו נפתח'
              : `פעיל${info.updatedAt ? ` · סיסמה עודכנה ${ilDate(info.updatedAt)}` : ''}${info.lastLoginAt ? ` · כניסה אחרונה ${ilDate(info.lastLoginAt)}` : ''}`}
          </p>

          {canEdit && (
            <div className="flex flex-col gap-2.5 sm:max-w-sm">
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} dir="ltr" autoComplete="new-password"
                placeholder={info.configured ? 'סיסמה חדשה (8 תווים לפחות)' : 'בחרו סיסמה (8 תווים לפחות)'}
                aria-label="סיסמה חדשה"
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-400" />
              <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} dir="ltr" autoComplete="new-password"
                placeholder="הקלידו שוב לאימות" aria-label="אימות סיסמה"
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-400" />
              <button onClick={savePassword} disabled={!!busy || !pw}
                className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {busy === 'password' && <Loader2 size={15} className="animate-spin" />}
                {info.configured ? 'החלפת סיסמה' : 'שמירה והפעלה'}
              </button>
              {info.configured && (
                <button onClick={revoke} disabled={!!busy}
                  className="rounded-xl border border-red-300 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50">
                  ניתוק כל המחוברים
                </button>
              )}
            </div>
          )}

          {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      )}
    </section>
  )
}
