'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowRight, RefreshCw, Loader2, CheckCircle2, AlertTriangle, Database,
  Inbox, Clock, ShieldCheck,
} from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

// ─────────────────────────────────────────────────────────────────────────────
// סנכרון אינדקס Gmail — המסך שמריץ ומציג.
//
// 🔴 מה שהמסך הזה מפעיל בונה *אינדקס ולא עותק*: מצביע להודעה ומטא-דאטה,
// בלי גוף ההודעה. זה מה ששובר את הכפילות ששלושת העותקים יוצרים היום.
//
// ⚠️ המסך מדגיש שהפעולה קוראת בלבד. זו אינה הרגעה שיווקית: מנהל שמפעיל
// סנכרון על תיבת דואר חי צריך לדעת בוודאות שהיא לא תשלח, לא תמחק ולא תיגע
// בכלל הניתוב — אחרת הוא בצדק לא ילחץ.
// ─────────────────────────────────────────────────────────────────────────────

interface Account {
  id: string
  email: string
  department: string | null
  last_sync_at: string | null
  last_full_sync_at: string | null
  last_history_id: string | null
  last_error: string | null
  neverSynced: boolean
}

interface RunResult {
  email: string
  mode: 'incremental' | 'full'
  upserted: number
  removed: number
  touched: number
  error?: string
}

const fmt = (d?: string | null) => d ? format(new Date(d), 'dd/MM/yy HH:mm', { locale: he }) : '—'

export default function IndexSyncPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [indexedTotal, setIndexedTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [results, setResults] = useState<RunResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/gmail/index-sync', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'טעינת המצב נכשלה'); return }
      setAccounts(json.accounts ?? [])
      setIndexedTotal(json.indexedTotal ?? 0)
      setError(null)
    } catch { setError('שגיאת רשת') } finally { setLoading(false) }
  }, [])

  // ⚠️ נדחה בטיק אחד ומבוטל בניקוי: הטעינה קובעת state, וקריאה ישירה בתוך
  // ה-effect מעדכנת בזמן הרינדור. בלי הביטול, מעבר מהיר מהמסך היה מנסה
  // לעדכן רכיב שכבר אינו מורכב.
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  async function run(accountId?: string) {
    setSyncing(accountId ?? 'all'); setResults(null); setError(null)
    try {
      const res = await fetch('/api/admin/gmail/index-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountId ? { account_id: accountId } : {}),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'הסנכרון נכשל'); return }
      setResults(json.results ?? [])
      await load()
    } catch {
      // ⚠️ סנכרון ראשון ארוך, והחיבור עלול להיסגר לפני שהוא מסתיים. זה אינו
      // אומר שהוא נכשל — הוא ממשיך בשרת. הודעה של "נכשל" כאן הייתה גורמת
      // למנהל להריץ שוב ושוב סנכרון שכבר רץ.
      setError('החיבור נסגר לפני סיום. ייתכן שהסנכרון ממשיך ברקע — רעננו בעוד דקה כדי לראות את המצב.')
    } finally { setSyncing(null) }
  }

  const neverSynced = accounts.filter(a => a.neverSynced).length

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/mail" className="text-slate-400 hover:text-slate-600">
          <ArrowRight size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">סנכרון אינדקס Gmail</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gmail כמקור אמת יחיד — המערכת מחזיקה מצביע להודעה, לא עותק שלה
          </p>
        </div>
      </div>

      {/* ⚠️ הבטחה שהמנהל חייב לראות לפני שהוא לוחץ על תיבה חיה */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
        <p className="flex items-center gap-2 font-extrabold text-emerald-900">
          <ShieldCheck size={17} /> הפעולה קוראת בלבד
        </p>
        <p className="text-[13px] text-emerald-800 mt-1.5 leading-relaxed">
          הסנכרון <strong>מושך</strong> כותרות מ-Gmail ובונה מהן אינדקס לחיפוש ולשיוך.
          הוא <strong>אינו שולח</strong> דואר, <strong>אינו מוחק</strong> הודעות,
          <strong> אינו נוגע</strong> בכלל הניתוב ב-Workspace, ו<strong>אינו שומר את גוף ההודעה</strong> —
          הגוף נקרא מ-Gmail בכל פתיחה.
        </p>
      </div>

      {/* מצב כללי */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Database size={19} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900 ltr-num">{indexedTotal.toLocaleString('he-IL')}</p>
            <p className="text-xs text-slate-500">הודעות באינדקס</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
            <Inbox size={19} className="text-slate-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900 ltr-num">{accounts.length}</p>
            <p className="text-xs text-slate-500">תיבות פעילות</p>
          </div>
        </div>
        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${neverSynced ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${neverSynced ? 'bg-amber-100' : 'bg-green-50'}`}>
            <Clock size={19} className={neverSynced ? 'text-amber-600' : 'text-green-600'} />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900 ltr-num">{neverSynced}</p>
            <p className="text-xs text-slate-500">טרם סונכרנו</p>
          </div>
        </div>
      </div>

      <button
        onClick={() => run()}
        disabled={!!syncing || !accounts.length}
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
      >
        {syncing === 'all'
          ? <><Loader2 size={17} className="animate-spin" /> מסנכרן את כל התיבות… (עשוי לקחת מספר דקות)</>
          : <><RefreshCw size={17} /> סנכרן את כל התיבות</>}
      </button>

      {error && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-900 flex items-start gap-2">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* תוצאות הריצה */}
      {results && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 font-extrabold text-slate-900 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" /> תוצאות הסנכרון
          </div>
          <div className="divide-y divide-slate-50">
            {results.map(r => (
              <div key={r.email} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p dir="ltr" className="text-sm font-bold text-slate-800 truncate text-right">{r.email}</p>
                  {r.error
                    ? <p className="text-xs text-rose-600 font-bold mt-0.5">{r.error}</p>
                    : <p className="text-xs text-slate-500 mt-0.5">
                        {r.mode === 'full' ? 'סנכרון מלא' : 'סנכרון מצטבר'}
                      </p>}
                </div>
                {!r.error && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 font-bold text-indigo-700">
                      {r.upserted.toLocaleString('he-IL')} נקלטו
                    </span>
                    {r.touched > 0 && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">
                        {r.touched} עודכנו
                      </span>
                    )}
                    {r.removed > 0 && (
                      <span className="rounded-full bg-rose-50 border border-rose-100 px-2.5 py-1 font-bold text-rose-700">
                        {r.removed} הוסרו
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* התיבות */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 font-extrabold text-slate-900">התיבות</div>
        {loading ? (
          <p className="px-5 py-6 text-sm text-slate-400 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> טוען…
          </p>
        ) : accounts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">
            אין תיבות Gmail פעילות. יש לחבר תיבה בהגדרות ← חיבור תיבת דואר.
          </p>
        ) : (
          <div className="divide-y divide-slate-50">
            {accounts.map(a => (
              <div key={a.id} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p dir="ltr" className="font-bold text-slate-800 truncate text-right">{a.email}</p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    {a.department && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{a.department}</span>
                    )}
                    {a.neverSynced
                      ? <span className="font-bold text-amber-700">טרם סונכרן</span>
                      : <span>סונכרן {fmt(a.last_sync_at)}</span>}
                    {a.last_full_sync_at && <span>· סריקה מלאה {fmt(a.last_full_sync_at)}</span>}
                  </p>
                  {a.last_error && (
                    <p className="text-xs text-rose-600 font-bold mt-1 flex items-center gap-1">
                      <AlertTriangle size={12} /> {a.last_error}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => run(a.id)}
                  disabled={!!syncing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50 flex-shrink-0 transition-colors"
                >
                  {syncing === a.id
                    ? <><Loader2 size={13} className="animate-spin" /> מסנכרן…</>
                    : <><RefreshCw size={13} /> סנכרן</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-400 leading-relaxed">
        סנכרון ראשון של תיבה מושך עד 500 הודעות אחרונות ועשוי לקחת מספר דקות.
        <br />
        לאחר מכן הסנכרון מצטבר — רק מה שהשתנה מאז הפעם הקודמת.
      </p>
    </div>
  )
}
