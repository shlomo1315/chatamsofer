'use client'
import { useState } from 'react'
import { shouldJumpMonth, toggleStayDay, isConsecutive } from '@/lib/recoveryRange'
import { ChevronRight, ChevronLeft, Check } from 'lucide-react'

// לוח לסימון ימי השהייה בבית ההחלמה — קליל ומהיר.
// המשתמש לוחץ על יום ההגעה, והמערכת משלימה אוטומטית את יום הסיום לפי מספר הלילות
// שאושרו (maxNights). לא ניתן לחרוג ממספר הלילות, ולא לצאת מחלון 5 השבועות האחרונים.
//
// ⚠️ יום ההגעה מוגבל לעבר (עד היום) — אי אפשר להצהיר שיולדת "הגיעה" מחר.
// אבל *ימי השהייה* שאחריו נמשכים קדימה, גם אל תוך העתיד: מי שמסמן שהיולדת
// הגיעה היום עדיין זכאי ליומיים (או לארבעה) והם מסומנים מיד. עד כה יום
// העזיבה נגזם ליום הנוכחי, ולכן סימון של היום נתן יום בודד — והנציג לא יכול
// היה לרשום את הזכאות המלאה עד שהימים היו חולפים בפועל.
//
// 🔴 מחזיר *רשימת ימים* (ISO, ממוינת) ולא טווח.
// ברירת המחדל עדיין רצף: לחיצה ראשונה מסמנת את יום ההגעה ואת הימים שאחריו.
// לחיצה על יום מסומן מבטלת אותו, ולחיצה על יום אחר מוסיפה אותו כיום נפרד —
// ליולדת ששהתה יום אחד ועוד יום כעבור כמה ימים. ראו toggleStayDay.
// ⚠️ לעולם לא יותר ימים מ-maxDays.

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
  dates: string[]                       // הימים שנבחרו (ISO, ממוינים)
  onChange: (dates: string[]) => void
  /** היום האחרון בחלון הזכאות (ISO) — תקרה לימים שנוספים ידנית. */
  lastDay?: string | null
}

export default function RecoveryDatePicker({ maxDays, dates, onChange, lastDay }: Props) {
  const today = startOfDay(new Date())
  const minDate = new Date(today.getTime() - WINDOW_DAYS * DAY_MS)
  // חודש התצוגה — מתחיל מחודש היום, ניתן לדפדף אחורה עד חלון הזכאות
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const selected = [...dates].sort()
  const fromD = selected.length ? parseISO(selected[0]) : null
  const toD = selected.length ? parseISO(selected[selected.length - 1]) : null
  // תקרת הימים שנוספים ידנית: סוף חלון הזכאות, ובהיעדרו — 35 יום קדימה
  const lastD = lastDay ? parseISO(lastDay) : new Date(today.getTime() + WINDOW_DAYS * DAY_MS)

  // בניית תאי החודש (כולל ריפוד לתחילת השבוע)
  const firstDow = viewMonth.getDay()
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d))

  // ⚠️ יום ההגעה (הלחיצה הראשונה) — לא בעתיד. ימים שנוספים אחריו ידנית
  // יכולים ליפול גם קדימה, עד סוף חלון הזכאות, וכל יום מסומן ניתן לביטול.
  const isSelected = (d: Date) => selected.includes(iso(d))
  const canPick = (d: Date) => {
    if (isSelected(d)) return true
    if (d.getTime() < minDate.getTime()) return false
    if (selected.length === 0 || selected.length >= maxDays) return d.getTime() <= today.getTime()
    return d.getTime() <= lastD.getTime()
  }

  function pickDay(d: Date) {
    if (!canPick(d)) return
    const next = toggleStayDay(selected, iso(startOfDay(d)), maxDays)
    onChange(next)

    // 🔴 קפיצה לחודש שבו היום האחרון נמצא.
    //
    // ⚠️ ביום האחרון של החודש, היציאה נופלת בחודש הבא — והלוח נשאר על
    // החודש הנוכחי. היולדת רואה תא אחד מסומן ומניחה שהסימון נכשל,
    // בזמן שהטווח נשמר נכון. רק כשנוצר רצף חדש — לא בביטול או בהוספה ידנית.
    const last = next[next.length - 1]
    if (selected.length === 0 && last && shouldJumpMonth(last, viewMonth)) {
      const [y, m] = last.split('-').map(Number)
      setViewMonth(new Date(y, m - 1, 1))
    }
  }

  // היום המרוחק ביותר שאפשר להגיע אליו בסימון — הגעה היום + מלוא הזכאות.
  // משמש לניווט קדימה, כדי שטווח שנמשך לחודש הבא יהיה גלוי.
  const maxSelectable = new Date(Math.max(today.getTime() + (maxDays - 1) * DAY_MS, toD?.getTime() ?? 0))
  const monthIdx = (d: Date) => d.getFullYear() * 12 + d.getMonth()
  const canGoBack = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getTime() > minDate.getTime()
  const canGoFwd = monthIdx(viewMonth) < monthIdx(maxSelectable)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 select-none" dir="rtl">
      {/* הנחיה */}
      <p className="text-xs text-slate-500 leading-relaxed mb-2 text-center">
        נא סמנו את היום הראשון שבו היולדת הגיעה — המערכת תסמן אוטומטית את שאר הימים בהתאם לזכאות שקיבלה.
        <span className="block mt-0.5 text-slate-400">שהתה בימים נפרדים? לחצו על יום מסומן כדי לבטל אותו, ועל יום אחר כדי להוסיף אותו.</span>
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
          const pickable = canPick(d)
          const sel = isSelected(d)
          const isArrival = fromD && d.getTime() === fromD.getTime()
          return (
            <button
              key={iso(d)}
              type="button"
              onClick={() => pickDay(d)}
              disabled={!pickable}
              // ⚠️ הסימון גובר על "אינו לחיץ": ימי הזכאות שאחרי ההגעה נופלים
              // בעתיד ואינם ניתנים ללחיצה, אבל חייבים להיראות מסומנים — אחרת
              // הנציג מסמן יום ורואה תא בודד, בלי שום חיווי לשאר הימים.
              className={`aspect-square rounded-lg text-xs font-semibold transition-colors relative
                ${sel ? `bg-pink-600 text-white${pickable ? '' : ' cursor-default'}`
                  : !pickable ? 'text-slate-300 cursor-not-allowed'
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
            {selected.length} מתוך {maxDays} ימים · {isConsecutive(selected)
              ? (selected.length > 1 ? `${fromD.toLocaleDateString('he-IL')} – ${toD.toLocaleDateString('he-IL')}` : fromD.toLocaleDateString('he-IL'))
              : selected.map(x => parseISO(x).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })).join(' · ')}
            {toD.getTime() > today.getTime() && (
              <span className="block font-normal text-slate-400 mt-0.5">כולל ימי זכאות שטרם חלפו</span>
            )}
            {fromD.getTime() > today.getTime() && (
              <span className="block font-normal text-red-500 mt-0.5">היום הראשון אינו יכול להיות בעתיד</span>
            )}
          </span>
        ) : (
          <span>סמנו את יום ההגעה ({maxDays} ימי זכאות)</span>
        )}
      </div>
    </div>
  )
}
