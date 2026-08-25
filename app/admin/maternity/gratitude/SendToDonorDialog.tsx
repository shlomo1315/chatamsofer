'use client'

import { useState, useEffect, useMemo } from 'react'
import { Send, X, Loader2, Eye, Mail, Paperclip, AlertTriangle } from 'lucide-react'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'
import { wasSentToDonor } from '@/lib/gratitudeBatch'
import type { GratitudeRow } from './GratitudeTable'

// ─────────────────────────────────────────────────────────────────────────────
// שליחת ברכות לנדיב.
//
// 🔴 עד כה השליחה הייתה עיוורת: המזכירה הקלידה כתובת ולחצה "שלח", בלי
// לראות מה הנדיב מקבל ובלי לדעת מאיזו תיבה זה יוצא. מייל לנדיב הוא
// פנייה חיצונית שאי אפשר לבטל אחריה.
//
// שלושה דברים נבחרים כאן, ולכל אחד ברירת מחדל שהיא המקרה הנפוץ:
//   · אילו ברכות  — ברירת מחדל: אלה שטרם נשלחו
//   · מאיזו תיבה  — ברירת מחדל: עזר יולדות
//   · לאיזו כתובת — הקלדה
//
// ⚠️ התצוגה המקדימה נבנית מאותה donorEmailHtml שהשליחה משתמשת בה. תצוגה
// שנבנית בנפרד נסחפת, וזו הבטחה שקרית.
// ─────────────────────────────────────────────────────────────────────────────

/** התיבות שמהן אפשר לשלוח. ⚠️ mailboxOnly מסוננות — הן לקליטה בלבד. */
const SENDABLE: DepartmentKey[] = (Object.keys(DEPARTMENTS) as DepartmentKey[])
  .filter(k => !DEPARTMENTS[k].mailboxOnly && !DEPARTMENTS[k].noReply)

interface Preview {
  subject: string
  html: string
  fromEmail: string
  fromName: string
  attachmentNote: string
}

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

export default function SendToDonorDialog({ rows, preselected, onClose, onSent }: {
  /** כל הברכות — הבחירה נעשית כאן. */
  rows: GratitudeRow[]
  /** ברכות שסומנו בטבלה. ריק = בחירה לפי הפילוח שלהלן. */
  preselected: string[]
  onClose: () => void
  onSent: (ids: string[], email: string) => void
}) {
  const [email, setEmail] = useState('')
  const [from, setFrom] = useState<DepartmentKey>('maternity')
  // ⚠️ ברירת המחדל היא "טרם נשלחו" — זה השימוש השבועי. כשהמזכירה סימנה
  // ברכות בטבלה, הבחירה שלה גוברת.
  const [scope, setScope] = useState<'unsent' | 'all' | 'selected'>(
    preselected.length > 0 ? 'selected' : 'unsent')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const ids = useMemo(() => {
    if (scope === 'selected') return preselected
    if (scope === 'unsent') return rows.filter(r => !wasSentToDonor(r)).map(r => r.id)
    return rows.map(r => r.id)
  }, [scope, preselected, rows])

  // ⚠️ התצוגה המקדימה נטענת מחדש כשמשתנה התיבה: כתובת השולח היא חלק
  // ממה שהנדיב רואה.
  useEffect(() => {
    const first = ids[0]
    if (!first) { setPreview(null); return }
    let cancelled = false
    setLoadingPreview(true)
    fetch('/api/admin/gratitude/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: first, from }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setPreview(j) })
      .catch(() => { if (!cancelled) setPreview(null) })
      .finally(() => { if (!cancelled) setLoadingPreview(false) })
    return () => { cancelled = true }
  }, [ids, from])

  const alreadySent = useMemo(
    () => ids.filter(id => rows.find(r => r.id === id && wasSentToDonor(r))).length,
    [ids, rows])

  async function send() {
    if (!isValidEmail(email)) { setErr('כתובת מייל לא תקינה'); return }
    setSending(true); setErr(null)
    try {
      const res = await fetch('/api/admin/gratitude/send-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, email: email.trim(), from }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error ?? 'שגיאה בשליחה')
      onSent(ids, email.trim())
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בשליחה')
    } finally {
      setSending(false)
    }
  }

  const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
        on ? 'border-pink-400 bg-pink-50 text-pink-800 ring-2 ring-pink-100'
           : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
      {children}
    </button>
  )

  const unsentCount = rows.filter(r => !wasSentToDonor(r)).length

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => !sending && onClose()} />

      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* ── כותרת ── */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <Send size={18} className="text-pink-600" /> שליחת ברכות לנדיב
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              כל ברכה נשלחת כשובר PDF מעוצב במייל נפרד
            </p>
          </div>
          <button onClick={onClose} disabled={sending}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        {/* ── גוף: הגדרות משמאל, תצוגה מקדימה מימין ── */}
        <div className="grid flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,320px)_1fr]">

          {/* ── הגדרות ── */}
          <div className="flex flex-col gap-4">

            {/* אילו ברכות */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-700">אילו ברכות לשלוח</p>
              <div className="flex flex-wrap gap-1.5">
                {preselected.length > 0 && (
                  <Chip on={scope === 'selected'} onClick={() => setScope('selected')}>
                    שסומנו ({preselected.length})
                  </Chip>
                )}
                <Chip on={scope === 'unsent'} onClick={() => setScope('unsent')}>
                  טרם נשלחו ({unsentCount})
                </Chip>
                <Chip on={scope === 'all'} onClick={() => setScope('all')}>
                  הכל ({rows.length})
                </Chip>
              </div>
            </div>

            {/* מאיזו תיבה */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-700">שליחה מהתיבה</p>
              <select value={from} onChange={e => setFrom(e.target.value as DepartmentKey)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm
                           focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/30">
                {SENDABLE.map(k => (
                  <option key={k} value={k}>{DEPARTMENTS[k].label} · {DEPARTMENTS[k].email}</option>
                ))}
              </select>
            </div>

            {/* לאיזו כתובת */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-700">כתובת המייל של הנדיב</p>
              <input type="email" dir="ltr" value={email}
                onChange={e => { setEmail(e.target.value); setErr(null) }}
                placeholder="donor@example.com"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm
                           focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/30" />
            </div>

            {/* סיכום + אזהרת כפילות */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-2xl font-bold text-slate-800">
                {ids.length}
                <span className="mr-1.5 text-sm font-medium text-slate-500">
                  {ids.length === 1 ? 'ברכה' : 'ברכות'}
                </span>
              </p>
              {/* ⚠️ אזהרה ולא חסימה: שליחה חוזרת לגיטימית (נדיב אחר,
                  כתובת שהשתנתה) — אבל היא חייבת להיות מודעת. */}
              {alreadySent > 0 && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  {alreadySent} מהן כבר נשלחו בעבר — יישלחו שוב
                </p>
              )}
              {ids.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">אין ברכות לשליחה בבחירה הזו.</p>
              )}
            </div>

            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}
          </div>

          {/* ── תצוגה מקדימה ── */}
          <div className="flex min-w-0 flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Eye size={13} /> כך ייראה המייל
              {ids.length > 1 && (
                <span className="font-normal text-slate-400">(הראשונה מבין {ids.length})</span>
              )}
            </p>

            {loadingPreview ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-16">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            ) : preview ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200">
                {/* שורות הכותרת — מה שהנדיב רואה בתיבה שלו */}
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs">
                  <p className="text-slate-500">
                    <span className="font-semibold text-slate-700">מאת:</span>{' '}
                    {preview.fromName} <span dir="ltr">&lt;{preview.fromEmail}&gt;</span>
                  </p>
                  <p className="mt-0.5 text-slate-500">
                    <span className="font-semibold text-slate-700">אל:</span>{' '}
                    <span dir="ltr">{email.trim() || '—'}</span>
                  </p>
                  <p className="mt-0.5 text-slate-500">
                    <span className="font-semibold text-slate-700">נושא:</span> {preview.subject}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-slate-500">
                    <Paperclip size={11} /> {preview.attachmentNote}
                  </p>
                </div>
                {/* 🔴 iframe מבודד ולא dangerouslySetInnerHTML: תוכן המייל
                    כולל סגנונות משלו, והזרקתו לדף שוברת את עיצוב המסך —
                    בדיוק הבאג שהפיל את removeChild במסך המיילים. */}
                <iframe srcDoc={preview.html} title="תצוגה מקדימה של המייל"
                  sandbox="" className="min-h-[340px] w-full flex-1 bg-white" />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-xs text-slate-400">
                <Mail size={16} className="ml-1.5" /> בחרו ברכות כדי לראות תצוגה מקדימה
              </div>
            )}
          </div>
        </div>

        {/* ── פעולות ── */}
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <button onClick={onClose} disabled={sending}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            ביטול
          </button>
          <button onClick={send} disabled={sending || ids.length === 0 || !isValidEmail(email)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-pink-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-40">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? 'שולח…' : `שלח ${ids.length > 0 ? `(${ids.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
