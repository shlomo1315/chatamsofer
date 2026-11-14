'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2, ShieldCheck, Wrench, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// בדיקת כל הכרטיסים מול נדרים: עוברת על כל הרשומות עם card_number (בלי הגבלת סדרה),
// ומציגה את מי שהכרטיס לא רשום אצלו בכרטסת. תיקון אוטומטי דרך ה-POST הקיים;
// מי שלא הצליח (למשל כרטיס תפוס אצל משפחה אחרת) מוצג בנפרד לטיפול ידני.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/admin/maternity/verify-linked-cards'

interface Missing {
  aidId: string
  name: string
  idNumber: string | null
  cardLast4: string
  reason: string
  status: string
}
interface Manual extends Missing { fixError: string }

export default function VerifyCardsPage() {
  const toast = useToast()
  const [scanning, setScanning] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number | null } | null>(null)
  const [missing, setMissing] = useState<Missing[] | null>(null)
  const [fixed, setFixed] = useState<Missing[]>([])
  const [manual, setManual] = useState<Manual[]>([])

  async function scan() {
    setScanning(true); setMissing(null); setFixed([]); setManual([])
    const found: Missing[] = []
    let offset: number | null = 0
    try {
      while (offset !== null) {
        const res: Response = await fetch(`${API}?offset=${offset}&limit=40`, { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) { toast.error(json.error ?? 'הבדיקה נכשלה'); break }
        found.push(...(json.missing ?? []))
        offset = json.nextOffset
        setProgress({ done: json.nextOffset ?? json.total ?? json.offset + json.checked, total: json.total })
        if (!json.checked) break
      }
      setMissing(found)
      if (found.length === 0 && offset === null) toast.success('כל הכרטיסים רשומים בנדרים')
    } catch { toast.error('שגיאת רשת'); setMissing(found) } finally { setScanning(false) }
  }

  async function fixAll() {
    if (!missing?.length) return
    if (!confirm(`לנסות לתקן אוטומטית ${missing.length} רשומות?\n\nהכרטיס ישויך מחדש בנדרים ויאומת בכרטסת.`)) return
    setFixing(true)
    const ok: Missing[] = []
    const bad: Manual[] = []
    for (const m of missing) {
      try {
        const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aid_id: m.aidId, confirm: true }) })
        const json = await res.json().catch(() => ({}))
        if (res.ok && json.ok) ok.push(m)
        else bad.push({ ...m, fixError: json.error ?? 'התיקון נכשל' })
      } catch { bad.push({ ...m, fixError: 'שגיאת רשת' }) }
    }
    setFixed(ok); setManual(bad); setMissing(null); setFixing(false)
    toast.success(`${ok.length} תוקנו · ${bad.length} דורשים טיפול ידני`)
  }

  const row = (m: Missing, note: string, tone: string) => (
    <div key={m.aidId} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <Link href={`/admin/maternity/${m.aidId}`} className="font-bold text-slate-800 text-sm hover:underline">{m.name || m.aidId}</Link>
        <span className="mr-2 text-xs text-slate-400 ltr-num" dir="ltr">{m.idNumber ?? ''} · ··{m.cardLast4}</span>
      </div>
      <span className={`text-[11px] font-bold max-w-md ${tone}`}>{note}</span>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/maternity" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">בדיקת כל הכרטיסים מול נדרים</h1>
          <p className="text-xs text-slate-500 mt-0.5">מוודא שכל כרטיס ששויך ליולדת באמת רשום בכרטסת שלה בנדרים</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={scan} disabled={scanning || fixing}
          className="inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-extrabold text-white hover:bg-navy-dark disabled:opacity-50">
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {scanning && progress ? `בודק… ${progress.done}${progress.total ? ` / ${progress.total}` : ''}` : 'הרץ בדיקה'}
        </button>
        {!!missing?.length && (
          <button onClick={fixAll} disabled={scanning || fixing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-line-strong disabled:opacity-50">
            {fixing ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
            תקן אוטומטית ({missing.length})
          </button>
        )}
      </div>

      {missing && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 font-extrabold text-slate-900 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" /> הכרטיס לא רשום בנדרים ({missing.length})
          </div>
          {missing.length === 0
            ? <p className="px-5 py-8 text-center text-sm font-bold text-slate-700"><CheckCircle2 size={22} className="mx-auto mb-1 text-green-500" />הכול תקין</p>
            : <div className="divide-y divide-slate-50">{missing.map(m => row(m, m.reason, 'text-amber-700'))}</div>}
        </div>
      )}

      {fixed.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 font-extrabold text-slate-900 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" /> תוקנו ואומתו ({fixed.length})
          </div>
          <div className="divide-y divide-slate-50">{fixed.map(m => row(m, '✓ שויך ואומת בכרטסת', 'text-green-700'))}</div>
        </div>
      )}

      {manual.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-white overflow-hidden">
          <div className="border-b border-rose-100 px-5 py-3 font-extrabold text-rose-700 flex items-center gap-2">
            <AlertTriangle size={16} /> דורשים טיפול ידני ({manual.length})
          </div>
          <div className="divide-y divide-slate-50">{manual.map(m => row(m, `${m.reason} · ${m.fixError}`, 'text-rose-600'))}</div>
        </div>
      )}
    </div>
  )
}
