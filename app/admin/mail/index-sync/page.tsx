'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowRight, RefreshCw, Loader2, CheckCircle2, AlertTriangle, Database,
  Inbox, Clock, ShieldCheck, Zap, Plus, Trash2, PowerOff,
} from 'lucide-react'
import { DEPARTMENTS } from '@/lib/departments'
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
  watch_expires_at: string | null
  is_active?: boolean
  indexedCount?: number
}

// תוויות המחלקות — מקור אמת אחד עם שאר המערכת.
const DEPT_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(DEPARTMENTS).map(d => [d.key, d.label]),
)

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
  const [watchBusy, setWatchBusy] = useState(false)
  const [acctBusy, setAcctBusy] = useState<string | null>(null)
  // 0 עד שהנתונים נטענים — כך אף מנוי אינו נחשב פעיל לפני שידוע מה מצבו.
  const [now, setNow] = useState(0)
  const [results, setResults] = useState<RunResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/gmail/index-sync', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'טעינת המצב נכשלה'); return }
      setAccounts(json.accounts ?? [])
      setIndexedTotal(json.indexedTotal ?? 0)
      setNow(Date.now())
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

  // ⚠️ "פעיל" נגזר מתפוגה *עתידית* ולא מעצם קיומה: מנוי שפג לפני יומיים
  // היה מוצג כפעיל, וזה בדיוק המצב שבו המערכת נדמה בשקט.
  //
  // ⚠️ ה"עכשיו" נלקח מ-state שנקבע בטעינה ולא מקריאה בזמן הרינדור: קריאה
  // כזו הופכת את הרינדור ללא-דטרמיניסטי, ומייצרת אי-התאמה בין השרת ללקוח.
  const liveAccounts = accounts.filter(a => a.watch_expires_at && new Date(a.watch_expires_at).getTime() > now)
  const liveOn = liveAccounts.length > 0 && liveAccounts.length === accounts.length
  const nearestExpiry = liveAccounts
    .map(a => a.watch_expires_at!)
    .sort((x, y) => new Date(x).getTime() - new Date(y).getTime())[0] ?? null

  // ⚠️ מחלקה ריקה נופלת לדלי אחד מפורש ולא נעלמת: תיבה בלי מחלקה אינה
  // מנותבת לאיש, וזו בדיוק התקלה שצריך לראות ולא להסתיר.
  const grouped = (() => {
    const m = new Map<string, Account[]>()
    for (const a of accounts) {
      const k = a.department || ''
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    // ללא-מחלקה אחרון — הוא חריג, לא ברירת מחדל.
    return [...m.entries()].sort((x, y) => (x[0] ? 0 : 1) - (y[0] ? 0 : 1))
  })()

  async function toggleActive(a: Account) {
    const turningOff = a.is_active !== false
    if (turningOff && !confirm(`להשבית את ${a.email}?\n\nהתיבה תפסיק להסתנכרן. ההודעות שכבר נקלטו יישארו.`)) return
    setAcctBusy(a.id); setError(null)
    try {
      const res = await fetch('/api/admin/gmail/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, is_active: !turningOff }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'העדכון נכשל'); return }
      await load()
    } catch { setError('שגיאת רשת') } finally { setAcctBusy(null) }
  }

  async function removeAccount(a: Account) {
    // 🔴 אישור שאומר במפורש כמה הודעות יימחקו. "האם אתה בטוח" גורף אינו
    // מאפשר להבחין בין מחיקת תיבה ריקה למחיקת אלפי שורות אינדקס.
    const n = a.indexedCount ?? 0
    const warn = n > 0
      ? `\n\n⚠️ יימחקו גם ${n.toLocaleString('he-IL')} הודעות מהאינדקס.\nההודעות עצמן נשארות בגמייל, אך השיוך והתיעוד שנבנו עליהן יאבדו.`
      : ''
    if (!confirm(`למחוק את התיבה ${a.email}?${warn}\n\nאם המטרה היא רק לעצור סנכרון — עדיף להשבית.`)) return

    setAcctBusy(a.id); setError(null)
    try {
      const res = await fetch(`/api/admin/gmail/accounts?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'המחיקה נכשלה'); return }
      await load()
    } catch { setError('שגיאת רשת') } finally { setAcctBusy(null) }
  }

  async function toggleWatch(on: boolean) {
    setWatchBusy(true); setError(null)
    try {
      const res = await fetch('/api/admin/gmail/watch', { method: on ? 'POST' : 'DELETE' })
      const json = await res.json().catch(() => ({}))

      // ⚠️ הראוט מחזיר 200 גם כשחלק מהתיבות נכשלו (הצלחה חלקית). בדיקת
      // res.ok בלבד הסתירה את הכשל, והמסך הציג "כבוי" בלי הסבר.
      const results = Array.isArray(json.results) ? json.results as { email: string; ok: boolean; error?: string }[] : []
      const failed = results.filter(r => !r.ok)

      if (!res.ok) {
        setError(json.error ?? 'הפעולה נכשלה')
      } else if (failed.length) {
        // ⚠️ מציגים את שגיאת גוגל *כלשונה*: היא אומרת בדיוק מה לתקן
        // ("Invalid topicName…"), ו"הפעולה נכשלה" גורף שלח אותנו לנחש.
        setError(`${failed.length} תיבות נכשלו · ${failed[0].error ?? 'שגיאה לא ידועה'}`)
      }

      // 🔴 טוענים מחדש *תמיד*, גם בכישלון חלקי: תיבה אחת שהצליחה חייבת
      // להופיע כפעילה. יציאה מוקדמת השאירה את המסך על המצב הישן, ולכן
      // הוא הראה "כבוי" אחרי הפעלה שהצליחה.
      await load()
    } catch { setError('שגיאת רשת') } finally { setWatchBusy(false) }
  }

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

      {/* ── סנכרון מיידי ── */}
      {/* ⚠️ מוצג בנפרד מהסנכרון הידני: זו הפעלה חד-פעמית של מנוי, לא פעולה
          שחוזרים עליה. והמנוי פג אחרי 7 ימים — לכן התפוגה מוצגת במפורש. */}
      <div className={`rounded-2xl border p-5 ${liveOn ? 'border-green-200 bg-green-50/50' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-extrabold text-slate-900 flex items-center gap-2">
              <Zap size={16} className={liveOn ? 'text-green-600' : 'text-slate-400'} />
              סנכרון מיידי (Push)
              {liveOn
                ? <span className="rounded-full bg-green-100 border border-green-300 px-2 py-0.5 text-[11px] font-extrabold text-green-800">🟢 פעיל</span>
                : <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-500">כבוי</span>}
            </p>
            <p className="text-[13px] text-slate-600 mt-1.5 leading-relaxed">
              כשפעיל, גוגל שולח התראה <strong>בשנייה</strong> שמייל נכנס, נקרא או נמחק — והמערכת
              מתעדכנת מיד, בלי ללחוץ על כלום.
            </p>
            {liveOn && nearestExpiry && (
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                <Clock size={12} /> המנוי פג ב־<strong className="text-slate-700">{fmt(nearestExpiry)}</strong> ומתחדש אוטומטית
              </p>
            )}
          </div>
          <button
            onClick={() => toggleWatch(!liveOn)}
            disabled={watchBusy || !accounts.length}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold flex-shrink-0 transition-colors disabled:opacity-50 ${
              liveOn
                ? 'border border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-700'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {watchBusy
              ? <><Loader2 size={13} className="animate-spin" /> רגע…</>
              : liveOn ? <>כבה</> : <><Zap size={13} /> הפעל סנכרון מיידי</>}
          </button>
        </div>
      </div>

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

      {/* ── התיבות, מקובצות לפי מחלקה ──────────────────────────────────────
          ⚠️ הקיבוץ אינו קישוט: לכל מחלקה תיבה משלה, וזה מה שקובע לאן מייל
          נכנס מנותב. רשימה שטוחה הסתירה בדיוק את ההתאמה הזו — ומחלקה בלי
          תיבה (שהדואר שלה פשוט לא נקלט) לא נראתה כלל. */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="font-extrabold text-slate-900">התיבות לפי מחלקה</span>
          <Link
            href="/admin/settings/connect-mailbox"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} /> חבר תיבה חדשה
          </Link>
        </div>

        {loading ? (
          <p className="px-5 py-6 text-sm text-slate-400 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> טוען…
          </p>
        ) : accounts.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Inbox size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-600">עדיין לא חוברה אף תיבה</p>
            <p className="text-xs text-slate-400 mt-1">
              חברו תיבה כדי שהדואר שלה ייקלט לאינדקס.
            </p>
            <Link
              href="/admin/settings/connect-mailbox"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700"
            >
              <Plus size={14} /> חבר תיבה ראשונה
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {grouped.map(([deptKey, list]) => (
              <div key={deptKey} className="px-5 py-3">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">
                  {DEPT_LABEL[deptKey] ?? deptKey ?? 'ללא מחלקה'}
                  <span className="mr-1.5 font-bold text-slate-300">({list.length})</span>
                </p>

                <div className="space-y-2">
                  {list.map(a => (
                    <div key={a.id} className={`rounded-xl border p-3 ${a.is_active === false ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p dir="ltr" className={`font-bold truncate text-right ${a.is_active === false ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                            {a.email}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            {a.is_active === false && (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 font-bold text-slate-600">מושבתת</span>
                            )}
                            {a.neverSynced
                              ? <span className="font-bold text-amber-700">טרם סונכרן</span>
                              : <span>סונכרן {fmt(a.last_sync_at)}</span>}
                            {typeof a.indexedCount === 'number' && (
                              <span>· <strong className="text-slate-700 ltr-num">{a.indexedCount.toLocaleString('he-IL')}</strong> באינדקס</span>
                            )}
                          </p>
                          {a.last_error && (
                            <p className="text-xs text-rose-600 font-bold mt-1 flex items-center gap-1">
                              <AlertTriangle size={12} /> {a.last_error}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => run(a.id)}
                            disabled={!!syncing || a.is_active === false}
                            title={a.is_active === false ? 'תיבה מושבתת' : 'סנכרן תיבה זו'}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-40 transition-colors"
                          >
                            {syncing === a.id
                              ? <><Loader2 size={13} className="animate-spin" /> מסנכרן…</>
                              : <><RefreshCw size={13} /> סנכרן</>}
                          </button>

                          {/* ⚠️ השבתה ולא מחיקה כברירת מחדל: תיבה מושבתת
                              מפסיקה להסתנכרן וההודעות שנקלטו ממנה נשארות. */}
                          <button
                            onClick={() => toggleActive(a)}
                            disabled={acctBusy === a.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:border-amber-300 hover:text-amber-700 disabled:opacity-40 transition-colors"
                          >
                            {acctBusy === a.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : a.is_active === false ? <>הפעל</> : <><PowerOff size={13} /> השבת</>}
                          </button>

                          <button
                            onClick={() => removeAccount(a)}
                            disabled={acctBusy === a.id}
                            title="מחיקת התיבה"
                            className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
