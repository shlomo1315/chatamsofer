'use client'

import { useState, useMemo } from 'react'
import { FileDown, X, Loader2, CheckCircle2, Clock, FileText } from 'lucide-react'
import {
  selectBatch, batchStats, rangeLabel,
  SENT_LABEL,
  type SentFilter, type BatchFilters,
} from '@/lib/gratitudeBatch'
import type { GratitudeRow } from './GratitudeTable'

// ─────────────────────────────────────────────────────────────────────────────
// חלונית הפקת הקובץ המרוכז.
//
// 🔴 עיקר הערך כאן הוא התצוגה המקדימה: המשתמש רואה *לפני* ההורדה כמה
// ברכות ייכנסו ומה הפילוח. בלעדיה הוא היה מוריד קובץ ריק, או קובץ שכולל
// ברכות שכבר נשלחו — וזה בדיוק מה שהוא מנסה למנוע.
//
// ⚠️ ה-PDF נבנה *בשרת*. ניסיון ראשון בנה אותו בדפדפן ונכשל ב-
// "Failed to execute 'atob' on 'Window'": הפונט המוטמע הוא variable font
// של 122KB, ו-embedFont עליו אינו עובד שם. שוברי היולדות והחגים תמיד
// רצו בשרת, וזה המסלול המוכח.
//
// ⚠️ הפילוח נשלח לשרת והתוכן נשלף שם מהמסד — הלקוח קובע מה לסנן, לא
// מה כתוב בברכות.
// ─────────────────────────────────────────────────────────────────────────────

/** ISO → YYYY-MM-DD, לשדות התאריך. */
const asDay = (d: Date) => d.toISOString().slice(0, 10)

export default function BatchPdfDialog({ rows, onClose }: {
  rows: GratitudeRow[]
  onClose: () => void
}) {
  // ⚠️ ברירת מחדל: "טרם נשלחו לנדיב", בלי הגבלת תאריכים. זה השימוש
  // השבועי — "מה חדש מאז הפעם הקודמת" — ומי שרוצה טווח יבחר אותו.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // מסמן איזה מקש הטווח האחרון הופעל — כדי שהכפתור יישאר מסומן אחרי הלחיצה,
  // ולא רק ברע הקליקה עצמה. null = לא נבחר קיצור-דרך 7/30, או שהתאריכים נערכו ידנית.
  const [quickDays, setQuickDays] = useState<number | null>(null)
  const [sent, setSent] = useState<SentFilter>('unsent')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const filters: BatchFilters = useMemo(
    () => ({ from: from || null, to: to || null, sent }),
    [from, to, sent])

  // התצוגה המקדימה משתמשת *בדיוק* באותו selectBatch שמייצר את הקובץ.
  const picked = useMemo(() => selectBatch(rows, filters), [rows, filters])
  const stats = useMemo(() => batchStats(picked), [picked])

  /** קיצורי דרך לטווחים הנפוצים. */
  function quickRange(days: number) {
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - days)
    setFrom(asDay(start))
    setTo(asDay(now))
    setQuickDays(days)
  }

  async function download() {
    setBusy(true); setErr(null)
    try {
      // 🔴 ההפקה בשרת ולא בדפדפן.
      //
      // ⚠️ בדפדפן זה נכשל ב-"Failed to execute 'atob' on 'Window'": הפונט
      // המוטמע הוא variable font של 122KB, ו-embedFont עליו אינו עובד שם.
      // שוברי היולדות והחגים תמיד רצו בשרת — זה המסלול המוכח.
      const post = () => fetch('/api/admin/gratitude/batch-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      })
      let res = await post()
      // ⚠️ ניסיון חוזר על תקלה זמנית של השרת: רילוויי מחזירה 418/502
      // לשנייה-שתיים בזמן פריסה, בעוד האתר עצמו תקין. בלי זה המשתמש
      // רואה "שגיאה בהפקת הקובץ" גנרית בדיוק ברגע שהפצנו עדכון.
      for (let attempt = 0; !res.ok && res.status >= 418 && attempt < 2; attempt++) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
        res = await post()
      }
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error ?? (res.status >= 500 || res.status === 418
          ? 'השרת אינו זמין כרגע — נסו שוב בעוד רגע' : 'שגיאה בהפקת הקובץ'))
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // שם הקובץ נושא את הטווח — כך שכמה הורדות אינן דורסות זו את זו.
      const span = from || to ? `${from || 'הכל'}_${to || 'היום'}` : 'כל-התקופה'
      a.download = `מכתבי ברכה ${span}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // ⚠️ שחרור מושהה: ביטול מיידי מבטל את ההורדה בחלק מהדפדפנים.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בהפקת הקובץ')
    } finally {
      setBusy(false)
    }
  }

  const Btn = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
        on ? 'border-sky-400 bg-sky-50 text-sky-800 ring-2 ring-sky-100'
           : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
      {children}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <FileText size={18} className="text-sky-600" />
              קובץ מרוכז של הברכות
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              כל ברכה בדף נפרד ומעוצב, בקובץ PDF אחד — מוכן למסירה לנדיב
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* ── טווח תאריכים ── */}
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">טווח תאריכים (לפי מועד קבלת הברכה)</p>
          <div className="flex items-center gap-2">
            <label className="flex-1">
              <span className="mb-0.5 block text-[11px] text-slate-500">מתאריך</span>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setQuickDays(null) }}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
            </label>
            <label className="flex-1">
              <span className="mb-0.5 block text-[11px] text-slate-500">עד תאריך</span>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setQuickDays(null) }}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Btn on={quickDays === 7} onClick={() => quickRange(7)}>השבוע האחרון</Btn>
            <Btn on={quickDays === 30} onClick={() => quickRange(30)}>החודש האחרון</Btn>
            <Btn on={!from && !to} onClick={() => { setFrom(''); setTo(''); setQuickDays(null) }}>כל התקופה</Btn>
          </div>
        </div>

        {/* ── מצב המשלוח ── */}
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">מצב המשלוח לנדיב</p>
          <div className="flex flex-wrap gap-1.5">
            {(['unsent', 'sent', 'all'] as SentFilter[]).map(k => (
              <Btn key={k} on={sent === k} onClick={() => setSent(k)}>{SENT_LABEL[k]}</Btn>
            ))}
          </div>
        </div>

        {/* מצב המשלוח נשאר בלבד — הסטטוס (מאושר/ממתין/נדחה) הוסר כאן: עניין
            האישור אינו רלוונטי למסמך הנמסר לנדיב — ברכה מאושרת שטרם נשלחה וברכה
            שממתינה לאישור נכנסות באותה מידה — רק ברכות שנדחו מוצאות אוטומטית. */}

        {/* ── תצוגה מקדימה ──
            🔴 מה שנמצא כאן הוא בדיוק מה שייכנס לקובץ: אותו selectBatch. */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-slate-600">ייכנסו לקובץ</span>
            <span className="text-xs text-slate-500">{rangeLabel(filters.from, filters.to)}</span>
          </div>
          <p className="mb-2 text-2xl font-bold text-slate-800">
            {stats.total}
            <span className="mr-1.5 text-sm font-medium text-slate-500">ברכות</span>
          </p>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
              <Clock size={11} /> {stats.unsent} טרם נשלחו
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
              <CheckCircle2 size={11} /> {stats.sent} נשלחו
            </span>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">
              {stats.approved} מאושרות
            </span>
            {stats.received > 0 && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                {stats.received} ממתינות
              </span>
            )}
          </div>
          {stats.total === 0 && (
            /* ⚠️ נאמר במפורש ולא מוצג 0 בשקט — אחרת המשתמש מוריד קובץ ריק. */
            <p className="mt-2 text-xs text-amber-700">
              אין ברכות התואמות לסינון. שנו את הטווח או את הסינון.
            </p>
          )}
        </div>

        {err && (
          <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>
        )}

        <button
          onClick={download}
          disabled={busy || stats.total === 0}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
          {busy ? 'מפיק…' : `הורד PDF (${stats.total})`}
        </button>
      </div>
    </div>
  )
}
