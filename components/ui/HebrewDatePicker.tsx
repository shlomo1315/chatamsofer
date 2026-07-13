'use client'
import { useState, useEffect, useRef } from 'react'
import { HDate, gematriya } from '@hebcal/core'
import { Calendar, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react'

const HEB_MONTHS: Record<number, string> = {
  1: 'ניסן', 2: 'אייר', 3: 'סיון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
  7: 'תשרי', 8: 'חשון', 9: 'כסלו', 10: 'טבת', 11: 'שבט', 12: 'אדר', 13: 'אדר ב׳',
}
function monthName(m: number, year: number): string {
  if (m === 12 && HDate.isLeapYear(year)) return 'אדר א׳'
  return HEB_MONTHS[m] ?? String(m)
}
// סדר החודשים בשנה העברית (מתשרי): 7..12(,13),1..6
function hebMonthsOrder(year: number): number[] {
  const base = [7, 8, 9, 10, 11, 12]
  if (HDate.isLeapYear(year)) base.push(13)
  return [...base, 1, 2, 3, 4, 5, 6]
}
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] // ראשון..שבת
const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const sameYMD = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

type Cell = { date: Date; label: string } | null

export default function HebrewDatePicker({ value, onChange, maxToday = true, yearFirst = false, birthYearRange, minMonthsBack, minDaysBack, minDateMessage }: {
  value: string
  onChange: (iso: string) => void
  maxToday?: boolean
  // yearFirst — פתיחה ישר לרשימת השנים (מתאים לתאריך לידה של מבוגר). ברירת מחדל: תצוגת ימים.
  yearFirst?: boolean
  // birthYearRange — רשימת השנים תתחיל בגיל minAge (למשל 18), כך שטווח הגילאים הרלוונטי
  // מוצג בראש בלי צורך לגלול. אינו חוסם — ניתן לגלול לשנים מבוגרות יותר.
  birthYearRange?: { minAge: number; maxAge: number }
  // minMonthsBack — חוסם בחירת תאריך מוקדם מ-N חודשים אחורה מהיום.
  minMonthsBack?: number
  // minDaysBack — חוסם בחירת תאריך מוקדם מ-N ימים אחורה. עדיף על minMonthsBack
  // כשהחוק נמדד בימים: חלון הזכאות ליולדת הוא 42 יום, ו"חודשיים" נותנים ~60 —
  // כמעט שבועיים וחצי יותר מהמותר. גובר על minMonthsBack אם שניהם הוגדרו.
  minDaysBack?: number
  // ההסבר שמוצג כשנלחץ תאריך מוקדם מדי. בלעדיו הלחיצה פשוט לא עושה כלום,
  // והמשתמש לא מבין למה. הטקסט נמסר מבחוץ — הרכיב עצמו גנרי.
  minDateMessage?: string
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  // התאריך המוקדם ביותר שניתן לבחור
  const minDate = minDaysBack != null
    ? (() => { const d = new Date(today); d.setDate(d.getDate() - minDaysBack); return d })()
    : minMonthsBack != null
      ? (() => { const d = new Date(today); d.setMonth(d.getMonth() - minMonthsBack); return d })()
      : null
  const selected = value ? new Date(value) : null
  if (selected) selected.setHours(0, 0, 0, 0)

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'hebrew' | 'gregorian'>('hebrew')
  const [view, setView] = useState<'days' | 'months' | 'years'>(yearFirst ? 'years' : 'days')
  const [g, setG] = useState<Date>(selected ?? today)               // חודש לועזי מוצג
  const [hc, setHc] = useState(() => { const h = new HDate(selected ?? today); return { hy: h.getFullYear(), hm: h.getMonth() } })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setNotice(null) }
    }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [])
  useEffect(() => {
    if (value) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) { setG(d); const h = new HDate(d); setHc({ hy: h.getFullYear(), hm: h.getMonth() }) }
    }
  }, [value])

  const pick = (d: Date) => {
    const dd = new Date(d); dd.setHours(0, 0, 0, 0)
    if (maxToday && dd > today) return
    // תאריך מוקדם מדי: קודם התעלמנו בשקט, והמשתמש נשאר בלי מושג למה
    // הלחיצה שלו לא עשתה כלום. עכשיו מסבירים.
    if (minDate && dd < minDate) {
      setNotice(minDateMessage ?? 'לא ניתן לבחור תאריך מוקדם מזה.')
      return
    }
    setNotice(null)
    onChange(isoOf(dd))
    setOpen(false)
  }

  // תאי הלוח
  function gregCells(): Cell[] {
    const y = g.getFullYear(), m = g.getMonth()
    const offset = new Date(y, m, 1).getDay()
    const dim = new Date(y, m + 1, 0).getDate()
    const cells: Cell[] = Array(offset).fill(null)
    for (let d = 1; d <= dim; d++) cells.push({ date: new Date(y, m, d), label: String(d) })
    return cells
  }
  function hebCells(): Cell[] {
    const { hy, hm } = hc
    const dim = HDate.daysInMonth(hm, hy)
    const offset = new HDate(1, hm, hy).greg().getDay()
    const cells: Cell[] = Array(offset).fill(null)
    for (let d = 1; d <= dim; d++) cells.push({ date: new HDate(d, hm, hy).greg(), label: gematriya(d) })
    return cells
  }

  const gPrev = () => setG(new Date(g.getFullYear(), g.getMonth() - 1, 1))
  const gNext = () => setG(new Date(g.getFullYear(), g.getMonth() + 1, 1))
  const hPrev = () => { const a = new HDate(1, hc.hm, hc.hy).abs(); const p = new HDate(a - 1); setHc({ hy: p.getFullYear(), hm: p.getMonth() }) }
  const hNext = () => { const a = new HDate(1, hc.hm, hc.hy).abs(); const n = new HDate(a + HDate.daysInMonth(hc.hm, hc.hy)); setHc({ hy: n.getFullYear(), hm: n.getMonth() }) }

  // האם החודש הבא חורג מהיום (לחסימת ניווט קדימה)
  const nextDisabled = (() => {
    if (!maxToday) return false
    if (mode === 'gregorian') {
      const ny = g.getMonth() === 11 ? g.getFullYear() + 1 : g.getFullYear()
      const nm = (g.getMonth() + 1) % 12
      return new Date(ny, nm, 1) > today
    }
    const a = new HDate(1, hc.hm, hc.hy).abs()
    const nextFirst = new HDate(a + HDate.daysInMonth(hc.hm, hc.hy)).greg()
    nextFirst.setHours(0, 0, 0, 0)
    return nextFirst > today
  })()

  // האם החודש הקודם מוקדם כולו מ-minDate (לחסימת ניווט אחורה מעבר לתקרה)
  const prevDisabled = (() => {
    if (!minDate) return false
    if (mode === 'gregorian') {
      const prevLast = new Date(g.getFullYear(), g.getMonth(), 0); prevLast.setHours(0, 0, 0, 0)
      return prevLast < minDate
    }
    const a = new HDate(1, hc.hm, hc.hy).abs()
    const prevLast = new HDate(a - 1).greg(); prevLast.setHours(0, 0, 0, 0)
    return prevLast < minDate
  })()

  const cells = mode === 'hebrew' ? hebCells() : gregCells()

  const triggerLabel = selected
    ? (() => { const h = new HDate(selected); return `${gematriya(h.getDate())} ${monthName(h.getMonth(), h.getFullYear())} ${gematriya(h.getFullYear() % 1000)}  ·  ${selected.toLocaleDateString('he-IL')}` })()
    : 'לחצו לבחירת תאריך'

  return (
    <div className="relative" ref={ref} dir="rtl">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm text-right transition-colors ${open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-300'} ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
        <Calendar size={16} className="text-slate-400 flex-shrink-0" />
        <span className="flex-1 truncate">{triggerLabel}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-[300px] max-w-[90vw] rounded-2xl border border-slate-200 bg-white shadow-xl p-3">
          {/* טאבים — סוג לוח */}
          <p className="text-xs text-slate-400 mb-1.5 text-center">נא לבחור סוג לוח</p>
          <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1 mb-3">
            {([['hebrew', 'לוח עברי'], ['gregorian', 'לוח לועזי']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setMode(k); setView(yearFirst ? 'years' : 'days') }}
                className={`py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* הסבר על תאריך חסום — מופיע רק אחרי ניסיון בחירה, ולא כאזהרה קבועה */}
          {notice && (
            <div role="alert" className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
              <p className="text-[13px] leading-snug font-medium">{notice}</p>
            </div>
          )}

          {/* כותרת ניווט — קליק על החודש/שנה פותח רשימת בחירה */}
          <div className="flex items-center justify-between mb-2">
            {/* כשיש minDateMessage הניווט אחורה נשאר פתוח: אחרת המשתמש נתקע מול
                חץ מושבת בלי לדעת למה, ולא מגיע לתאריך שיציג לו את ההסבר. */}
            <button type="button" disabled={prevDisabled && !minDateMessage} onClick={mode === 'hebrew' ? hPrev : gPrev} className={`p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed ${view !== 'days' ? 'invisible' : ''}`} title="חודש קודם"><ChevronRight size={18} /></button>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setView(v => v === 'months' ? 'days' : 'months')}
                className={`text-sm font-bold rounded-lg px-2.5 py-1 transition-colors ${view === 'months' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-800 hover:bg-slate-100'}`}>
                {mode === 'hebrew' ? monthName(hc.hm, hc.hy) : g.toLocaleDateString('he-IL', { month: 'long' })}
              </button>
              <button type="button" onClick={() => setView(v => v === 'years' ? 'days' : 'years')}
                className={`text-sm font-bold rounded-lg px-2.5 py-1 transition-colors ${view === 'years' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-800 hover:bg-slate-100'}`}>
                {mode === 'hebrew' ? gematriya(hc.hy % 1000) : g.getFullYear()}
              </button>
            </div>
            <button type="button" disabled={nextDisabled} onClick={mode === 'hebrew' ? hNext : gNext}
              className={`p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed ${view !== 'days' ? 'invisible' : ''}`} title="חודש הבא"><ChevronLeft size={18} /></button>
          </div>

          {view === 'days' && (
            <>
              {/* ימות השבוע */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map(d => <div key={d} className="text-center text-[11px] font-semibold text-slate-400 py-1">{d}</div>)}
              </div>
              {/* ימים */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((c, i) => {
                  if (!c) return <div key={i} />
                  // תאריך עתידי — חסום לחלוטין (אין מה להסביר).
                  // תאריך מוקדם מדי — נשאר לחיץ בכוונה: כפתור disabled אינו יורה
                  // onClick, ואז הלחיצה "לא עושה כלום" בלי שום הסבר. כאן הלחיצה
                  // מציגה את הסיבה (minDateMessage).
                  const tooLate = maxToday && c.date > today
                  const tooEarly = !!minDate && c.date < minDate
                  const dim = tooLate || tooEarly
                  const isSel = selected && sameYMD(c.date, selected)
                  const isToday = sameYMD(c.date, today)
                  return (
                    <button key={i} type="button" disabled={tooLate} onClick={() => pick(c.date)}
                      title={tooEarly ? 'מחוץ לטווח ההגשה — לחצו לפרטים' : undefined}
                      className={`h-9 rounded-lg text-sm flex items-center justify-center transition-colors
                        ${isSel ? 'bg-indigo-600 text-white font-bold'
                          : tooEarly ? 'text-slate-300 hover:bg-amber-50 hover:text-amber-700 cursor-help'
                          : dim ? 'text-slate-300 cursor-not-allowed'
                          : isToday ? 'bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100'
                          : 'text-slate-700 hover:bg-slate-100'}`}>
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {view === 'months' && (
            <div className="grid grid-cols-3 gap-1.5">
              {(mode === 'hebrew' ? hebMonthsOrder(hc.hy) : [0,1,2,3,4,5,6,7,8,9,10,11]).map(m => {
                const label = mode === 'hebrew' ? monthName(m as number, hc.hy) : new Date(2000, m as number, 1).toLocaleDateString('he-IL', { month: 'long' })
                const isCur = mode === 'hebrew' ? hc.hm === m : g.getMonth() === m
                return (
                  <button key={m} type="button"
                    onClick={() => { if (mode === 'hebrew') setHc(c => ({ ...c, hm: m as number })); else setG(new Date(g.getFullYear(), m as number, 1)); setView('days') }}
                    className={`py-2.5 rounded-lg text-sm transition-colors ${isCur ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-100'}`}>
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          {view === 'years' && (() => {
            const todayHy = new HDate(today).getFullYear()
            const todayGy = today.getFullYear()
            const topH = maxToday ? todayHy : todayHy + 5
            const topG = maxToday ? todayGy : todayGy + 5
            // ברירת מחדל לגיל: אם birthYearRange מוגדר — מתחילים בגיל minAge (השנים
            // הרלוונטיות לזוג נשוי מוצגות בראש), מבלי לחסום שנים מבוגרות יותר.
            const startAge = birthYearRange ? birthYearRange.minAge : 0
            const years = mode === 'hebrew'
              ? Array.from({ length: 136 }, (_, i) => (topH - startAge) - i)
              : Array.from({ length: 136 }, (_, i) => (topG - startAge) - i)
            const curY = mode === 'hebrew' ? hc.hy : g.getFullYear()
            return (
              <div className="grid grid-cols-4 gap-1.5 max-h-[200px] overflow-y-auto">
                {years.map(y => (
                  <button key={y} type="button"
                    onClick={() => { if (mode === 'hebrew') setHc(c => ({ ...c, hy: y })); else setG(new Date(y, g.getMonth(), 1)); setView('months') }}
                    className={`py-2 rounded-lg text-sm transition-colors ltr-num ${curY === y ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-100'}`}>
                    {mode === 'hebrew' ? gematriya(y % 1000) : y}
                  </button>
                ))}
              </div>
            )
          })()}

          {/* תצוגת התאריך הנבחר בשני הלוחות */}
          {selected && (
            <p className="text-xs text-slate-400 mt-2 text-center">
              {(() => { const h = new HDate(selected); return `${gematriya(h.getDate())} ${monthName(h.getMonth(), h.getFullYear())} ${gematriya(h.getFullYear() % 1000)}` })()} · {selected.toLocaleDateString('he-IL')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
