'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// רענון חי לדפי שרת — הדשבורד ומסכי סיכום.
//
// 🔴 הדשבורד הוא Server Component: הוא נבנה פעם אחת ונשאר קפוא עד ריענון
// ידני. מנהל שהשאיר את הלשונית פתוחה ראה מספרים של לפני שעתיים, ולא היה
// לו שום סימן לכך.
//
// ⚠️ router.refresh() ולא Realtime ולא פולינג של שאילתות.
//
//   • Realtime הוסר מהמערכת פעמיים: בתכנית החינמית ה-retry loop חנק את
//     ה-main thread והאתר נתקע.
//   • פולינג שמריץ מחדש את *טעינת המסך* (כפי שהיה במסך היולדות כל 90 שניות)
//     העמיס את המסד בכל לשונית פתוחה.
//
// router.refresh() מושך רק את ה-payload של הדף מהשרת וממזג אותו לתוך העץ
// הקיים — בלי לאבד גלילה, מיקוד או מצב טפסים.
//
// 🔴 עוצר כשהלשונית מוסתרת. בלי זה 20 לשוניות פתוחות ברקע היו ממשיכות
// להכות בשרת לנצח — וזו בדיוק הייתה התקלה שבגללה הפולינג הקודם הוסר.
// כשחוזרים ללשונית מתבצע רענון מיידי, כך שמה שרואים תמיד עדכני.
// ─────────────────────────────────────────────────────────────────────────────

export default function LiveRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter()
  // ⚠️ ב-ref ולא בתלות: router מתחלף בין רינדורים ב-App Router, ותלות בו
  // הייתה מרכיבה את הטיימר מחדש שוב ושוב.
  const refresh = useRef(() => router.refresh())
  useEffect(() => { refresh.current = () => router.refresh() }, [router])

  useEffect(() => {
    const ms = Math.max(5, seconds) * 1000
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => { if (timer) { clearInterval(timer); timer = null } }
    const start = () => { if (!timer) timer = setInterval(() => refresh.current(), ms) }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // חזרה ללשונית — מרעננים מיד ולא מחכים למחזור הבא.
        refresh.current()
        start()
      } else stop()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [seconds])

  return null
}
