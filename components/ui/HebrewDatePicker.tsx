'use client'
import { useState, useEffect, useRef } from 'react'
import { HDate, gematriya } from '@hebcal/core'
import { Calendar, ChevronRight, ChevronLeft } from 'lucide-react'

const HEB_MONTHS: Record<number, string> = {
  1: 'ניסן', 2: 'אייר', 3: 'סיון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
  7: 'תשרי', 8: 'חשון', 9: 'כסלו', 10: 'טבת', 11: 'שבט', 12: 'אדר', 13: 'אדר ב׳',
}
function monthName(m: number, year: number): string {
  if (m === 12 && HDate.isLeapYear(year)) return 'אדר א׳'
  return HEB_MONTHS[m] ?? String(m)
}
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] // ראשון..שבת
const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const sameYMD = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

type Cell = { date: Date; label: string } | null

export default function HebrewDatePicker({ value, onChange, maxToday = true }: {
  value: string
  onChange: (iso: string) => void
  maxToday?: boolean
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const selected = value ? new Date(value) : null
  if (selected) selected.setHours(0, 0, 0, 0)

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'hebrew' | 'gregorian'>('hebrew')
  const [g, setG] = useState<Date>(selected ?? today)               // חודש לועזי מוצג
  const [hc, setHc] = useState(() => { const h = new HDate(selected ?? today); return { hy: h.getFullYear(), hm: h.getMonth() } })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
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

  const cells = mode === 'hebrew' ? hebCells() : gregCells()
  const header = mode === 'hebrew'
    ? `${monthName(hc.hm, hc.hy)} ${gematriya(hc.hy % 1000)}`
    : g.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })

  const triggerLabel = selected
    ? (() => { const h = new HDate(selected); return `${gematriya(h.getDate())} ${monthName(h.getMonth(), h.getFullYear())} ${gematriya(h.getFullYear() % 1000)}  ·  ${selected.toLocaleDateString('he-IL')}` })()
    : 'בחר תאריך…'

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
              <button key={k} type="button" onClick={() => setMode(k)}
                className={`py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* ניווט חודשים */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={mode === 'hebrew' ? hPrev : gPrev} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="חודש קודם"><ChevronRight size={18} /></button>
            <span className="text-sm font-bold text-slate-800">{header}</span>
            <button type="button" disabled={nextDisabled} onClick={mode === 'hebrew' ? hNext : gNext}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed" title="חודש הבא"><ChevronLeft size={18} /></button>
          </div>

          {/* ימות השבוע */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(d => <div key={d} className="text-center text-[11px] font-semibold text-slate-400 py-1">{d}</div>)}
          </div>

          {/* ימים */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c, i) => {
              if (!c) return <div key={i} />
              const disabled = maxToday && c.date > today
              const isSel = selected && sameYMD(c.date, selected)
              const isToday = sameYMD(c.date, today)
              return (
                <button key={i} type="button" disabled={disabled} onClick={() => pick(c.date)}
                  className={`h-9 rounded-lg text-sm flex items-center justify-center transition-colors
                    ${isSel ? 'bg-indigo-600 text-white font-bold'
                      : disabled ? 'text-slate-300 cursor-not-allowed'
                      : isToday ? 'bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100'
                      : 'text-slate-700 hover:bg-slate-100'}`}>
                  {c.label}
                </button>
              )
            })}
          </div>

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
