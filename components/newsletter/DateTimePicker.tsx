'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { HDate } from '@hebcal/core'
import { CalendarClock } from 'lucide-react'

// HebrewDatePicker נשען על @hebcal/core (כבד) — טוענים אותו רק בדפדפן
const HebrewDatePicker = dynamic(() => import('@/components/ui/HebrewDatePicker'), {
  ssr: false,
  loading: () => (
    <div className="h-[42px] w-full animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
  ),
})

const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = ['00', '15', '30', '45']

// ברירת מחדל לשעה כשנבחר תאריך בלי שעה
const DEFAULT_TIME = { h: '09', m: '00' }

/** פירוק מחרוזת datetime-local ('YYYY-MM-DDTHH:mm') לחלקיה. */
function parse(value: string): { date: string; h: string; m: string } {
  const [d = '', t = ''] = value.split('T')
  const [h = '', m = ''] = t.split(':')
  return { date: d, h, m }
}

/** עיגול דקות לרבע השעה הקרוב כלפי מעלה (המבחר מציע רק 00/15/30/45). */
function roundQuarter(d: Date): { h: string; m: string } {
  const q = Math.ceil(d.getMinutes() / 15) * 15
  const dd = new Date(d)
  dd.setMinutes(q, 0, 0)
  return { h: pad(dd.getHours()), m: pad(dd.getMinutes()) }
}

export default function DateTimePicker({ value, onChange, min }: {
  /** מחרוזת בפורמט datetime-local ('YYYY-MM-DDTHH:mm') או '' */
  value: string
  onChange: (v: string) => void
  /** המועד המוקדם ביותר שניתן לבחור */
  min?: Date
}) {
  const { date, h, m } = parse(value)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // עדכון חלקי — משלים ערכי ברירת מחדל כדי שתמיד תצא מחרוזת שלמה
  function emit(next: { date?: string; h?: string; m?: string }) {
    const d = next.date ?? date
    if (!d) { onChange(''); return }
    const hh = next.h ?? h ?? ''
    const mm = next.m ?? m ?? ''
    onChange(`${d}T${hh || DEFAULT_TIME.h}:${mm || DEFAULT_TIME.m}`)
  }

  // התאריך המלא שנבחר (לצורך תצוגת הסיכום)
  const picked = value ? new Date(value) : null
  const valid = picked && !isNaN(picked.getTime())
  const tooEarly = Boolean(valid && min && picked! < min)

  // תצוגת סיכום — "יישלח ביום ראשון, כ״ז בתמוז תשפ״ו · 15/07/2026 בשעה 09:00"
  let summary = ''
  if (valid && mounted) {
    const weekday = picked!.toLocaleDateString('he-IL', { weekday: 'long' })
    let hebrew = ''
    try { hebrew = new HDate(picked!).renderGematriya(true) } catch { /* ignore */ }
    const greg = picked!.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const time = `${pad(picked!.getHours())}:${pad(picked!.getMinutes())}`
    summary = `יישלח ביום ${weekday}, ${hebrew} · ${greg} בשעה ${time}`
  }

  return (
    <div dir="rtl" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        {/* תאריך — לוח עברי/לועזי */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">תאריך</label>
          <HebrewDatePicker
            value={date}
            maxToday={false}
            onChange={iso => {
              // תאריך ראשון שנבחר — משלימים שעה סבירה (עכשיו מעוגל, או 09:00)
              if (!h && !m) {
                const base = min && min > new Date() ? min : new Date()
                const t = roundQuarter(base)
                // אם התאריך שנבחר מאוחר מ-min, אין סיבה להיצמד לשעת ה-min
                const sameDay = min ? iso === `${min.getFullYear()}-${pad(min.getMonth() + 1)}-${pad(min.getDate())}` : false
                emit({ date: iso, ...(sameDay ? t : DEFAULT_TIME) })
              } else {
                emit({ date: iso })
              }
            }}
          />
        </div>

        {/* שעה — בוררים נפרדים לשעות ולדקות */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">שעה</label>
          <div className="flex items-center gap-1.5" dir="ltr">
            <select
              value={h || DEFAULT_TIME.h}
              onChange={e => emit({ h: e.target.value })}
              aria-label="שעה"
              className="rounded-xl border border-slate-300 bg-white px-2.5 py-2.5 text-sm tabular-nums
                         focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <span className="text-sm font-bold text-slate-400">:</span>
            <select
              value={m || DEFAULT_TIME.m}
              onChange={e => emit({ m: e.target.value })}
              aria-label="דקות"
              className="rounded-xl border border-slate-300 bg-white px-2.5 py-2.5 text-sm tabular-nums
                         focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {MINUTES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* סיכום — מה בדיוק ייקרה */}
      {summary && (
        <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${
          tooEarly
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-indigo-200 bg-indigo-50 text-indigo-800'
        }`}>
          <CalendarClock size={17} className="mt-0.5 flex-shrink-0" />
          <span>
            {summary}
            {tooEarly && (
              <span className="mt-0.5 block text-xs font-normal">
                המועד כבר עבר — יש לבחור מועד עתידי.
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
