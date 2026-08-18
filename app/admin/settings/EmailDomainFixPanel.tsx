'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Loader2, AlertTriangle, Check, Download } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// תיקון קבוצתי של שגיאות כתיב בדומיין המייל.
//
// הרקע: נרשמים שהקלידו את כתובתם ידנית (בעיקר דרך נדרים) שגו בדומיין —
// gnail, gmial, gmail.con. כל מייל אליהם נופל, כולל שובר החלוקה.
//
// 🔴 שני שלבים במכוון: סריקה שמראה בדיוק מה יקרה, ורק אז אישור. זו כתיבה
// על כתובות של אנשים אמיתיים, ומספר מסכם לבדו אינו מספיק כדי לאשר אותה.
// ─────────────────────────────────────────────────────────────────────────────

interface Group { fromDomain: string; toDomain: string; count: number }
interface Fix {
  id: string; name: string; original: string; fixed: string
  fromDomain: string; toDomain: string; verified: boolean
}

export default function EmailDomainFixPanel() {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const [data, setData] = useState<{ total: number; fixable: number; groups: Group[]; fixes: Fix[] } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const r = await fetch('/api/admin/email-domain-fix', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error || 'הסריקה נכשלה'); return }
      setData(d)
      if (!d.fixable) toast.info('לא נמצאו שגיאות כתיב בדומיין')
    } catch { toast.error('הסריקה נכשלה') }
    finally { setScanning(false) }
  }, [toast])

  const apply = async (fromDomain?: string) => {
    setApplying(fromDomain ?? 'all')
    try {
      const r = await fetch('/api/admin/email-domain-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fromDomain ? { from_domain: fromDomain } : {}),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error || 'התיקון נכשל'); return }
      toast.success(`${d.fixed} כתובות תוקנו${d.failed ? ` · ${d.failed} נכשלו` : ''}`)
      await scan()
      router.refresh()
    } catch { toast.error('התיקון נכשל') }
    finally { setApplying(null) }
  }

  // ⚠️ ייצוא של מה שנשאר: כתובת עם דומיין תקין ושם שגוי אינה ניתנת לתיקון
  // אוטומטי, והרשימה הזו היא מה שבאמת דורש טיפול אנושי.
  const exportCsv = () => {
    if (!data?.fixes.length) return
    const head = 'שם,כתובת נוכחית,תיקון מוצע,מאומת\n'
    const body = data.fixes.map(f =>
      `"${f.name}","${f.original}","${f.fixed}","${f.verified ? 'כן' : 'לא'}"`).join('\n')
    const blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'כתובות-לתיקון.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-right transition hover:bg-slate-50">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Wrench size={17} />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">תיקון שגיאות כתיב במייל</p>
            <p className="text-xs text-slate-500 mt-0.5">
              gnail · gmial · gmail.con — זיהוי ותיקון קבוצתי
            </p>
          </div>
        </div>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 flex flex-col gap-4">
          {/* 🔴 הגבול של הכלי — נאמר לפני הסריקה ולא אחריה, כדי שלא ייווצר
              רושם שהוא פותר את כל בעיית הכתובות. */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] text-amber-900">
            <p className="flex items-center gap-1.5 font-bold">
              <AlertTriangle size={13} /> מה הכלי מתקן ומה לא
            </p>
            <p className="mt-1.5">
              ✅ <b className="ltr-num">yosi@gnail.com</b> → <b className="ltr-num">yosi@gmail.com</b> —
              הדומיין שגוי והשם תקין, יש רק אפשרות אחת.
            </p>
            <p className="mt-1">
              ❌ <b className="ltr-num">yosi123@gmail.com</b> שאינו קיים — הדומיין מושלם והשם שגוי.
              אי אפשר לנחש, ואלה נשארים לטיפול ידני.
            </p>
            <p className="mt-1.5 text-amber-800">
              התיקון אינו מסמן את הכתובת כמאומתת — היא עוברת קוד אימות כרגיל.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void scan()} disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-900 disabled:opacity-50">
              {scanning ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
              סריקת כל המאגר
            </button>
            {data && data.fixes.length > 0 && (
              <button type="button" onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600">
                <Download size={13} /> ייצוא לאקסל
              </button>
            )}
          </div>

          {data && (
            <>
              <p className="text-[12px] text-slate-500">
                נסרקו <b className="text-slate-700">{data.total.toLocaleString('he-IL')}</b> כתובות ·
                נמצאו <b className={data.fixable ? 'text-emerald-700' : 'text-slate-700'}>{data.fixable}</b> שגיאות כתיב ניתנות לתיקון
              </p>

              {data.groups.map(g => (
                <div key={g.fromDomain} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="text-[13px] ltr-num">
                      <b className="text-rose-600">{g.fromDomain}</b>
                      <span className="mx-1.5 text-slate-400">→</span>
                      <b className="text-emerald-700">{g.toDomain}</b>
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                      {g.count}
                    </span>
                    <button type="button"
                      onClick={() => setExpanded(expanded === g.fromDomain ? null : g.fromDomain)}
                      className="text-[11px] font-bold text-slate-500 hover:text-indigo-600">
                      {expanded === g.fromDomain ? 'הסתרה' : 'הצגת השמות'}
                    </button>
                    <button type="button" onClick={() => void apply(g.fromDomain)} disabled={!!applying}
                      className="mr-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                      {applying === g.fromDomain ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      תיקון {g.count}
                    </button>
                  </div>
                  {expanded === g.fromDomain && (
                    <div className="max-h-56 overflow-y-auto border-t border-slate-100 bg-slate-50/60 px-3.5 py-2 flex flex-col gap-1">
                      {data.fixes.filter(f => f.fromDomain === g.fromDomain).map(f => (
                        <p key={f.id} className="text-[11.5px] text-slate-600">
                          <span className="font-medium text-slate-800">{f.name}</span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span className="ltr-num">{f.original}</span>
                          <span className="mx-1 text-slate-400">→</span>
                          <span className="ltr-num text-emerald-700">{f.fixed}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {data.fixable > 0 && (
                <button type="button" onClick={() => void apply()} disabled={!!applying}
                  className="inline-flex items-center gap-1.5 self-start rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">
                  {applying === 'all' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  תיקון כל {data.fixable} הכתובות
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
