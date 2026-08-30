'use client'

import { useState, useMemo } from 'react'
import { FileDown, X, CheckCircle2, Clock, FileText, Loader2, AlertTriangle } from 'lucide-react'
import {
  selectBatch, batchStats, rangeLabel,
  SENT_LABEL,
  type SentFilter, type BatchFilters,
} from '@/lib/gratitudeBatch'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'
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
  // מצב ההורדה — הכפתור נעול בזמן ההפקה, והשגיאה מוצגת במקום להיבלע.
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
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
    // 🔴 לא iframe מוסתר.
    //
    // ⚠️ ה-iframe בלע כל שגיאה: כשהשרת החזיר JSON של שגיאה או 500 במקום
    // PDF, התשובה נכנסה ל-iframe הנסתר, החלון נסגר מיד, ולמשתמש זה נראה
    // כאילו "הכפתור לא עובד" — בלי שום הודעה ובלי דרך לדעת מה קרה.
    //
    // ⚠️ נטפרי גם חוסם PDF בתוך iframe. הורדה דרך blob היא ניווט מלא
    // לדומיין שלנו, שאינו נחסם.
    setBusy(true); setErr('')
    try {
      const query = new URLSearchParams({ sent })
      if (from) query.set('from', from)
      if (to) query.set('to', to)

      const res = await fetch(`/api/admin/gratitude/batch-pdf?${query}`, { cache: 'no-store' })
      if (!res.ok) {
        // 🔴 418 = נטפרי חסמה את הבקשה, ולא כשל של המערכת.
        //
        // ⚠️ נטפרי חוסמת את *כל* הדומיין railway.app, כולל /api/health.
        // מי שנכנס דרך כתובת ה-Railway במקום דרך chasamsofer.co.il מקבל
        // חסימה על כל פעולה — והיא נראית כמו תקלה בתוכנה. ההודעה מפנה
        // לדומיין הנכון במקום להציג מספר שאין לו משמעות למשתמש.
        if (res.status === 418) {
          setErr('הגישה נחסמה על ידי הסינון (נטפרי). יש להיכנס לכתובת https://chasamsofer.co.il ולא לכתובת הזמנית של השרת.')
          return
        }
        // השרת מחזיר JSON על שגיאה — מציגים את ההודעה האמיתית ולא "נכשל".
        let msg = `הפקת הקובץ נכשלה (${res.status})`
        try {
          const d = await res.json()
          if (d?.error) msg = String(d.error)
        } catch { /* לא JSON — נשארת ההודעה הכללית */ }
        setErr(msg)
        return
      }

      // 🔴 השרת מחזיר JSON עם base64 מעורבל ולא PDF — ראו batch-pdf/route.
      // תגובת application/pdf נחסמת ע"י נטפרי ב-418, וזה מה שהפיל את
      // ההורדה. כאן מרכיבים את הקובץ מקומית, בלי שהוא עובר ברשת כקובץ.
      const payload = await res.json()
      if (!payload?.data) { setErr('הקובץ שהתקבל ריק — נסו שוב או צמצמו את הטווח'); return }

      const binary = atob(payload.data as string)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      // ביטול הערבול שנעשה בשרת (אותה פונקציה — היא סימטרית).
      if (payload.enc === DOC_CIPHER_ID) scrambleBytes(bytes)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      if (blob.size === 0) { setErr('הקובץ שהתקבל ריק — נסו שוב או צמצמו את הטווח'); return }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'מכתבי ברכה.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? `שגיאת רשת: ${e.message}` : 'שגיאת רשת — נסו שוב')
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
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-600" />
            <p className="flex-1 text-xs leading-relaxed text-red-800">{err}</p>
          </div>
        )}

        <button
          onClick={download}
          disabled={stats.total === 0 || busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
          {busy ? `מפיק ${stats.total} ברכות — עשוי לקחת מספר שניות…` : `הורד PDF (${stats.total})`}
        </button>
      </div>
    </div>
  )
}
