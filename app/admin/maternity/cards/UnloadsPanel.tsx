'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, ExternalLink, Search, CheckCircle2, Wallet, Baby, Clock, DownloadCloud } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// פילוח הפריקות — מתי, למי, ומה עלה בגורל הכסף.
//
// 🔴 נבנה אחרי שהתגלה שהפריקה האוטומטית לא רצה 12 יום ואיש לא ידע:
// המסך הציג מקף בעמודת "ימים לפריקה" ולא היה שום מקום לראות מה קרה
// בפועל. מדובר ב-600 ₪ לכל משפחה.
// ─────────────────────────────────────────────────────────────────────────────

interface Unload {
  aidId: string
  beneficiaryId: string | null
  motherName: string
  nedarimId: string | null
  birthDate: string | null
  silent: boolean
  status: string | null
  cardLast4: string | null
  tlushId: string | null
  loadedAt: string | null
  unloadedAt: string | null
  dueDate: string | null
  alreadySpent: boolean
  returnedAmount: number | null
  reason: string
  error: string | null
}

interface Summary {
  total: number
  moneyReleased: number
  unknownAmount: number
  spentCount: number
  lastUnload: string | null
  silentCount: number
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')
const fmtDT = (d?: string | null) => {
  if (!d) return '—'
  const t = new Date(d)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(t.getDate())}.${p(t.getMonth() + 1)}.${String(t.getFullYear()).slice(2)} ${p(t.getHours())}:${p(t.getMinutes())}`
}
const ils = (n: number) => `₪${n.toLocaleString('he-IL')}`

/**
 * כמה ימים עברו מאז הפריקה.
 * ⚠️ מחושב על גבול היום ולא על הפרש שעות: פריקה אתמול ב-23:00 היא
 * "אתמול" גם אם עברו רק 10 שעות.
 */
function daysSince(iso?: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso)
  if (isNaN(then.getTime())) return null
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const now = new Date()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

const daysLabel = (d: number | null) =>
  d == null ? '—' : d === 0 ? 'היום' : d === 1 ? 'אתמול' : `לפני ${d} ימים`

export default function UnloadsPanel() {
  const [rows, setRows] = useState<Unload[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  // 🔴 שליפה רטרואקטיבית: 13 הפריקות הראשונות בוצעו לפני שנוספה העמודה
  // ששומרת את הסכום, והוא אבד. נדרים יודעת מה נפרק מכל תלוש.
  const [backfill, setBackfill] = useState<{ found: number; missing: number; sum: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const previewBackfill = async () => {
    setBusy(true)
    try {
      const d = await fetch('/api/admin/maternity/backfill-unload-amounts').then(r => r.json())
      if (d.error) { setErr(d.error); return }
      setBackfill(d.summary)
    } catch { setErr('השליפה מנדרים נכשלה') } finally { setBusy(false) }
  }

  const runBackfill = async () => {
    if (!confirm('לכתוב את הסכומים שנמצאו בנדרים? הפעולה מעדכנת נתוני כסף.')) return
    setBusy(true)
    try {
      const d = await fetch('/api/admin/maternity/backfill-unload-amounts', { method: 'POST' }).then(r => r.json())
      if (d.error) { setErr(d.error); return }
      window.location.reload()
    } catch { setErr('העדכון נכשל') } finally { setBusy(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true
    fetch('/api/admin/maternity/unloads')
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (d.error) setErr(d.error)
        else { setRows(d.unloads ?? []); setSummary(d.summary ?? null) }
      })
      .catch(() => { if (alive) setErr('טעינת הפריקות נכשלה') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> טוען פריקות…
      </div>
    )
  }
  if (err) return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>

  const filtered = q.trim()
    ? rows.filter(r => r.motherName.includes(q.trim()) || (r.nedarimId ?? '').includes(q.trim()))
    : rows

  return (
    <div className="flex flex-col gap-4">
      {/* ── סיכום ── */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<CheckCircle2 size={16} />} label="סה״כ פריקות" value={String(summary.total)}
            color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-100" />
          {/* ⚠️ כשיש פריקות ללא סכום שמור, זה מוצג במפורש — אחרת המספר
              נראה כמו הסכום המלא בעוד הוא חלקי. */}
          <Stat icon={<Wallet size={16} />} label="כסף שחזר לארנק"
            value={ils(summary.moneyReleased)}
            note={summary.unknownAmount > 0 ? `${summary.unknownAmount} ללא סכום שמור` : undefined}
            color="text-indigo-700" bg="bg-indigo-50" border="border-indigo-100" />
          {/* 🔴 ההבחנה החשובה: כרטיס ש"נוצל במלואו" אינו כשל — המשפחה
              השתמשה בכסף, ואין מה לפרוק. */}
          <Stat icon={<Baby size={16} />} label="נוצלו במלואם" value={String(summary.spentCount)}
            color="text-amber-700" bg="bg-amber-50" border="border-amber-100" />
          <Stat icon={<Clock size={16} />} label="פריקה אחרונה" value={fmtDT(summary.lastUnload)}
            color="text-slate-700" bg="bg-slate-50" border="border-slate-200" />
        </div>
      )}

      {/* ⚠️ מוצג רק כשיש פריקות בלי סכום שמור — אחרת הוא רעש. */}
      {summary && summary.unknownAmount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-900">
            <strong>{summary.unknownAmount} פריקות</strong> בוצעו לפני שהמערכת שמרה את הסכום שחזר.
            {backfill && (
              <span className="mr-1">
                נמצאו בנדרים {backfill.found} · סה״כ {ils(backfill.sum)}
                {backfill.missing > 0 && ` · ${backfill.missing} לא נמצאו`}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={previewBackfill} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition-colors">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <DownloadCloud size={13} />}
              בדוק בנדרים
            </button>
            {backfill && backfill.found > 0 && (
              <button onClick={runBackfill} disabled={busy}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
                עדכן {backfill.found} רשומות
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── חיפוש ── */}
      <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
        <Search size={15} className="text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="חיפוש לפי שם משפחה או מזהה נדרים…"
          className="flex-1 bg-transparent text-sm outline-none" />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">
          טרם בוצעו פריקות
        </p>
      ) : (
        // ⚠️ בלי גלילה לרוחב — עמודות משניות מוסתרות במסך צר.
        // ראו docs/no-horizontal-scroll.md
        <div className="rounded-lg border border-slate-200">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 font-semibold text-slate-500">שם היולדת</th>
                <th className="px-3 py-2 font-semibold text-slate-500">תאריך פריקה</th>
                <th className="hidden px-3 py-2 font-semibold text-slate-500 sm:table-cell">תאריך לידה</th>
                <th className="hidden px-3 py-2 font-semibold text-slate-500 md:table-cell">מועד יעד</th>
                <th className="hidden px-3 py-2 font-semibold text-slate-500 lg:table-cell">כרטיס</th>
                <th className="px-3 py-2 font-semibold text-slate-500">לפני כמה זמן</th>
                <th className="hidden px-3 py-2 font-semibold text-slate-500 sm:table-cell">סיבה</th>
                <th className="px-3 py-2 font-semibold text-slate-500">חזר לארנק</th>
                <th className="px-3 py-2 font-semibold text-slate-500">תוצאה</th>
                <th className="px-3 py-2 font-semibold text-slate-500">תיק</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => (
                <tr key={r.aidId} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">{r.motherName}</span>
                    {r.silent && (
                      <span className="mr-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                        לידה שקטה
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-emerald-700">{fmtDT(r.unloadedAt)}</td>
                  <td className="hidden px-3 py-2 text-slate-500 sm:table-cell">{fmt(r.birthDate)}</td>
                  <td className="hidden px-3 py-2 text-slate-500 md:table-cell">{fmt(r.dueDate)}</td>
                  <td className="hidden px-3 py-2 text-slate-500 lg:table-cell">
                    {r.cardLast4 ? `••${r.cardLast4}` : '—'}
                  </td>
                  {/* ⚠️ "לפני X ימים" ולא רק תאריך: המספר הוא מה שמסגיר
                      פריקה שנתקעה — 12 יום בלי פריקה חדשה הוא הסימן
                      שהמנגנון שבור. */}
                  <td className="px-3 py-2">
                    {(() => {
                      const d = daysSince(r.unloadedAt)
                      return (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          d != null && d <= 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {daysLabel(d)}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="hidden px-3 py-2 text-slate-500 sm:table-cell">{r.reason}</td>
                  {/* 🔴 הסכום שחזר בפועל. ⚠️ "לא נשמר" ולא ₪0 בפריקות
                      היסטוריות שקדמו לעמודה — אפס הוא נתון, וכאן אין נתון. */}
                  <td className="px-3 py-2">
                    {r.returnedAmount != null ? (
                      <span className={r.returnedAmount > 0 ? 'font-bold text-indigo-700' : 'text-slate-400'}>
                        {ils(r.returnedAmount)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-300">לא נשמר</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.alreadySpent ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        נוצל במלואו
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        נפרק
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/maternity/${r.aidId}`}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                      <ExternalLink size={12} /> לתיק
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="border-t border-slate-100 px-3 py-4 text-center text-xs text-slate-400">
              אין תוצאות לחיפוש
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value, note, color, bg, border }: {
  icon: React.ReactNode; label: string; value: string; note?: string
  color: string; bg: string; border: string
}) {
  return (
    <div className={`rounded-xl border ${border} ${bg} p-3`}>
      <div className={`mb-1 inline-flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-xs font-medium text-slate-600">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {note && <p className="mt-0.5 text-[10px] text-slate-400">{note}</p>}
    </div>
  )
}
