'use client'
import { useState, useEffect } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { deadlineState, formatCountdown } from '@/lib/centerDeadline'

// ─────────────────────────────────────────────────────────────────────────────
// ספירה לאחור למועד האחרון.
//
// 🔴 מרכיב אחד לכל המסכים. ספירה שכל מסך מחשב בעצמו מתפצלת ברגע
// שמשנים את הניסוח, והמשפחה רואה מספר אחד באתר ושומעת אחר בטלפון.
//
// ⚠️ מתעדכן כל דקה ולא כל שנייה: הניסוח ממילא בדיוק של דקות, ורענון
// לשווא כל שנייה מדליק רינדור מיותר בכל המסך.
// ─────────────────────────────────────────────────────────────────────────────

export default function DeadlineCountdown({
  deadline, className = '', prefix = 'המערכת תיסגר לבחירת המוקד בעוד',
}: {
  /** ISO. null/ריק = אין מועד, ואין מה להציג. */
  deadline: string | null | undefined
  className?: string
  prefix?: string
}) {
  // ⚠️ מתחיל ב-null ולא בזמן הנוכחי: השרת והלקוח היו מרנדרים שתי
  // שעות שונות, ו-React מתלונן על אי-התאמת hydration.
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    // ⚠️ הקריאה הראשונה דרך הטיימר ולא ישירות בגוף האפקט:
    // setState סינכרוני באפקט מפעיל רינדור נוסף מיד (ונאסר בלינט).
    // requestAnimationFrame רץ אחרי הציור הראשון, כך שהערך נקבע
    // בפריים הבא במקום בתוך הרינדור עצמו.
    const first = requestAnimationFrame(() => setNow(new Date()))
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => { cancelAnimationFrame(first); clearInterval(t) }
  }, [])

  if (!deadline || !now) return null

  const { closed, msLeft } = deadlineState(deadline, now)
  if (msLeft === null) return null

  if (closed) {
    return (
      <p className={`inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-800 ${className}`}>
        <AlertTriangle size={13} /> המועד לבחירת המוקד הסתיים
      </p>
    )
  }

  // 🔴 פחות מ-24 שעות — צבע אזהרה. ⚠️ אותו טקסט, רק בולט יותר:
  // משפחה שנשארו לה שעות בודדות חייבת לראות זאת ולא לקרוא מספר.
  const urgent = msLeft < 24 * 60 * 60 * 1000

  return (
    <p className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-bold ${
      urgent
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-slate-50 text-slate-700'
    } ${className}`}>
      <Clock size={13} /> {prefix} {formatCountdown(msLeft)}
    </p>
  )
}
