'use client'
import { useState } from 'react'
import { ChevronRight, ChevronLeft, Check } from 'lucide-react'

// לוח לסימון ימי השהייה בבית ההחלמה — קליל ומהיר.
// המשתמש לוחץ על יום ההגעה, והמערכת משלימה אוטומטית את יום הסיום לפי מספר הלילות
// שאושרו (maxNights). לא ניתן לחרוג ממספר הלילות, ולא לצאת מחלון 5 השבועות האחרונים.
//
// טווח מוחזר כמחרוזות ISO (YYYY-MM-DD): from = יום ראשון, to = יום אחרון.

const DAY_MS = 86400000
const WINDOW_DAYS = 35   // 5 שבועות אחורה — חלון הזכאות

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const HE_DOW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function parseISO(s: string): Date { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd) }

interface Props {
  maxDays: number                       // מספר ימי הזכאות (2 רגילה / 4 תאומים) — סה"כ תאים לסימון
  from: string | null                   // יום הגעה נבחר (ISO)
  to: string | null                     // יום אחרון נבחר (ISO)
  onChange: (from: string | null, to: string | null) => void
}

export default function RecoveryDatePicker({ maxDays, from, to, onChange }: Props) {
  const today = startOfDay(new Date())
  const minDate = new Date(today.getTime() - WINDOW_DAYS * DAY_MS)
  // חודש התצוגה — מתחיל מחודש היום, ניתן לדפדף אחורה עד חלון הזכאות
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const fromD = from ? parseISO(from) : null
  const toD = to ? parseISO(to) : null

  // בניית תאי החודש (כולל ריפוד לתחילת השבוע)
  const firstDow = viewMonth.getDay()
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d))

  const inRange = (d: Date) => d.getTime() >= minDate.getTime() && d.getTime() <= today.getTime()
  const isSelected = (d: Date) => {
    if (!fromD) return false
    if (!toD) return d.getTime() === fromD.getTime()
    return d.getTime() >= fromD.getTime() && d.getTime() <= toD.getTime()
  }

  function pickDay(d: Date) {
    if (!inRange(d)) return
    // לחיצה על יום ההגעה → המערכת מסמנת סה"כ maxDays ימים (כולל יום ההגעה).
    // זכאות של 2 ימים = 2 תאים בסך הכל (הגעה + יום נוסף), לא 3.
    const arrival = startOfDay(d)
    let departure = new Date(arrival.getTime() + (maxDays - 1) * DAY_MS)
    if (departure.getTime() > today.getTime()) departure = today   // לא חורגים מהיום
    onChange(iso(arrival), iso(departure))
  }

  const canGoBack = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getTime() > minDate.getTime()
  const canGoFwd = viewMonth.getMonth() < today.getMonth() || viewMonth.getFullYear() < today.getFullYear()

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 select-none" dir="rtl">
      {/* הנחיה */}
      <p className="text-xs text-slate-500 leading-relaxed mb-2 text-center">
        נא סמנו את היום הראשון שבו היולדת הגיעה — המערכת תסמן אוטומטית את שאר הימים בהתאם לזכאות שקיבלה.
      </p>
      {/* כותרת חודש + ניווט */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => canGoBack && setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          disabled={!canGoBack}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight size={16} />
        </button>
        <span className="text-sm font-bold text-slate-800">{HE_MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</span>
        <button type="button" onClick={() => canGoFwd && setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          disabled={!canGoFwd}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* ימות השבוע */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {HE_DOW.map(d => <div key={d} className="text-center text-[11px] font-semibold text-slate-400 py-1">{d}</div>)}
      </div>

      {/* התאים */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const enabled = inRange(d)
          const sel = isSelected(d)
          const isArrival = fromD && d.getTime() === fromD.getTime()
          return (
            <button
              key={iso(d)}
              type="button"
              onClick={() => pickDay(d)}
              disabled={!enabled}
              className={`aspect-square rounded-lg text-xs font-semibold transition-colors relative
                ${!enabled ? 'text-slate-300 cursor-not-allowed'
                  : sel ? 'bg-pink-600 text-white'
                  : 'text-slate-700 hover:bg-pink-50'}`}
            >
              {d.getDate()}
              {isArrival && <span className="absolute -top-0.5 -right-0.5"><Check size={10} className="text-white bg-pink-700 rounded-full p-0.5" /></span>}
            </button>
          )
        })}
      </div>

      {/* חיווי הטווח שנבחר */}
      <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500 text-center">
        {fromD && toD ? (
          <span className="font-semibold text-slate-700">
            {Math.round((toD.getTime() - fromD.getTime()) / DAY_MS) + 1} ימים · {fromD.toLocaleDateString('he-IL')} – {toD.toLocaleDateString('he-IL')}
          </span>
        ) : (
          <span>סמנו את יום ההגעה ({maxDays} ימי זכאות)</span>
        )}
      </div>
    </div>
  )
}
