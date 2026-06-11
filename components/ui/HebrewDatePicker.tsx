'use client'
import { useState, useEffect } from 'react'
import { HDate, gematriya } from '@hebcal/core'

// שמות החודשים העבריים (מספור hebcal: 1=ניסן … 7=תשרי … 12/13=אדר)
const HEB_MONTHS: Record<number, string> = {
  1: 'ניסן', 2: 'אייר', 3: 'סיון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
  7: 'תשרי', 8: 'חשון', 9: 'כסלו', 10: 'טבת', 11: 'שבט', 12: 'אדר', 13: 'אדר ב׳',
}
function monthName(m: number, year: number): string {
  if (m === 12 && HDate.isLeapYear(year)) return 'אדר א׳'
  return HEB_MONTHS[m] ?? String(m)
}
// סדר החודשים בשנה האזרחית-יהודית (מתשרי): 7..12(,13),1..6
function monthsOrder(year: number): number[] {
  const base = [7, 8, 9, 10, 11, 12]
  if (HDate.isLeapYear(year)) base.push(13)
  return [...base, 1, 2, 3, 4, 5, 6]
}
function toIso(d: number, m: number, y: number): string {
  const days = HDate.daysInMonth(m, y)
  const g = new HDate(Math.min(d, days), m, y).greg()
  return `${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, '0')}-${String(g.getDate()).padStart(2, '0')}`
}

// בורר תאריך עברי (יום/חודש/שנה) — שומר ומחזיר תאריך לועזי בפורמט ISO (YYYY-MM-DD)
export default function HebrewDatePicker({ value, onChange, maxToday = false }: {
  value: string
  onChange: (iso: string) => void
  maxToday?: boolean
}) {
  const [d, setD] = useState<number | ''>('')
  const [m, setM] = useState<number | ''>('')
  const [y, setY] = useState<number | ''>('')

  // סנכרון מערך-ערך חיצוני (כולל איפוס)
  useEffect(() => {
    if (value) {
      const dt = new Date(value)
      if (!isNaN(dt.getTime())) {
        const h = new HDate(dt)
        setD(h.getDate()); setM(h.getMonth()); setY(h.getFullYear())
        return
      }
    }
    setD(''); setM(''); setY('')
  }, [value])

  const todayY = new HDate(new Date()).getFullYear()
  const years = Array.from({ length: 16 }, (_, i) => todayY + 1 - i) // השנה +1 עד 14 שנים אחורה
  const selY = typeof y === 'number' ? y : todayY
  const monthsList = monthsOrder(selY)
  const selM = typeof m === 'number' ? m : 7
  const daysInM = HDate.daysInMonth(selM, selY)

  const emit = (nd: number | '', nm: number | '', ny: number | '') => {
    setD(nd); setM(nm); setY(ny)
    if (typeof nd === 'number' && typeof nm === 'number' && typeof ny === 'number') {
      const iso = toIso(nd, nm, ny)
      // לא לאפשר תאריך עתידי כשנדרש
      if (maxToday && new Date(iso) > new Date()) { onChange(new Date().toISOString().split('T')[0]); return }
      onChange(iso)
    }
  }

  const selCls = 'rounded-lg border border-slate-300 px-2 py-2.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400'
  const greg = value ? new Date(value) : null

  return (
    <div>
      <div className="grid grid-cols-3 gap-2" dir="rtl">
        <select className={selCls} value={d} onChange={e => emit(e.target.value ? +e.target.value : '', m, y)}>
          <option value="">יום</option>
          {Array.from({ length: daysInM }, (_, i) => i + 1).map(n => <option key={n} value={n}>{gematriya(n)}</option>)}
        </select>
        <select className={selCls} value={m} onChange={e => emit(d, e.target.value ? +e.target.value : '', y)}>
          <option value="">חודש</option>
          {monthsList.map(mm => <option key={mm} value={mm}>{monthName(mm, selY)}</option>)}
        </select>
        <select className={selCls} value={y} onChange={e => emit(d, m, e.target.value ? +e.target.value : '')}>
          <option value="">שנה</option>
          {years.map(yy => <option key={yy} value={yy}>{gematriya(yy % 1000)}</option>)}
        </select>
      </div>
      {greg && <p className="text-xs text-slate-400 mt-1.5">לועזי: {greg.toLocaleDateString('he-IL')}</p>}
    </div>
  )
}
