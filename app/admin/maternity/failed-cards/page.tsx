'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight, RefreshCw, Loader2, AlertTriangle, CheckCircle2, CreditCard, Package } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// כרטיסים שנכשלו — הרצה חוזרת.
//
// 🔴 תיק שטעינת הכרטיס בו נכשלה נשאר ב-card_load_status='failed' ואינו מנסה
// שוב מעצמו. בלי המסך הזה יולדת נשארת בלי כרטיס מזון עד שהיא מתלוננת.
//
// ⚠️ ההרצה בטוחה לחזרה: בכל מסלול כשל הכרטיס כבר הוחזר למלאי, והטעינה
// יוצאת מוקדם אם התיק כבר נטען. הרצה כפולה אינה מנכה פעמיים.
// ─────────────────────────────────────────────────────────────────────────────

interface Item {
  id: string
  name: string
  id_number: string | null
  error: string | null
  passportRelated: boolean
}

interface RunResult {
  id: string
  name: string
  ok: boolean
  error?: string
  already?: boolean
  awaitingStock?: boolean
}

export default function FailedCardsPage() {
  const toast = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [passportCount, setPassportCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<RunResult[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/maternity/retry-failed-cards', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'הטעינה נכשלה'); return }
      setItems(json.items ?? [])
      setPassportCount(json.passportRelated ?? 0)
    } catch { toast.error('שגיאת רשת') } finally { setLoading(false) }
  }, [toast])

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  async function run(only?: 'passport') {
    const label = only === 'passport' ? `${passportCount} תיקי דרכון` : `${items.length} התיקים`
    if (!confirm(`להריץ מחדש את ${label}?\n\nכל תיק שיצליח ינכה כרטיס מהמלאי ויטען 600 ₪ בנדרים.`)) return
    setRunning(true); setResults(null)
    try {
      const res = await fetch('/api/admin/maternity/retry-failed-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(only ? { only } : {}),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'ההרצה נכשלה'); return }
      setResults(json.results ?? [])
      if (json.succeeded > 0) toast.success(`${json.succeeded} כרטיסים נטענו בהצלחה`)
      else if (json.processed === 0) toast.success('אין תיקים מתאימים')
      else toast.error(`אף תיק לא נטען · ${json.failed} נכשלו`)
      await load()
    } catch {
      toast.error('החיבור נסגר. ייתכן שההרצה ממשיכה — רעננו בעוד דקה.')
    } finally { setRunning(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/maternity" className="text-slate-400 hover:text-slate-600">
          <ArrowRight size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">כרטיסים שנכשלו</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            תיקים שטעינת הכרטיס בהם נכשלה ואינם מנסים שוב מעצמם
          </p>
        </div>
      </div>

      {/* סיכום + פעולות */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={`rounded-2xl border p-4 ${items.length ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle size={14} className={items.length ? 'text-amber-600' : 'text-slate-400'} />
            <span className="text-[11px] font-bold text-slate-500">סה״כ נכשלו</span>
          </div>
          <p className={`text-2xl font-black ltr-num ${items.length ? 'text-amber-700' : 'text-slate-400'}`}>
            {items.length.toLocaleString('he-IL')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <CreditCard size={14} className="text-indigo-600" />
            <span className="text-[11px] font-bold text-slate-500">מתוכם על רקע דרכון</span>
          </div>
          <p className="text-2xl font-black text-indigo-700 ltr-num">{passportCount.toLocaleString('he-IL')}</p>
        </div>
      </div>

      {/* ⚠️ שני כפתורים נפרדים: הרצת "רק דרכון" מאפשרת לאמת שהתיקון עובד
          לפני שמריצים את כל השאר, שנכשלו מסיבות אחרות. */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {passportCount > 0 && (
            <button onClick={() => run('passport')} disabled={running}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50">
              {running ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              הרץ מחדש — תיקי דרכון ({passportCount})
            </button>
          )}
          <button onClick={() => run()} disabled={running}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50">
            {running ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            הרץ מחדש הכל ({items.length})
          </button>
        </div>
      )}

      {/* תוצאות */}
      {results && results.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 font-extrabold text-slate-900 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" /> תוצאות ההרצה
          </div>
          <div className="divide-y divide-slate-50">
            {results.map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="font-bold text-slate-800 text-sm">{r.name}</span>
                {r.awaitingStock ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                    <Package size={11} /> אין מלאי — נכנס לתור
                  </span>
                ) : r.ok ? (
                  <span className="rounded-full bg-green-100 border border-green-200 px-2.5 py-1 text-[11px] font-bold text-green-800">
                    {r.already ? 'כבר היה טעון' : '✓ נטען'}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-rose-600 max-w-md text-left" dir="auto">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* הרשימה */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 font-extrabold text-slate-900">התיקים</div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> טוען…
          </p>
        ) : items.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 size={26} className="mx-auto text-green-500 mb-2" />
            <p className="text-sm font-bold text-slate-700">אין תיקים שנכשלו</p>
            <p className="text-xs text-slate-400 mt-1">כל הכרטיסים נטענו בהצלחה.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {items.map(a => (
              <div key={a.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <Link href={`/admin/maternity/${a.id}`}
                      className="font-bold text-slate-800 hover:text-indigo-700 hover:underline">
                      {a.name}
                    </Link>
                    {a.id_number && (
                      <span className="mr-2 text-xs text-slate-400 ltr-num" dir="ltr">{a.id_number}</span>
                    )}
                    {a.error && (
                      <p className="text-xs text-rose-600 mt-1 flex items-start gap-1">
                        <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {a.error}
                      </p>
                    )}
                  </div>
                  {a.passportRelated && (
                    <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 flex-shrink-0">
                      דרכון
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
