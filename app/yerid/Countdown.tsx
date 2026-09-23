'use client'
import { useState, useEffect } from 'react'
import { HDate } from '@hebcal/core'

// ─────────────────────────────────────────────────────────────────────────────
// ספירה לאחור לפתיחת היריד.
//
// ⚠️ התאריך העברי מחושב פעם אחת ולא בכל טיק: הוא אינו משתנה, וחישוב
// מחדש כל שנייה הוא בזבוז על ספרייה כבדה יחסית.
//
// 🔴 כל נגיעה ב-HDate עטופה: new HDate(Invalid Date) *זורק בזמן render*
// ומפיל את כל הדף — לא רק את השעון. מועד פגום ב-app_settings היה הופך
// את דף ההמתנה למסך לבן, וזו תקלה שמתגלה רק בעין.
// ─────────────────────────────────────────────────────────────────────────────

/** התאריך העברי של המועד, או null כשאי אפשר לחשב. */
function hebrewDate(target: Date): string | null {
  try {
    if (!(target instanceof Date) || Number.isNaN(target.getTime())) return null
    const s = new HDate(target).renderGematriya()
    return typeof s === 'string' && s.trim() ? s : null
  } catch {
    return null
  }
}

type Parts = { days: number; hours: number; minutes: number; seconds: number }

function partsFrom(ms: number): Parts {
  const t = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(t / 86400),
    hours: Math.floor((t % 86400) / 3600),
    minutes: Math.floor((t % 3600) / 60),
    seconds: t % 60,
  }
}

export default function Countdown({ openAt }: { openAt: string | null }) {
  const target = openAt ? new Date(openAt) : null
  const valid = target instanceof Date && !Number.isNaN(target.getTime())

  // ⚠️ מתחיל כ-null ומתמלא ב-effect: חישוב בזמן הרינדור בשרת נותן ערך
  // אחר מאשר בלקוח (השרת ב-UTC), ו-React מתלונן על אי-התאמה.
  const [left, setLeft] = useState<Parts | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!valid || !target) return
    const tick = () => {
      const ms = target.getTime() - Date.now()
      if (ms <= 0) { setDone(true); setLeft(partsFrom(0)); return }
      setLeft(partsFrom(ms))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAt])

  if (!valid || !target) return null

  const heb = hebrewDate(target)

  // ⚠️ המועד עבר אך הדף עדיין סגור — המתזמן פותח תוך דקה. אמירה
  // מפורשת עדיפה על שעון שתקוע על אפסים.
  if (done) {
    return (
      <div className="mt-10 w-full max-w-md rounded-2xl border border-[#B8860B]/40 bg-[#B8860B]/10 px-6 py-7">
        <p className="text-xl font-bold text-[#F5F0E6]">המערכת נפתחת ברגעים אלו…</p>
        <p className="mt-2 text-base text-[#F5F0E6]/70">רעננו את הדף בעוד רגע.</p>
      </div>
    )
  }

  return (
    <div className="mt-10 w-full max-w-md rounded-2xl border border-[#B8860B]/30 bg-[#F5F0E6]/5 px-6 py-7">
      <p className="text-base text-[#F5F0E6]/60">המערכת תיפתח בעז״ה</p>

      {heb && (
        <p className="mt-2 text-2xl font-bold leading-snug text-[#F5F0E6] sm:text-3xl">
          {heb}
        </p>
      )}
      <p className="mt-1 text-xl text-[#B8860B]">בשעה 10:00 בלילה</p>

      {/* ── השעון ──
          ⚠️ tabular-nums: בלי זה הספרות בעלות רוחב שונה והמספרים
          "קופצים" בכל שנייה. */}
      {left && (
        <div className="mt-6 grid grid-cols-4 gap-2" dir="ltr">
          <Unit value={left.seconds} label="שניות" />
          <Unit value={left.minutes} label="דקות" />
          <Unit value={left.hours}   label="שעות" />
          <Unit value={left.days}    label="ימים" />
        </div>
      )}
    </div>
  )
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-[#B8860B]/25 bg-[#141210]/40 py-3">
      <div className="text-2xl font-bold tabular-nums text-[#F5F0E6] sm:text-3xl">
        {String(value).padStart(2, '0')}
      </div>
      <div className="mt-0.5 text-xs text-[#F5F0E6]/50">{label}</div>
    </div>
  )
}
